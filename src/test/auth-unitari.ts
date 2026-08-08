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
