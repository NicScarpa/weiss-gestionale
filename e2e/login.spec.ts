import { expect, test } from '@playwright/test'
import { UTENTI, login } from './helpers/app'

/**
 * L'ingresso: se si rompe qui, non funziona nient'altro.
 *
 * Il primo test verifica il nome dell'etichetta, e non è pignoleria: la suite
 * precedente cercava un campo "Email" che a gennaio è diventato "Username", ed
 * essendo la suite incapace di partire nessuno se n'è accorto. Il nome del
 * campo è un contratto con chi fa login, e va presidiato.
 */
// Questa è l'unica spec che parte senza sessione: le altre riusano il cookie
// aperto dal global setup, ma qui l'oggetto della verifica è proprio l'ingresso.
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Login', () => {
  test("il campo di accesso si chiama «Username», non «Email»", async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByLabel('Username')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Accedi' })).toBeVisible()
    // La verifica ha senso solo se «Email» davvero non c'è: altrimenti passerebbe
    // anche su una pagina che ha entrambi e il test non presidierebbe nulla.
    await expect(page.getByLabel('Email')).toHaveCount(0)
  })

  test('una rotta protetta rimanda al login conservando la destinazione', async ({ page }) => {
    await page.goto('/scadenzario')

    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fscadenzario/)
  })

  test('credenziali sbagliate: messaggio esplicito e nessun accesso', async ({ page }) => {
    await login(page, { username: UTENTI.admin.username, password: 'password-sbagliata' })

    await expect(
      page.getByText('Username/Email o password non corretti', { exact: false })
    ).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('admin: accede e arriva alla dashboard', async ({ page }) => {
    await login(page, UTENTI.admin)

    // L'host non si inchioda. Prima l'espressione pretendeva `localhost:\d+`,
    // e la suite diventava rossa proprio con la configurazione che il README
    // raccomanda: `E2E_BASE_URL=http://127.0.0.1:<porta>`, l'unico modo di
    // aggirare il `localhost` che risolve a IPv6 mentre il dev server ascolta
    // su IPv4. Il rosso diceva «unexpected value http://127.0.0.1:3020/» — cioè
    // il login era andato benissimo. Quello che conta è di essere sulla radice
    // e non su /login; il resto lo prova il saluto qui sotto.
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/(\?.*)?$/, { timeout: 20_000 })
    // Non basta l'URL: il saluto contiene il nome che arriva dalla sessione, quindi
    // prova che la sessione c'è ed è stata letta lato server.
    await expect(page.getByRole('heading', { name: 'Benvenuto, Admin' })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Cambio password obbligatorio' })
    ).toHaveCount(0)
  })

  test('utente alla prima password: la modale di cambio obbligatorio compare e blocca', async ({
    page,
  }) => {
    await login(page, UTENTI.managerDaSbloccare)

    const modale = page.getByRole('dialog')
    await expect(modale.getByText('Cambio password obbligatorio')).toBeVisible({
      timeout: 20_000,
    })

    // «Blocca» va verificato, non dato per buono: la modale non ha X, ignora
    // Escape e non si chiude cliccando fuori.
    await page.keyboard.press('Escape')
    await page.mouse.click(5, 5)
    await expect(modale.getByText('Cambio password obbligatorio')).toBeVisible()
    await expect(modale.getByLabel('Password attuale')).toBeVisible()
  })
})
