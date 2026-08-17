import { expect, test } from '@playwright/test'
import { chiudiDb, sbloccaUtente } from './helpers/db'
import { apriSessione, BASE_URL_E2E, PERCORSO_SESSIONE_DIPENDENTE } from './helpers/sessione'

/**
 * Cosa un dipendente può vedere del gestionale, da telefono.
 *
 * La segnalazione: con le credenziali di un dipendente (ruolo `staff`) si
 * apriva la chiusura cassa da telefono, si toccava la barra laterale e
 * compariva il menu della prima nota — Movimenti, Pagamenti, Regole,
 * Riconciliazione — e le voci funzionavano.
 *
 * Erano due difetti sovrapposti, e servono due prove diverse:
 *
 * 1. la barra mostrava voci riservate, perché il pannello a comparsa cercava la
 *    sezione attiva nel menu completo invece che in quello del ruolo;
 * 2. il rimando al portale non scattava. Stava nel layout di `(dashboard)`, e
 *    per la partial rendering di Next un layout non viene rieseguito quando si
 *    naviga fra due rotte che lo condividono: la chiusura cassa era in quel
 *    gruppo, quindi da lì le pagine riservate si aprivano davvero.
 *
 * Il secondo punto si prova solo con una navigazione **lato client**: un
 * `page.goto` è un caricamento di pagina, il layout viene eseguito e il test
 * passerebbe anche col difetto dentro.
 *
 * La sessione condivisa dal global setup è quella dell'admin: qui serve quella
 * di un dipendente, e si apre **una volta sola** per tutta la spec. Il login è
 * limitato a cinque tentativi al minuto per utente: entrando a ogni test, il
 * sesto fallirebbe per la soglia e non per il prodotto.
 */

const DIPENDENTE = { username: 'AndreaSegatto', password: 'staff123' }
const EMAIL_DIPENDENTE = 'andrea.s@weisscafe.it'

/** Sezioni che al dipendente non devono comparire, né aprirsi. */
const PERCORSI_RISERVATI = [
  '/prima-nota/movimenti',
  '/budget',
  '/fatture',
  '/impostazioni/generali',
]

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  // Il file lo scrive `beforeAll`, e viene letto quando Playwright apre il
  // contesto del primo test: cioè dopo.
  storageState: PERCORSO_SESSIONE_DIPENDENTE,
})

test.beforeAll(async () => {
  // Gli utenti del seed nascono con `mustChangePassword`, che copre l'interfaccia
  // con la modale di cambio obbligatorio e farebbe fallire tutto per il motivo
  // sbagliato.
  await sbloccaUtente(EMAIL_DIPENDENTE)
  await chiudiDb()

  await apriSessione({
    baseURL: BASE_URL_E2E,
    username: DIPENDENTE.username,
    password: DIPENDENTE.password,
    percorso: PERCORSO_SESSIONE_DIPENDENTE,
  })
})

test.beforeEach(async ({ page }) => {
  // Un cookie mancante manderebbe ogni pagina al login, e le asserzioni
  // seguenti racconterebbero la storia sbagliata.
  await page.goto('/portale')
  await expect(page, 'sessione del dipendente assente').not.toHaveURL(/\/login/)
})

test.describe('Dipendente su telefono', () => {
  test('la chiusura cassa si apre e usa tutta la larghezza dello schermo', async ({ page }) => {
    await page.goto('/chiusura-cassa/nuova')
    await expect(page.getByRole('heading', { name: 'Nuova Chiusura' })).toBeVisible({
      timeout: 30_000,
    })

    const misure = await page.locator('main').evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
      larghezza: Math.round(el.getBoundingClientRect().width),
    }))

    // La rail rubava 64px al contenuto (e altri 256 quando si apriva il
    // pannello): da telefono non c'è, il contenuto ha tutto lo schermo.
    expect(
      misure.larghezza,
      `il contenuto ha ${misure.larghezza}px su 390: la barra laterale non è nascosta`
    ).toBe(390)
    expect(
      misure.scroll,
      `la pagina sfonda di ${misure.scroll - misure.client}px`
    ).toBeLessThanOrEqual(misure.client)
  })

  test('il menu contiene solo le voci consentite al dipendente', async ({ page }) => {
    await page.goto('/chiusura-cassa/nuova')
    await expect(page.getByRole('heading', { name: 'Nuova Chiusura' })).toBeVisible({
      timeout: 30_000,
    })

    await page.getByRole('button', { name: 'Apri il menu' }).click()
    const cassetto = page.locator('[data-slot="sheet-content"]')
    await expect(cassetto).toBeVisible()

    const percorsi = await cassetto.locator('a[href]').evaluateAll((a) =>
      a.map((el) => el.getAttribute('href'))
    )
    expect(percorsi.sort()).toEqual(['/chiusura-cassa', '/portale'])
  })

  for (const percorso of PERCORSI_RISERVATI) {
    test(`una navigazione lato client verso ${percorso} non apre la pagina`, async ({ page }) => {
      await page.goto('/chiusura-cassa/nuova')
      await expect(page.getByRole('heading', { name: 'Nuova Chiusura' })).toBeVisible({
        timeout: 30_000,
      })
      // Il router va spinto quando la pagina è ferma: una `push` lanciata mentre
      // il primo render è ancora in volo viene scartata, e il test misurerebbe
      // una navigazione che non è mai partita.
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1_000)

      // La richiesta RSC verso la rotta riservata è la prova che la navigazione
      // è stata davvero tentata: senza, un'asserzione sull'URL passerebbe anche
      // se la `push` non avesse fatto nulla.
      const richiestaRsc = page.waitForRequest(
        (req) => new URL(req.url()).pathname === percorso,
        { timeout: 20_000 }
      )

      // Il router del client, non un caricamento di pagina: è la via su cui il
      // controllo nel layout condiviso non veniva eseguito.
      await page.evaluate((dove) => {
        const router = (
          window as unknown as { next?: { router?: { push: (u: string) => void } } }
        ).next?.router
        if (!router) throw new Error('router del client non disponibile: prova non valida')
        router.push(dove)
      }, percorso)

      await richiestaRsc
      await page.waitForTimeout(3_000)

      // Il server risponde con il rimando al portale, quindi il router non
      // apre la rotta: o ci porta al portale, o resta dov'era. Quello che non
      // deve succedere è vedere la pagina riservata.
      expect(
        new URL(page.url()).pathname,
        `il dipendente è entrato in ${percorso} con una navigazione lato client`
      ).not.toBe(percorso)
      await expect(page.getByText('Liquidità Totale')).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Impostazioni' })).toHaveCount(0)
    })
  }
})
