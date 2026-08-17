import { expect, test } from '@playwright/test'
import { apriConSessioneAdmin } from './helpers/app'

/**
 * Nessuno sfondamento orizzontale su un telefono stretto (390 px, iPhone 14).
 *
 * Il criterio è `main.scrollWidth <= main.clientWidth`, NON quello sul `body`:
 * in questa applicazione il telaio mette l'overflow su
 * `<main class="flex-1 overflow-auto">` (src/components/layout/app-shell.tsx),
 * quindi il body non scorre mai e misurarlo darebbe verde qualunque cosa
 * succeda dentro. Il test riporta comunque entrambe le misure nel messaggio di
 * errore, così quando diventa rosso si vede subito di quanto si sfonda.
 *
 * Attenzione a cosa NON copre: misura solo lo sfondamento, non quanto spazio
 * resti al contenuto. Finché la barra laterale era visibile anche da telefono
 * si prendeva 64px dei 390 (e altri 256 col pannello aperto) e questi test
 * restavano verdi lo stesso, perché il testo si incolonnava invece di
 * traboccare. La larghezza dell'area di contenuto la verifica
 * `accesso-dipendente.spec.ts`.
 */

const LARGHEZZA = 390

/**
 * `difettoNoto` marca le pagine che *oggi* sfondano: il test resta ed esegue,
 * ma è dichiarato in fallimento atteso. Quando la pagina verrà sistemata
 * diventerà rosso, e sarà il segnale per togliere la marcatura. Non correggere
 * il layout da qui: `src/**` è di altri proprietari.
 *
 * Il tipo è dichiarato apposta, e non è pignoleria. Finché `PAGINE` è stato un
 * letterale senza annotazione il suo tipo inferito era `{ nome, url }[]`, che
 * `difettoNoto` non lo contiene affatto: i tre accessi qui sotto erano errori
 * `TS2339` che nessuno poteva vedere, perché `e2e` era escluso da
 * `tsconfig.json` e non nominato in eslint. Non codice morto per distrazione —
 * codice rotto sotto un controllo spento.
 *
 * Perché il refuso vada fermato: da `difettoNoto` dipende anche il **titolo**
 * del test, non solo `test.fail()`. Scrivere `difettoNotto` spegnerebbe il
 * fallimento atteso *e* rimetterebbe il titolo pulito, cancellando insieme la
 * protezione e l'unica traccia visibile che quella pagina fosse marcata. Il
 * risultato sarebbe un test verde che non prova niente e non lo dice: la
 * stessa famiglia dei 34 `expect(true).toBe(true)` per cui la suite precedente
 * è stata cancellata.
 */
interface PaginaDaMisurare {
  nome: string
  url: string
  /**
   * Valorizzato solo finché la pagina sfonda: il testo è la misura, e finisce
   * nel titolo del test perché si legga senza aprire il file.
   */
  difettoNoto?: string
}

const PAGINE: PaginaDaMisurare[] = [
  { nome: 'dashboard', url: '/' },
  { nome: 'nuova chiusura cassa', url: '/chiusura-cassa/nuova' },
  // Queste due sfondavano — 358 su 326 la prima nota, 731 su 326 lo scadenzario —
  // ed erano marcate `difettoNoto`. Corrette in W4: la causa non era la tabella,
  // che shadcn avvolge già in `overflow-x-auto`, ma la riga delle azioni
  // nell'intestazione e la striscia delle tab larga a contenuto. La marcatura è
  // stata tolta **dopo** aver eseguito la suite e visto i due test passare
  // davvero: toglierla sulla fiducia li avrebbe trasformati in asserzioni finte,
  // che è ciò per cui la suite precedente è stata cancellata.
  { nome: 'prima nota / movimenti', url: '/prima-nota/movimenti' },
  { nome: 'scadenzario', url: '/scadenzario' },
]

test.use({ viewport: { width: LARGHEZZA, height: 844 }, isMobile: true, hasTouch: true })

test.describe(`Telefono ${LARGHEZZA}px`, () => {
  for (const pagina of PAGINE) {
    const titolo = pagina.difettoNoto
      ? `${pagina.nome}: nessuno sfondamento orizzontale (difetto noto: ${pagina.difettoNoto})`
      : `${pagina.nome}: nessuno sfondamento orizzontale`

    test(titolo, async ({ page }) => {
      if (pagina.difettoNoto) test.fail()

      await apriConSessioneAdmin(page, pagina.url)

      const main = page.locator('main')
      await expect(main).toBeVisible()
      // Le pagine caricano i dati dopo il primo render: misurare subito
      // significherebbe misurare uno scheletro vuoto, che non sfonda mai.
      await page.waitForLoadState('networkidle')

      const misure = await main.evaluate((el) => ({
        mainScroll: el.scrollWidth,
        mainClient: el.clientWidth,
        bodyScroll: document.body.scrollWidth,
        bodyClient: document.body.clientWidth,
      }))

      expect(
        misure.mainScroll,
        `${pagina.nome}: main sfonda di ${misure.mainScroll - misure.mainClient}px ` +
          `(main ${misure.mainScroll}/${misure.mainClient}, ` +
          `body ${misure.bodyScroll}/${misure.bodyClient})`
      ).toBeLessThanOrEqual(misure.mainClient)
    })
  }
})
