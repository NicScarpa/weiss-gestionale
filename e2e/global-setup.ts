/**
 * Prepara lo stato di partenza comune a tutte le spec: l'admin sbloccato e una
 * sessione già aperta.
 *
 * Perché una sessione sola. Il login è limitato a cinque tentativi al minuto
 * per coppia IP+utente (src/lib/auth.ts:79, RATE_LIMIT_CONFIGS.AUTH): una
 * suite in cui ogni test entra per conto suo supera la soglia intorno al sesto
 * test, e da lì in poi l'applicazione risponde «credenziali non corrette».
 * Sarebbero fallimenti che non dicono niente sul prodotto — e che, peggio,
 * somigliano a un difetto di autenticazione. Si entra una volta e si riusa il
 * cookie; `login.spec.ts` è l'unico che parte senza sessione, perché il login è
 * proprio quello che verifica.
 *
 * Il flag `mustChangePassword` resta acceso sul manager apposta: sempre
 * `login.spec.ts` lo usa per verificare che la modale di cambio obbligatorio
 * compaia davvero.
 */
import { type FullConfig } from '@playwright/test'
import { config as caricaEnv } from 'dotenv'
import { chiudiDb, rimettiCambioPasswordObbligatorio, sbloccaUtente } from './helpers/db'
import { UTENTI } from './helpers/app'
import { apriSessione, PERCORSO_SESSIONE } from './helpers/sessione'

export default async function globalSetup(config: FullConfig) {
  // Il processo di Playwright non è il server Next: le variabili del `.env.local`
  // vanno caricate a mano. `override: false` (default) lascia vincere una
  // DATABASE_URL già presente nell'ambiente, che è come si punta il database
  // della prova offline.
  caricaEnv({ path: '.env.local' })

  await sbloccaUtente(UTENTI.admin.username)
  await rimettiCambioPasswordObbligatorio(UTENTI.managerDaSbloccare.username)
  await chiudiDb()

  const baseURL = config.projects[0]?.use?.baseURL
  if (!baseURL) throw new Error('baseURL mancante nella configurazione Playwright')

  // Il come sta in `helpers/sessione.ts`: la stessa procedura serve anche alle
  // spec che aprono la sessione di un altro ruolo.
  await apriSessione({
    baseURL,
    username: UTENTI.admin.username,
    password: UTENTI.admin.password,
    percorso: PERCORSO_SESSIONE,
  })
}
