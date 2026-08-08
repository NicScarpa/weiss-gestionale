/**
 * Le poche cose che servono a più di una spec: come si entra e come si legge
 * un importo dallo schermo.
 */
import { expect, type Page } from '@playwright/test'

export const UTENTI = {
  /** Sbloccato dal global setup: è l'utente con cui si naviga l'applicazione. */
  admin: { username: 'admin@weisscafe.it', password: 'admin123' },
  /**
   * Volutamente NON sbloccato: serve a `login.spec.ts` per verificare che la
   * modale di cambio password obbligatorio compaia e blocchi.
   */
  managerDaSbloccare: { username: 'manager@weisscafe.it', password: 'manager123' },
} as const

/**
 * Il campo di login si chiama "Username" e contiene l'email. La suite
 * precedente cercava "Email" ed era rossa da mesi senza che nessuno lo
 * sapesse, perché non poteva nemmeno partire: l'etichetta va asserita, non
 * aggirata con un selettore generico.
 */
export async function login(page: Page, utente: { username: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Username').fill(utente.username)
  await page.getByLabel('Password').fill(utente.password)
  await page.getByRole('button', { name: 'Accedi' }).click()
}

/**
 * Apre una pagina con la sessione admin già aperta dal global setup.
 *
 * Non fa login: il login costa un tentativo sul contatore di
 * `RATE_LIMIT_CONFIGS.AUTH` (cinque al minuto per utente) e una suite che entra
 * a ogni test lo esaurisce. Verifica però che la sessione ci sia davvero — un
 * cookie scaduto manderebbe la pagina su `/login` e le asserzioni successive
 * fallirebbero raccontando la storia sbagliata.
 */
export async function apriConSessioneAdmin(page: Page, url: string) {
  await page.goto(url)
  await expect(page, `sessione admin assente: ${url} ha rimandato al login`).not.toHaveURL(
    /\/login/
  )
  // La modale di cambio password non deve comparire: se comparisse, il global
  // setup non ha fatto il suo lavoro e ogni asserzione successiva sarebbe
  // valutata su una pagina coperta da un dialog modale.
  await expect(page.getByRole('heading', { name: 'Cambio password obbligatorio' })).toHaveCount(0)
}

/**
 * `formatCurrency` (it-IT) produce «1.234,56 €» con uno spazio *unificatore*
 * fra numero e simbolo. Confrontare con uno spazio normale fallisce per un
 * motivo che non c'entra nulla con quello che si sta verificando.
 */
export function normalizzaImporto(testo: string): string {
  return testo.replace(/ | /g, ' ').trim()
}

export function euro(importo: number): string {
  return normalizzaImporto(
    new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
      useGrouping: true,
    }).format(importo)
  )
}
