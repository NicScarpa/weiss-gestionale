import { describe, it, expect } from 'vitest'
import { messaggioErroreApi } from '../api-error'

describe('messaggioErroreApi', () => {
  it('preferisce il primo dettaglio di validazione al messaggio generico', () => {
    const corpo = {
      error: 'Dati non validi',
      details: [
        { message: 'Il nome è obbligatorio' },
        { message: 'Orario non valido' },
      ],
    }

    expect(messaggioErroreApi(corpo, 'Errore')).toBe('Il nome è obbligatorio')
  })

  it('usa il messaggio della route quando non ci sono dettagli', () => {
    const corpo = { error: 'Regola non trovata' }

    expect(messaggioErroreApi(corpo, 'Errore')).toBe('Regola non trovata')
  })

  it('ricade sul fallback con un corpo vuoto o non riconoscibile', () => {
    expect(messaggioErroreApi({}, 'Errore nel salvataggio')).toBe(
      'Errore nel salvataggio'
    )
    expect(messaggioErroreApi(null, 'Errore nel salvataggio')).toBe(
      'Errore nel salvataggio'
    )
    expect(messaggioErroreApi({ details: [] }, 'Errore nel salvataggio')).toBe(
      'Errore nel salvataggio'
    )
  })
})
