import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { ImportaFattureWizard } from '../ImportaFattureWizard'
import { xmlFattura } from '@/test/factories/fattura-xml.factory'

/**
 * jsdom (l'ambiente di questa suite) non implementa `Blob/File.text()` né
 * `.arrayBuffer()` — lo stesso limite documentato in
 * `lib/sdi/__tests__/lettura-file.test.ts`, che per questo gira in ambiente
 * Node puro. Qui serve invece il DOM vero per montare il wizard e pilotare
 * l'`<input type="file">`, quindi si ripara i due metodi con `FileReader`,
 * che jsdom implementa correttamente: `leggiFileFattura` li usa per leggere
 * il contenuto dei file scelti.
 */
if (typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function (this: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsText(this)
    })
  }
}
if (typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function (this: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(this)
    })
  }
}

const XML_MINIMO = xmlFattura({ numero: '42', data: '2026-06-01', piva: '07945211006' })

/**
 * Deposita i file sull'input e lascia sfogare la lettura asincrona.
 *
 * L'idioma del progetto è `fireEvent`, non `userEvent`: i primitivi Radix usati
 * qui (radio, checkbox) rispondono a un click diretto e non richiedono la
 * simulazione degli eventi di puntatore. Vedi la revisione del Task 7.
 */
async function caricaFile(input: HTMLInputElement, ...files: File[]) {
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  await act(async () => {
    fireEvent.change(input)
  })
}

/**
 * Legge il numero mostrato dal pannello «Verifica integrità importazione»
 * accanto a un'etichetta: il valore è il testo del paragrafo che la precede
 * nel markup di `RiepilogoFinale` (Task 11), non un elemento con un ruolo o
 * un `data-testid` proprio.
 */
function leggiValorePannello(etichetta: string): string | null {
  const regione = screen.getByRole('region', { name: /verifica integrità importazione/i })
  const nodoEtichetta = within(regione).getByText(etichetta)
  return nodoEtichetta.previousElementSibling?.textContent ?? null
}

beforeEach(() => {
  global.fetch = vi.fn(async (url: string) => {
    if (String(url).includes('verifica-duplicati')) {
      return { ok: true, status: 200, json: async () => ({ duplicati: [] }) } as Response
    }
    if (String(url).includes('conflitti-termini')) {
      return { ok: true, status: 200, json: async () => ({ conflitti: [] }) } as Response
    }
    return { ok: true, status: 201, json: async () => ({ id: 'nuova-1' }) } as Response
  }) as never
})

describe('ImportaFattureWizard', () => {
  it('porta un XML dal caricamento al riepilogo', async () => {
    render(<ImportaFattureWizard open onOpenChange={vi.fn()} onImportComplete={vi.fn()} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await caricaFile(input, new File([XML_MINIMO], 'IT07945211006_001.xml', { type: 'application/xml' }))

    // Passo 2 — PassoAnteprima (Task 8) usa sempre il plurale «fatture trovate»,
    // anche con una sola riga: non fa distinzione singolare/plurale.
    expect(await screen.findByText(/1 fatture trovate nei file caricati/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /avvia importazione/i }))

    // Passo 3 → riepilogo
    expect(await screen.findByText(/importazione completata/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /1 importate/i })).toBeInTheDocument()
  })

  it('apre la finestra dei conflitti quando ce ne sono', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (String(url).includes('verifica-duplicati')) {
        return { ok: true, status: 200, json: async () => ({ duplicati: [] }) } as Response
      }
      if (String(url).includes('conflitti-termini')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            // `aliquote` è obbligatorio su `ConflittoTermini` (Task 5/9): l'API
            // reale lo valorizza sempre, qui va aggiunto a mano per non far
            // saltare `DialogConflitti`, che lo usa senza controllo di nullità.
            conflitti: [{ partitaIva: '07945211006', denominazione: 'FORNITORE SPA', giorniDalFile: 30, giorniAnagrafica: 60, aliquote: [22], chiavi: ['IT07945211006_001.xml'] }],
          }),
        } as Response
      }
      return { ok: true, status: 201, json: async () => ({ id: 'nuova-1' }) } as Response
    }) as never

    render(<ImportaFattureWizard open onOpenChange={vi.fn()} onImportComplete={vi.fn()} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await caricaFile(input, new File([XML_MINIMO], 'IT07945211006_001.xml', { type: 'application/xml' }))

    fireEvent.click(await screen.findByRole('button', { name: /avvia importazione/i }))

    expect(await screen.findByText(/termini di pagamento in conflitto/i)).toBeInTheDocument()
  })

  /**
   * I tre test seguenti sono la protezione nel tempo che il primo giro non
   * dava (revisione del Task 12, Important #2): senza di loro, riportare
   * `fattureCreate`/`fornitoriCreati` a un conteggio lato client — l'esatto
   * anti-pattern che questo componente doveva evitare — lascerebbe la suite
   * verde. `verifica-duplicati` viene chiamata due volte in un giro completo:
   * la prima da `handleFileScelti` (marca i duplicati in anteprima), la
   * seconda da `onEsecuzioneFinita` (rilegge dal database chi è stato
   * scritto davvero) — i due mock qui sotto le distinguono per contarle,
   * non per URL, che è identico in entrambe.
   */
  it('fattureCreate viene dalla rilettura del database, non dal conteggio del client', async () => {
    let chiamateVerificaDuplicati = 0
    global.fetch = vi.fn(async (url: string) => {
      if (String(url).includes('verifica-duplicati')) {
        chiamateVerificaDuplicati += 1
        // Prima chiamata (anteprima): nessun duplicato, è un import nuovo.
        // Seconda chiamata (rilettura a fine esecuzione): la fattura appena
        // scritta ora esiste, quindi risulta fra i «duplicati» — è così che
        // la rilettura la conta come creata per davvero.
        const duplicati =
          chiamateVerificaDuplicati >= 2
            ? [{ chiave: 'IT07945211006_001.xml', idEsistente: 'id-1', statoEsistente: 'IMPORTED', importataIl: new Date().toISOString() }]
            : []
        return { ok: true, status: 200, json: async () => ({ duplicati }) } as Response
      }
      if (String(url).includes('conflitti-termini')) {
        return { ok: true, status: 200, json: async () => ({ conflitti: [] }) } as Response
      }
      return { ok: true, status: 201, json: async () => ({ id: 'nuova-1', fornitoreCreato: false }) } as Response
    }) as never

    render(<ImportaFattureWizard open onOpenChange={vi.fn()} onImportComplete={vi.fn()} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await caricaFile(input, new File([XML_MINIMO], 'IT07945211006_001.xml', { type: 'application/xml' }))

    fireEvent.click(await screen.findByRole('button', { name: /avvia importazione/i }))
    expect(await screen.findByText(/importazione completata/i)).toBeInTheDocument()

    expect(leggiValorePannello('Fatture create nel database')).toBe('1')
    expect(screen.queryByText(/il conteggio non corrisponde/i)).not.toBeInTheDocument()
  })

  it('fornitoriCreati viene dal flag della risposta 201, non da un conteggio proprio', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (String(url).includes('verifica-duplicati')) {
        return { ok: true, status: 200, json: async () => ({ duplicati: [] }) } as Response
      }
      if (String(url).includes('conflitti-termini')) {
        return { ok: true, status: 200, json: async () => ({ conflitti: [] }) } as Response
      }
      return { ok: true, status: 201, json: async () => ({ id: 'nuova-1', fornitoreCreato: true }) } as Response
    }) as never

    render(<ImportaFattureWizard open onOpenChange={vi.fn()} onImportComplete={vi.fn()} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await caricaFile(input, new File([XML_MINIMO], 'IT07945211006_001.xml', { type: 'application/xml' }))

    fireEvent.click(await screen.findByRole('button', { name: /avvia importazione/i }))
    expect(await screen.findByText(/importazione completata/i)).toBeInTheDocument()

    expect(leggiValorePannello('Fornitori creati')).toBe('1')
  })

  it('mostra l\'avviso di discrepanza quando la rilettura non trova le fatture appena importate', async () => {
    global.fetch = vi.fn(async (url: string) => {
      // Sempre vuota, anche alla rilettura di fine esecuzione: simula una
      // scrittura che non risulta al secondo giro (caso che il pannello deve
      // saper segnalare, non solo il caso in cui tutto torna).
      if (String(url).includes('verifica-duplicati')) {
        return { ok: true, status: 200, json: async () => ({ duplicati: [] }) } as Response
      }
      if (String(url).includes('conflitti-termini')) {
        return { ok: true, status: 200, json: async () => ({ conflitti: [] }) } as Response
      }
      return { ok: true, status: 201, json: async () => ({ id: 'nuova-1', fornitoreCreato: false }) } as Response
    }) as never

    render(<ImportaFattureWizard open onOpenChange={vi.fn()} onImportComplete={vi.fn()} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await caricaFile(input, new File([XML_MINIMO], 'IT07945211006_001.xml', { type: 'application/xml' }))

    fireEvent.click(await screen.findByRole('button', { name: /avvia importazione/i }))
    expect(await screen.findByText(/importazione completata/i)).toBeInTheDocument()

    expect(leggiValorePannello('Fatture create nel database')).toBe('0')
    expect(screen.getByText(/il conteggio non corrisponde: 1 dichiarate, 0 create/i)).toBeInTheDocument()
  })
})
