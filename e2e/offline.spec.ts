import { expect, test, type Page } from '@playwright/test'
import { apriConSessioneAdmin } from './helpers/app'

/**
 * Che cosa succede davvero senza rete.
 *
 * Fino a poco fa `public/sw.js` non veniva prodotto affatto (`withSerwist` è un
 * plugin webpack e Next 16 compila con Turbopack, che lo ignorava in silenzio);
 * ora la compilazione passa dalla CLI di Serwist e il file c'è. Che ci sia però
 * non dice che l'offline funzioni, e nessuno l'aveva mai provato: questi test
 * lo provano, e dicono quello che succede, non quello che dovrebbe succedere.
 *
 * Va eseguito contro una build di produzione — vedi playwright.offline.config.ts
 * ed e2e/README.md.
 */

const GIORNO_PROVA = '2019-06-01'

test.describe('Funzionamento offline', () => {
  test('il service worker viene servito, si registra e prende il controllo', async ({ page }) => {
    const risposta = await page.request.get('/sw.js')
    expect(risposta.status()).toBe(200)
    // Un `sw.js` da poche righe sarebbe un guscio vuoto: quello vero, con il
    // manifest di precache dentro, sta sulle decine di KB.
    expect((await risposta.body()).byteLength).toBeGreaterThan(20_000)

    await apriConSessioneAdmin(page, '/')

    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
    expect(scope).toMatch(/\/$/)

    // `navigator.serviceWorker.ready` si risolve appena esiste un worker
    // registrato: in quel momento può essere ancora in `activating`, e finché
    // non è `activated` non intercetta niente. Il momento da cui l'offline può
    // davvero funzionare è quando il worker è attivo E controlla la pagina —
    // qui il service worker chiama `clients.claim()` (`clientsClaim: true` in
    // src/app/sw.ts), quindi il controllo arriva senza bisogno di ricaricare.
    await attendiServiceWorkerAlComando(page)

    const stato = await page.evaluate(async () => ({
      attivo: (await navigator.serviceWorker.ready).active?.state ?? null,
      controlla: !!navigator.serviceWorker.controller,
    }))
    expect(stato.attivo).toBe('activated')
    expect(stato.controlla).toBe(true)
  })

  test('offline: una pagina già visitata si ricarica e resta compilabile', async ({
    page,
    context,
  }) => {
    await apriConSessioneAdmin(page, '/chiusura-cassa/nuova')
    await page.waitForLoadState('networkidle')
    await attendiServiceWorkerAlComando(page)

    // Serve un secondo caricamento *online*, e non è una scorciatoia del test:
    // il documento entra in cache solo se a chiederlo è il service worker, e
    // alla primissima visita il service worker si installa mentre la pagina è
    // già arrivata dalla rete. Tradotto: su un dispositivo che apre
    // l'applicazione per la prima volta, offline non c'è niente. Funziona dalla
    // seconda visita in poi.
    await page.reload()
    await page.waitForLoadState('networkidle')

    await context.setOffline(true)

    const risposta = await page.reload()
    expect(risposta?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Nuova Chiusura' })).toBeVisible()

    // Non basta che il documento arrivi: il form deve essere utilizzabile.
    await page.locator('#cash-0').fill('50')
    await expect(page.locator('#cash-0')).toHaveValue('50')
  })

  test("offline: il salvataggio non riesce e l'utente viene avvisato", async ({ page, context }) => {
    await compilaChiusura(page)

    await context.setOffline(true)
    await page.getByRole('button', { name: 'Salva Bozza' }).click()

    // Il caso peggiore sarebbe il silenzio: l'operatore che crede di aver
    // salvato e chiude la pagina. Almeno questo non succede.
    const avviso = page.locator('[data-sonner-toast]').filter({ hasText: 'Errore salvataggio bozza' })
    await expect(avviso).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL(/\/chiusura-cassa\/nuova$/)

    // Insieme all'errore compare l'avviso di `OfflineIndicator`, che promette
    // «Le modifiche verranno salvate localmente e sincronizzate quando tornerai
    // online» (src/components/OfflineIndicator.tsx:23). Quella promessa non è
    // mantenuta — vedi il test qui sotto — e l'utente se la vede accanto a un
    // errore di salvataggio: due messaggi che dicono il contrario.
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Sei offline' })
    ).toBeVisible()
  })

  /**
   * DIFETTO — la promessa non è mantenuta. Non correggere qui: `src/**` è di
   * altri proprietari.
   *
   * `src/app/offline/page.tsx:32` dice all'utente che offline può «Compilare
   * nuove chiusure (verranno sincronizzate)». L'infrastruttura per farlo esiste
   * — `savePendingClosure` in src/lib/offline/db.ts:119, lo store
   * `pendingClosures`, la sincronizzazione in src/lib/offline/sync.ts e il tag
   * `sync-closures` in src/app/sw.ts:50 — ma NON è collegata a niente: l'unico
   * che espone `savePendingClosure` è `useOffline` (src/hooks/useOffline.ts:128),
   * e il solo consumatore di `useOffline` è `OfflineIndicator`, che quel metodo
   * non lo usa. Il form chiama `fetch('/api/chiusure')` e basta.
   *
   * Misurato: dopo un salvataggio offline lo store `pendingClosures` resta
   * vuoto. I dati restano nello stato di React e spariscono alla prima
   * navigazione.
   */
  test('offline: la chiusura compilata finisce in coda (difetto: non ci finisce)', async ({
    page,
    context,
  }) => {
    test.fail()

    await compilaChiusura(page)

    await context.setOffline(true)
    await page.getByRole('button', { name: 'Salva Bozza' }).click()
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 15_000 })

    expect(await chiusureInCoda(page)).toBeGreaterThan(0)
  })

  /**
   * DIFETTO — non correggere qui.
   *
   * `src/app/sw.ts:36` configura il fallback `/offline` per le richieste di
   * documento, ma `/offline` non è precacheato: `serwist.config.mjs` include
   * solo `static/**\/*.{js,css,woff2}` sotto `.next`, cioè nessun documento
   * (145 URL, tutti `/_next/static/...`). Il fallback punta a una pagina che
   * non c'è in cache, quindi non scatta.
   *
   * Misurato: una navigazione offline verso una rotta mai visitata fallisce
   * con `net::ERR_FAILED` — l'utente vede l'errore di rete del browser, non la
   * pagina «Sei offline» che l'applicazione ha scritto apposta.
   */
  test('offline: una rotta mai visitata mostra la pagina «Sei offline» (difetto: errore di rete)', async ({
    page,
    context,
  }) => {
    test.fail()

    await apriConSessioneAdmin(page, '/chiusura-cassa/nuova')
    await page.waitForLoadState('networkidle')
    await attendiServiceWorkerAlComando(page)

    await context.setOffline(true)
    await page.goto('/report')

    await expect(page.getByRole('heading', { name: 'Sei offline' })).toBeVisible()
  })
})

/**
 * Aspetta che il service worker sia attivo e abbia preso il controllo della
 * pagina. Prima di quel momento la rete è l'unica fonte e «offline» significa
 * soltanto «rotto»: misurare lì darebbe risultati che dipendono da quanto è
 * stato veloce il test, non da come si comporta l'applicazione.
 */
async function attendiServiceWorkerAlComando(page: Page) {
  await page.waitForFunction(
    async () => {
      const reg = await navigator.serviceWorker.ready
      return reg.active?.state === 'activated' && !!navigator.serviceWorker.controller
    },
    undefined,
    { timeout: 30_000 }
  )
}

async function compilaChiusura(page: Page) {
  await apriConSessioneAdmin(page, '/chiusura-cassa/nuova')
  await page.waitForLoadState('networkidle')
  await attendiServiceWorkerAlComando(page)
  await page.locator('#date').fill(GIORNO_PROVA)
  await page.locator('#cash-0').fill('50')
  await page.locator('#pos-0').fill('50')
}

/** Quante chiusure aspettano di essere sincronizzate, secondo IndexedDB. */
async function chiusureInCoda(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const apertura = indexedDB.open('weiss-gestionale')
    const db: IDBDatabase = await new Promise((res, rej) => {
      apertura.onsuccess = () => res(apertura.result)
      apertura.onerror = () => rej(apertura.error)
    })
    if (!db.objectStoreNames.contains('pendingClosures')) return 0
    const richiesta = db.transaction('pendingClosures', 'readonly')
      .objectStore('pendingClosures')
      .getAll()
    const righe: unknown[] = await new Promise((res) => {
      richiesta.onsuccess = () => res(richiesta.result)
      richiesta.onerror = () => res([])
    })
    return righe.length
  })
}
