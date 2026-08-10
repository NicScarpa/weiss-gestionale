import { expect, test, type Page } from '@playwright/test'
import { apriConSessioneAdmin } from './helpers/app'
import { chiudiDb, liberaGiornoChiusura, statoChiusuraDelGiorno } from './helpers/db'

/**
 * Che cosa succede davvero senza rete.
 *
 * Fino a poco fa `public/sw.js` non veniva prodotto affatto (`withSerwist` è un
 * plugin webpack e Next 16 compila con Turbopack, che lo ignorava in silenzio);
 * ora la compilazione passa dalla CLI di Serwist e il file c'è. Che ci sia però
 * non dice che l'offline funzioni, e nessuno l'aveva mai provato: questi test
 * lo provano, e dicono quello che succede, non quello che dovrebbe succedere.
 *
 * Due di loro nascono come `test.fail()`, cioè come riproduzioni eseguibili di
 * altrettanti difetti: la coda che non veniva mai riempita e il fallback a una
 * pagina che non era in cache. Sono stati corretti (W4, agente E2) e
 * l'annotazione è stata tolta dopo averli visti passare davvero — toglierla
 * senza rieseguirli li avrebbe trasformati in asserzioni finte.
 *
 * Va eseguito contro una build di produzione — vedi playwright.offline.config.ts
 * ed e2e/README.md.
 */

const GIORNO_PROVA = '2019-06-01'

test.describe('Funzionamento offline', () => {
  test.afterAll(async () => {
    await chiudiDb()
  })

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

  test('offline: la pagina appena visitata si ricarica e resta compilabile', async ({
    page,
    context,
  }) => {
    await apriConSessioneAdmin(page, '/chiusura-cassa/nuova')
    await page.waitForLoadState('networkidle')
    await attendiServiceWorkerAlComando(page)

    // Nessun secondo caricamento online, ed è il punto del test. Il documento
    // entra in cache solo se a chiederlo è il service worker, e alla primissima
    // visita il worker si installa quando la pagina è già arrivata dalla rete:
    // prima, su un dispositivo che apriva l'applicazione per la prima volta,
    // offline non c'era niente. Ora appena il worker prende il controllo il
    // client richiede la pagina corrente una volta (src/lib/offline/sync.ts),
    // e quella richiesta passa da lui.
    // Il riscaldamento della cache è asincrono: parte quando il service worker
    // prende il controllo e dura quanto una richiesta di documento. Andare
    // offline prima che finisca non misurerebbe il prodotto ma chi dei due è
    // arrivato primo — e la pagina che si vedrebbe sarebbe il fallback
    // «Sei offline», con tanto di stato 200.
    await attendiPaginaInCache(page)

    await context.setOffline(true)

    const risposta = await page.reload()
    expect(risposta?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Nuova Chiusura' })).toBeVisible()

    // Non basta che il documento arrivi: il form deve essere utilizzabile.
    await page.locator('#cash-0').fill('50')
    await expect(page.locator('#cash-0')).toHaveValue('50')
  })

  /**
   * Il difetto peggiore che questa suite aveva trovato, e che qui è chiuso:
   * salvando senza rete comparivano DUE avvisi opposti nello stesso momento —
   * «Errore salvataggio bozza» e «le modifiche verranno sincronizzate» — e la
   * coda restava vuota. All'operatore veniva detto che il lavoro era al sicuro
   * mentre non lo era.
   */
  test('offline: il salvataggio mette in coda, e lo dice una volta sola', async ({
    page,
    context,
  }) => {
    await compilaChiusura(page)

    await context.setOffline(true)
    await page.getByRole('button', { name: 'Salva Bozza' }).click()

    const avvisi = page.locator('[data-sonner-toast]')
    await expect(
      avvisi.filter({ hasText: 'salvata su questo dispositivo' })
    ).toBeVisible({ timeout: 15_000 })

    // Un solo messaggio: gli avvisi di rete e coda passano tutti dallo stesso
    // id sonner (AVVISO_OFFLINE), quindi si sostituiscono invece di impilarsi.
    await expect(avvisi).toHaveCount(1)
    await expect(avvisi.filter({ hasText: 'Errore' })).toHaveCount(0)

    // Si resta sulla pagina: la chiusura non ha ancora un id sul server.
    await expect(page).toHaveURL(/\/chiusura-cassa\/nuova$/)
  })

  test('offline: la chiusura compilata finisce in coda, con dentro i soldi contati', async ({
    page,
    context,
  }) => {
    await compilaChiusura(page)

    await context.setOffline(true)
    await page.getByRole('button', { name: 'Salva Bozza' }).click()
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 15_000 })

    const inCoda = await chiusureInCoda(page)
    expect(inCoda).toHaveLength(1)

    // Che ci sia una riga non basta: dentro ci deve essere il conteggio, o al
    // ritorno della rete si sincronizzerebbe il vuoto.
    const stazioni = (inCoda[0] as { data: { stations: { cashAmount?: number }[] } }).data.stations
    expect(stazioni[0].cashAmount).toBe(50)
  })

  /**
   * L'altra metà della promessa. Una coda che si riempie e non si svuota da
   * sola sarebbe solo un modo più lento di perdere il lavoro: qui la chiusura
   * si cerca dove conta, cioè in Postgres, dopo aver ridato la rete.
   */
  test('al ritorno della rete la coda parte da sola e la chiusura arriva sul server', async ({
    page,
    context,
  }) => {
    await liberaGiornoChiusura(GIORNO_PROVA)

    await compilaChiusura(page)
    await context.setOffline(true)
    await page.getByRole('button', { name: 'Salva Bozza' }).click()
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'salvata su questo dispositivo' })
    ).toBeVisible({ timeout: 15_000 })

    await context.setOffline(false)

    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Sincronizzazione completata' })
    ).toBeVisible({ timeout: 30_000 })

    await expect.poll(async () => (await chiusureInCoda(page)).length, { timeout: 15_000 }).toBe(0)

    const salvata = await statoChiusuraDelGiorno(GIORNO_PROVA)
    expect(salvata?.status).toBe('DRAFT')
  })

  /**
   * `/offline` è precacheata a parte (`additionalPrecacheEntries` in
   * serwist.config.mjs, revisione = BUILD_ID): prima il fallback dichiarato in
   * `src/app/sw.ts` puntava a una pagina che in cache non c'era mai, perché il
   * manifest conteneva solo `static/**` — nessun documento. Una rotta mai
   * visitata dava `net::ERR_FAILED`, cioè l'errore di rete del browser al posto
   * della pagina che l'applicazione aveva scritto apposta.
   */
  test('offline: una rotta mai visitata mostra la pagina «Sei offline»', async ({
    page,
    context,
  }) => {
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

/** Aspetta che il documento della pagina corrente sia davvero in una cache. */
async function attendiPaginaInCache(page: Page) {
  await page.waitForFunction(
    async () => !!(await caches.match(window.location.href)),
    undefined,
    { timeout: 30_000 }
  )
}

/** Le chiusure che aspettano di essere sincronizzate, lette da IndexedDB. */
async function chiusureInCoda(page: Page): Promise<unknown[]> {
  return page.evaluate(async () => {
    const apertura = indexedDB.open('weiss-gestionale')
    const db: IDBDatabase = await new Promise((res, rej) => {
      apertura.onsuccess = () => res(apertura.result)
      apertura.onerror = () => rej(apertura.error)
    })
    if (!db.objectStoreNames.contains('pendingClosures')) return []
    const richiesta = db.transaction('pendingClosures', 'readonly')
      .objectStore('pendingClosures')
      .getAll()
    const righe: unknown[] = await new Promise((res) => {
      richiesta.onsuccess = () => res(richiesta.result)
      richiesta.onerror = () => res([])
    })
    return righe
  })
}
