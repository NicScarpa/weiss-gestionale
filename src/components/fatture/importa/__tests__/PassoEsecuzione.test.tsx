import { describe, it, expect, vi, afterEach } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { PassoEsecuzione } from '../PassoEsecuzione'
import { OPZIONI_PREDEFINITE } from '../tipi'
import type { OpzioniImport } from '../tipi'
import type { RigaAnteprima } from '../PassoAnteprima'
import type { EsitoRiga } from '../RiepilogoFinale'

/**
 * `PassoEsecuzione` manda le fatture al server: qui simuliamo solo le
 * risposte HTTP, non l'API vera (stesso principio degli altri test che
 * mockano `fetch`, es. `InvoiceDetail.test.tsx`).
 */

const riga = (sovrascrivi: Partial<RigaAnteprima> = {}): RigaAnteprima => ({
  chiave: 'a.xml',
  nomeFile: 'a.xml',
  xmlContent: '<x/>',
  daZip: null,
  numero: '42',
  data: '2026-06-01',
  tipoDocumento: 'TD01',
  denominazioneFornitore: 'Torrefazione di prova Srl',
  partitaIvaFornitore: '07945211006',
  denominazioneCliente: 'Weiss Cafe',
  netAmount: 100,
  vatAmount: 22,
  totalAmount: 122,
  aliquote: [22],
  primaScadenza: '2026-07-01',
  scadenzaStimata: false,
  giorniDalFile: 30,
  ritenuta: null,
  duplicata: false,
  esclusa: false,
  ...sovrascrivi,
})

/** Coppia promessa/risolvi: per tenere una `fetch` sospesa finché il test
 * non decide di farla rispondere — serve a simulare l'interruzione a metà
 * ciclo, dove serve controllare esattamente quando la riga in corso finisce. */
function promessaControllata<T>() {
  let risolvi!: (valore: T) => void
  const promessa = new Promise<T>((r) => {
    risolvi = r
  })
  return { promessa, risolvi }
}

const rispostaOk = { ok: true, status: 201, json: async () => ({ fornitoreCreato: false }) }

function montare(righe: RigaAnteprima[], opzioni: OpzioniImport, onFinito: (esiti: EsitoRiga[]) => void) {
  return render(
    <PassoEsecuzione righe={righe} opzioni={opzioni} scelteConflitti={{}} conflitti={[]} onFinito={onFinito} />
  )
}

describe('PassoEsecuzione', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('con politica «salta», un 409 è il duplicato atteso', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: 'Fattura già importata', existingId: 'x' }),
      })
    )
    const onFinito = vi.fn()

    montare([riga()], OPZIONI_PREDEFINITE, onFinito)

    await waitFor(() => expect(onFinito).toHaveBeenCalled())
    expect(onFinito.mock.calls[0][0]).toEqual([expect.objectContaining({ chiave: 'a.xml', stato: 'duplicata' })])
  })

  it('con politica «sostituisci», un 409 è un rifiuto vero: il messaggio del server arriva all\'utente', async () => {
    const messaggio = 'Impossibile sostituire: la fattura già importata è registrata in prima nota'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: messaggio, existingId: 'x' }),
      })
    )
    const onFinito = vi.fn()

    montare([riga()], { ...OPZIONI_PREDEFINITE, politicaDuplicati: 'sostituisci' }, onFinito)

    await waitFor(() => expect(onFinito).toHaveBeenCalled())
    expect(onFinito.mock.calls[0][0]).toEqual([
      expect.objectContaining({ chiave: 'a.xml', stato: 'errore', messaggio }),
    ])
    // Il messaggio del server deve essere leggibile in pagina, non solo
    // portato nell'esito interno.
    expect(screen.getByText(messaggio)).toBeInTheDocument()
  })

  it('un errore di rete viene contato e mostrato, non fa cadere il componente', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connessione persa')))
    const onFinito = vi.fn()

    montare([riga()], OPZIONI_PREDEFINITE, onFinito)

    await waitFor(() => expect(onFinito).toHaveBeenCalled())
    expect(onFinito.mock.calls[0][0]).toEqual([
      expect.objectContaining({ chiave: 'a.xml', stato: 'errore', messaggio: 'Connessione persa' }),
    ])
    expect(screen.getByText('Connessione persa')).toBeInTheDocument()
  })

  it('interrompe il ciclo, lasciando intatti gli esiti già raccolti', async () => {
    const righe = [riga({ chiave: 'a.xml', nomeFile: 'a.xml' }), riga({ chiave: 'b.xml', nomeFile: 'b.xml' }), riga({ chiave: 'c.xml', nomeFile: 'c.xml' })]
    const secondaRiga = promessaControllata<typeof rispostaOk>()
    const fetchMock = vi.fn().mockResolvedValueOnce(rispostaOk).mockReturnValueOnce(secondaRiga.promessa)
    vi.stubGlobal('fetch', fetchMock)
    const onFinito = vi.fn()

    montare(righe, OPZIONI_PREDEFINITE, onFinito)

    // La riga «b» è già partita (seconda chiamata a fetch) ma resta sospesa
    // finché non la sblocchiamo: qui il pulsante deve poter interrompere.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: /annulla importazione/i }))

    // La riga già in volo va comunque registrata: non si può disfare una
    // richiesta già inviata, e il suo esito è legittimo.
    secondaRiga.risolvi(rispostaOk)

    await waitFor(() => expect(onFinito).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledTimes(2) // mai la terza riga
    expect(onFinito.mock.calls[0][0]).toHaveLength(2)
    expect(onFinito.mock.calls[0][0].map((e: EsitoRiga) => e.chiave)).toEqual(['a.xml', 'b.xml'])
  })

  it('sotto React Strict Mode non spedisce due volte la stessa riga', async () => {
    const fetchMock = vi.fn().mockResolvedValue(rispostaOk)
    vi.stubGlobal('fetch', fetchMock)
    const onFinito = vi.fn()

    render(
      <StrictMode>
        <PassoEsecuzione righe={[riga()]} opzioni={OPZIONI_PREDEFINITE} scelteConflitti={{}} conflitti={[]} onFinito={onFinito} />
      </StrictMode>
    )

    await waitFor(() => expect(onFinito).toHaveBeenCalled())
    // Con la sola riga «a.xml»: se lo Strict Mode facesse partire due cicli,
    // qui vedremmo due chiamate — una delle quali si becca un 409 fasullo
    // e la fattura appena creata risulterebbe duplicata per errore.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(onFinito.mock.calls[0][0]).toHaveLength(1)
  })
})
