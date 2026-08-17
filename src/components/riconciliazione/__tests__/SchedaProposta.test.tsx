import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SchedaProposta } from '../SchedaProposta'
import { installaStubDom } from '@/components/scadenzario/__tests__/render-helpers'
import type { PropostaDiRiconciliazione } from '@/types/riconciliazione-assistita'

beforeAll(() => installaStubDom())

/**
 * La causale vera di un bonifico: 180 caratteri, con dentro il nome del
 * fornitore e il numero della fattura. È l'unica cosa che il motore ha letto,
 * quindi è l'unica cosa su cui chi decide può controllarlo.
 */
const CAUSALE =
  'Bonifico tramite Internet Banking a favore di ROMA GIANFRANCO SRL - PAGAMENTO FATTURA FT 177 DEL 12/07/2026 - RIF. ORDINE 4471/A - TRN AB12345678901234567890123456'

const PROPOSTA: PropostaDiRiconciliazione = {
  id: 'p1',
  regola: 'R1',
  punteggio: 98,
  fattori: { importo: 30, riferimento: 20, controparte: 18, data: 15, codiceBanca: 10, unicita: 5 },
  motivazioni: [
    { testo: 'Importo identico al residuo', segno: '+' },
    { testo: 'Nome della controparte presente nella causale', segno: '+' },
    { testo: 'Pagato 32 giorni dopo la scadenza', segno: '-' },
  ],
  stato: 'in_attesa',
  bankTransaction: {
    id: 'b1',
    transactionDate: '2026-08-14T00:00:00.000Z',
    description: CAUSALE,
    amount: '-459.80',
  },
  gambe: [
    {
      id: 'g1',
      importo: '459.80',
      schedule: {
        id: 's1',
        descrizione: 'Rata 1 di 3 - Fattura 177',
        dataScadenza: '2026-07-13T00:00:00.000Z',
        numeroDocumento: 'FT 177',
        controparteNome: 'Roma Gianfranco S.r.l.',
        importoTotale: '459.80',
        importoPagato: '0',
        invoice: { id: 'i1', invoiceNumber: 'FDI/0000177', supplierName: 'Roma Gianfranco S.r.l.' },
      },
    },
  ],
}

function monta(
  proposta: PropostaDiRiconciliazione = PROPOSTA,
  callback: {
    onApprova?: (id: string) => Promise<void>
    onScarta?: (id: string, opzioni: { perSempre: boolean; motivo?: string }) => Promise<void>
  } = {}
) {
  const onApprova = vi.fn(callback.onApprova ?? (async () => {}))
  const onScarta = vi.fn(callback.onScarta ?? (async () => {}))
  render(<SchedaProposta proposta={proposta} onApprova={onApprova} onScarta={onScarta} />)
  return { onApprova, onScarta }
}

describe('SchedaProposta', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mostra il punteggio e i sei fattori', () => {
    monta()

    expect(screen.getByText('98')).toBeInTheDocument()
    // Ogni segmento dice quanto ha preso e quanto poteva prendere: «18» da solo
    // non si legge, «18/20» sì — è il fattore che non ha fatto il pieno.
    expect(screen.getByText('Importo')).toBeInTheDocument()
    expect(screen.getByText('30/30')).toBeInTheDocument()
    expect(screen.getByText('Riferimento')).toBeInTheDocument()
    expect(screen.getByText('20/20')).toBeInTheDocument()
    expect(screen.getByText('Controparte')).toBeInTheDocument()
    expect(screen.getByText('18/20')).toBeInTheDocument()
    expect(screen.getByText('Data')).toBeInTheDocument()
    expect(screen.getByText('15/15')).toBeInTheDocument()
    expect(screen.getByText('Codice banca')).toBeInTheDocument()
    expect(screen.getByText('10/10')).toBeInTheDocument()
    expect(screen.getByText('Unicità')).toBeInTheDocument()
    expect(screen.getByText('5/5')).toBeInTheDocument()
  })

  it('mostra le motivazioni positive e negative col loro segno', () => {
    // Le negative sono quelle che fanno decidere: si mostrano, non si nascondono.
    monta()

    const positiva = screen.getByText('Importo identico al residuo').closest('li')
    expect(positiva?.textContent).toContain('✓')

    const negativa = screen.getByText('Pagato 32 giorni dopo la scadenza').closest('li')
    expect(negativa).not.toBeNull()
    expect(negativa?.textContent).toContain('✗')
  })

  it('mostra la causale intera del movimento, non troncata', () => {
    monta()

    const causale = screen.getByText(CAUSALE)
    expect(causale.textContent).toBe(CAUSALE)
    // `truncate` e `line-clamp-*` tagliano il testo dove serve leggerlo tutto:
    // è dentro la causale che stanno il nome del fornitore e il numero fattura.
    expect(causale.className).not.toContain('truncate')
    expect(causale.className).not.toContain('line-clamp')
  })

  it('«Approva» chiama la rotta della proposta', async () => {
    // La rotta la chiama il genitore, che poi invalida la query del lotto: alla
    // scheda si chiede di passargli l'id della proposta giusta, una volta sola.
    const { onApprova } = monta()

    fireEvent.click(screen.getByRole('button', { name: 'Approva' }))

    await waitFor(() => expect(onApprova).toHaveBeenCalledWith('p1'))
    expect(onApprova).toHaveBeenCalledTimes(1)
  })

  it('«Non propormelo mai più» chiede conferma prima di chiamare', async () => {
    const { onScarta } = monta()

    fireEvent.click(screen.getByRole('button', { name: 'Non propormelo mai più' }))
    // Il clic apre la conferma e basta: l'esclusione permanente sopravvive al
    // lotto, quindi non deve poter partire per sbaglio.
    expect(onScarta).not.toHaveBeenCalled()

    await waitFor(() => expect(screen.getByRole('alertdialog')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Conferma' }))

    await waitFor(() => expect(onScarta).toHaveBeenCalledWith('p1', { perSempre: true, motivo: undefined }))
  })

  it('l\'errore del server resta visibile e non chiude la scheda', async () => {
    // Il 409 «superata» dice che la scadenza è stata pagata altrove: è
    // l'informazione che serve per capire perché l'approvazione non è passata,
    // e in un toast che sparisce dopo tre secondi non la legge nessuno.
    const messaggio = 'La scadenza è pagata: la proposta non è più valida'
    const { onScarta } = monta(PROPOSTA, {
      onApprova: async () => {
        throw new Error(messaggio)
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Approva' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(messaggio))
    // La scheda resta aperta e riprovabile: la causale è ancora lì e i tre
    // pulsanti sono di nuovo attivi.
    expect(screen.getByText(CAUSALE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approva' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Salta per ora' }))
    await waitFor(() => expect(onScarta).toHaveBeenCalledWith('p1', { perSempre: false, motivo: undefined }))
  })
})
