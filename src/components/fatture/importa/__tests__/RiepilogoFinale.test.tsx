import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { RiepilogoFinale } from '../RiepilogoFinale'
import type { EsitoRiga } from '../RiepilogoFinale'

const esito = (sovrascrivi: Partial<EsitoRiga>): EsitoRiga => ({
  chiave: 'a.xml',
  nomeFile: 'a.xml',
  numero: '42',
  denominazioneFornitore: 'Torrefazione di prova Srl',
  stato: 'importata',
  fattura: {
    chiave: 'a.xml', nomeFile: 'a.xml', xmlContent: '<x/>', daZip: null,
    numero: '42', data: '2026-06-01', tipoDocumento: 'TD01',
    denominazioneFornitore: 'Torrefazione di prova Srl', partitaIvaFornitore: '07945211006',
    denominazioneCliente: 'Weiss Cafe', netAmount: 100, vatAmount: 22, totalAmount: 122,
    aliquote: [22], primaScadenza: '2026-07-01', scadenzaStimata: false,
    giorniDalFile: 30, ritenuta: null, duplicata: false, esclusa: false,
  },
  ...sovrascrivi,
})

const esiti = [
  esito({ chiave: 'a.xml', stato: 'importata' }),
  esito({ chiave: 'b.xml', nomeFile: 'b.xml', stato: 'duplicata' }),
  esito({ chiave: 'c.xml', nomeFile: 'c.xml', stato: 'duplicata' }),
  esito({ chiave: 'd.xml', nomeFile: 'd.xml', stato: 'errore', messaggio: 'P.IVA assente' }),
]

describe('RiepilogoFinale', () => {
  it('riassume in una riga quante ne sono entrate e quante no', () => {
    render(<RiepilogoFinale esiti={esiti} fattureCreate={1} fornitoriCreati={0} onChiudi={vi.fn()} onRicomincia={vi.fn()} />)
    expect(screen.getByText(/1 fattura importata, 3 righe saltate/i)).toBeInTheDocument()
  })

  it('mostra i contatori per stato', () => {
    render(<RiepilogoFinale esiti={esiti} fattureCreate={1} fornitoriCreati={0} onChiudi={vi.fn()} onRicomincia={vi.fn()} />)
    const importati = screen.getByRole('button', { name: /1 importate/i })
    const duplicati = screen.getByRole('button', { name: /2 duplicate/i })
    expect(importati).toBeInTheDocument()
    expect(duplicati).toBeInTheDocument()
  })

  it('filtra la tabella quando si preme un contatore', async () => {
    render(<RiepilogoFinale esiti={esiti} fattureCreate={1} fornitoriCreati={0} onChiudi={vi.fn()} onRicomincia={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /2 duplicate/i }))

    const righe = screen.getAllByRole('row').slice(1) // via l'intestazione
    expect(righe).toHaveLength(2)
    expect(screen.queryByText('a.xml')).not.toBeInTheDocument()
    expect(screen.getByText('b.xml')).toBeInTheDocument()
  })

  it('apre il dettaglio completo della fattura sulla riga', async () => {
    render(<RiepilogoFinale esiti={esiti} fattureCreate={1} fornitoriCreati={0} onChiudi={vi.fn()} onRicomincia={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /dettagli di a\.xml/i }))

    expect(screen.getByText('07945211006')).toBeInTheDocument()   // P.IVA
    expect(screen.getByText(/TD01/)).toBeInTheDocument()          // tipo documento
    expect(screen.getByText(/01\/07\/2026/)).toBeInTheDocument()  // scadenza
    expect(screen.getByText(/122,00/)).toBeInTheDocument()        // lordo
  })

  it('spiega perché una riga è fallita', async () => {
    render(<RiepilogoFinale esiti={esiti} fattureCreate={1} fornitoriCreati={0} onChiudi={vi.fn()} onRicomincia={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /1 errori/i }))
    expect(screen.getByText('P.IVA assente')).toBeInTheDocument()
  })

  it('mostra la verifica di integrità', () => {
    render(<RiepilogoFinale esiti={esiti} fattureCreate={1} fornitoriCreati={2} onChiudi={vi.fn()} onRicomincia={vi.fn()} />)
    const verifica = screen.getByRole('region', { name: /verifica integrità/i })
    expect(within(verifica).getByText('1')).toBeInTheDocument()   // fatture create
    expect(within(verifica).getByText('2')).toBeInTheDocument()   // fornitori creati
    expect(within(verifica).getByText('4')).toBeInTheDocument()   // righe processate
  })

  it('avverte se il conto non torna', () => {
    // 1 importata dichiarata, ma nel database ne risultano 0
    render(<RiepilogoFinale esiti={esiti} fattureCreate={0} fornitoriCreati={0} onChiudi={vi.fn()} onRicomincia={vi.fn()} />)
    expect(screen.getByText(/non corrisponde/i)).toBeInTheDocument()
  })
})
