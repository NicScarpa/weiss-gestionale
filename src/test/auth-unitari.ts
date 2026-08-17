import type { Session } from 'next-auth'
import { auth } from '@/lib/auth'

/**
 * `auth` ristretta alla firma che le route chiamano davvero.
 *
 * `auth` di NextAuth v5 non è una funzione sola: è più firme sovrapposte —
 * quella senza argomenti usata dalle route, e le varianti che avvolgono
 * middleware e handler. Quando `vi.mocked(auth)` deve sceglierne una prende
 * l'ultima, `NextMiddleware`, e ogni `mockResolvedValue(sessione)` diventa
 * «Argument of type 'Session' is not assignable to parameter of type
 * 'NextMiddleware'».
 *
 * Il rimedio diffuso nel repository è `as never` sul valore. Compila, ma
 * spegne anche il controllo sulla sessione: con `as never` passerebbe pure
 * `mockResolvedValue({ pippo: 1 })`, e un test che finge una sessione di forma
 * sbagliata non prova nulla di ciò che crede di provare.
 *
 * Qui si sceglie la firma invece di zittire il valore, così la sessione resta
 * confrontata con `Session`. Non serve alcun cast: una delle firme di `auth`
 * è già esattamente questa, e l'assegnazione la seleziona.
 *
 * Per i test di integrazione serve altro — lì l'autenticazione è finta ma il
 * database è vero: vedi `src/test/integration/auth-mock.ts`.
 */
export const authDiRoute: () => Promise<Session | null> = auth

/**
 * Il secondo argomento che l'App Router passa a ogni route handler.
 *
 * Va passato anche nei test unitari: `withAuth` lo dichiara obbligatorio
 * perché il controllo di tipo che Next genera sotto webpack rifiuta un
 * parametro opzionale (vedi il commento su `AuthedRoute` in
 * `src/lib/api-utils.ts`). Ometterlo, oltre a non compilare più, significava
 * provare una chiamata che in produzione non avviene mai: Next il contesto lo
 * passa sempre, anche alle route statiche, con `params` vuoto.
 *
 * Per le route dinamiche si passano i parametri veri:
 * `contestoRotta({ id: 'abc' })`.
 */
export function contestoRotta<TParams extends object = Record<string, never>>(
  params: TParams = {} as TParams
): { params: Promise<TParams> } {
  return { params: Promise.resolve(params) }
}
