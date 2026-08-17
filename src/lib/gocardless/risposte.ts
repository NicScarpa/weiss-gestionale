/**
 * Da eccezione del client a risposta HTTP.
 *
 * Tre casi non devono diventare un 500 generico, perché chi legge deve poter
 * distinguere «ripassa domani» da «la banca ha detto di no» da «manca una
 * variabile d'ambiente». Tutto il resto va alla gestione comune del progetto.
 */
import { NextResponse } from 'next/server'

import { errorResponse, handleApiError, type ApiErrorResponse } from '@/lib/api-utils'

import { ConfigurazioneMancante, ErroreGoCardless, LimiteRaggiunto } from './errori'

export interface RispostaLimiteRaggiunto extends ApiErrorResponse {
  secondiAllaRipresa: number | null
}

export function rispostaErroreGoCardless(
  errore: unknown,
  contesto: string
): NextResponse<ApiErrorResponse | RispostaLimiteRaggiunto> {
  // `LimiteRaggiunto` prima di `ErroreGoCardless`: la estende, ed è un caso a
  // sé — il segnale «contingente esaurito», non un errore generico della
  // banca. I secondi alla ripresa sono il dato che serve a decidere quando
  // riprovare, quindi finiscono nel corpo e non solo nel messaggio.
  if (errore instanceof LimiteRaggiunto) {
    const body: RispostaLimiteRaggiunto = {
      error: 'Limite di chiamate alla banca raggiunto',
      secondiAllaRipresa: errore.secondiAllaRipresa,
    }
    return NextResponse.json(body, { status: 429 })
  }

  if (errore instanceof ConfigurazioneMancante) {
    return errorResponse('Il collegamento alla banca non è configurato', 503)
  }

  if (errore instanceof ErroreGoCardless) {
    // Non si passa `errore.corpo`: arriva da fuori e non sappiamo cosa
    // contenga.
    return errorResponse('La banca ha risposto con un errore', 502)
  }

  return handleApiError(errore, contesto, 'Errore nella comunicazione con la banca')
}
