/**
 * Messaggio da mostrare quando una route rifiuta la richiesta.
 *
 * Gli errori di validazione arrivano come `{ error: 'Dati non validi', details }`,
 * dove `details` sono le issue di zod con i messaggi già scritti in italiano.
 * Mostrare solo `error` lascia l'utente davanti a un "Dati non validi" che non
 * dice quale campo correggere.
 */
export function messaggioErroreApi(corpo: unknown, fallback: string): string {
  const body = corpo as
    | { error?: string; details?: Array<{ message?: string }> }
    | null
    | undefined

  const dettaglio = Array.isArray(body?.details)
    ? body.details[0]?.message
    : undefined

  return dettaglio || body?.error || fallback
}
