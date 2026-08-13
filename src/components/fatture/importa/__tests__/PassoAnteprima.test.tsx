import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { PassoAnteprima } from '../PassoAnteprima'
import type { RigaAnteprima } from '../PassoAnteprima'

const riga = (sovrascrivi: Partial<RigaAnteprima> = {}): RigaAnteprima => ({
  chiave: 'IT07945211006_001.xml',
  nomeFile: 'IT07945211006_001.xml',
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

describe('PassoAnteprima', () => {
  it('conta le fatture trovate', () => {
    render(<PassoAnteprima righe={[riga(), riga({ chiave: 'b.xml' })]} onEsclusioneChange={vi.fn()} metadatiIgnorati={0} scartati={[]} />)
    expect(screen.getByText('2 fatture trovate nei file caricati')).toBeInTheDocument()
  })

  it('marca le fatture già in archivio', () => {
    render(<PassoAnteprima righe={[riga({ duplicata: true })]} onEsclusioneChange={vi.fn()} metadatiIgnorati={0} scartati={[]} />)
    expect(screen.getByText('Duplicato')).toBeInTheDocument()
  })

  it('dice quando la scadenza è una stima, invece di spacciarla per letta', () => {
    render(<PassoAnteprima righe={[riga({ scadenzaStimata: true, primaScadenza: '2026-07-01' })]} onEsclusioneChange={vi.fn()} metadatiIgnorati={0} scartati={[]} />)
    expect(screen.getByTitle(/stimata/i)).toBeInTheDocument()
  })

  it('mostra tutte le aliquote quando il documento ne ha più di una', () => {
    render(<PassoAnteprima righe={[riga({ aliquote: [4, 10, 22] })]} onEsclusioneChange={vi.fn()} metadatiIgnorati={0} scartati={[]} />)
    expect(screen.getByText('4% · 10% · 22%')).toBeInTheDocument()
  })

  it('mostra la ritenuta con la sua aliquota', () => {
    render(<PassoAnteprima righe={[riga({ ritenuta: { importo: 83.33, aliquota: 20, tipo: 'RT02' } })]} onEsclusioneChange={vi.fn()} metadatiIgnorati={0} scartati={[]} />)
    expect(screen.getByText(/83,33/)).toBeInTheDocument()
    expect(screen.getByText(/20%/)).toBeInTheDocument()
  })

  it('permette di escludere una riga', async () => {
    const onEsclusioneChange = vi.fn()
    render(<PassoAnteprima righe={[riga()]} onEsclusioneChange={onEsclusioneChange} metadatiIgnorati={0} scartati={[]} />)

    fireEvent.click(screen.getByRole('checkbox', { name: /includi/i }))

    expect(onEsclusioneChange).toHaveBeenCalledWith('IT07945211006_001.xml', true)
  })

  it('segnala i file scartati e i metadati ignorati', () => {
    render(
      <PassoAnteprima
        righe={[riga()]}
        onEsclusioneChange={vi.fn()}
        metadatiIgnorati={3}
        scartati={[{ nomeFile: 'rotto.xml', motivo: 'Documento non riconosciuto' }]}
      />
    )
    expect(screen.getByText(/3 file di metadati/i)).toBeInTheDocument()
    expect(screen.getByText(/rotto\.xml/)).toBeInTheDocument()
  })
})
