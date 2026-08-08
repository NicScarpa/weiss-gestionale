import { expect, test, type Locator, type Page } from '@playwright/test'
import { apriConSessioneAdmin, euro } from './helpers/app'
import { chiudiDb, liberaGiornoChiusura, statoChiusuraDelGiorno } from './helpers/db'

/**
 * Il ciclo di vita della chiusura cassa: bozza → invio → validazione, e la
 * quadratura di cassa.
 *
 * Le asserzioni sui numeri non guardano che «compaia un importo», ma che
 * compaia *quello atteso*: 120 di contanti + 80 di POS devono fare 200 nel
 * riepilogo, 200 nella colonna Incasso dello storico e DRAFT/SUBMITTED/VALIDATED
 * nel database. Se il calcolo cambia di un centesimo il test diventa rosso, ed
 * è tutto il punto.
 *
 * I giorni di prova sono nel 2019 e uno per test: le chiusure sono uniche per
 * (sede, giorno), e giorni condivisi farebbero fallire il secondo test con un
 * 409 che non dice nulla sul prodotto.
 */

const CONTANTI = 120
const POS = 80
const TOTALE = CONTANTI + POS

test.describe('Chiusura cassa', () => {
  test.afterAll(async () => {
    await chiudiDb()
  })

  test('salva la bozza con i numeri e il giorno che sono stati inseriti', async ({ page }) => {
    const giorno = '2019-04-17'
    await liberaGiornoChiusura(giorno)
    await apriConSessioneAdmin(page, '/chiusura-cassa/nuova')
    await expect(page.getByRole('heading', { name: 'Nuova Chiusura' })).toBeVisible()

    await page.locator('#date').fill(giorno)
    // La postazione BAR è in posizione 0 ed è l'unica già espansa.
    await page.locator('#cash-0').fill(String(CONTANTI))
    await page.locator('#pos-0').fill(String(POS))

    const riepilogo = cardRiepilogo(page)
    await expect(voce(riepilogo, 'Totale:')).toHaveText(euro(TOTALE))
    await expect(voce(riepilogo, 'POS:')).toHaveText(euro(POS))

    await page.getByRole('button', { name: 'Salva Bozza' }).click()

    // `[a-z0-9]{20,}` e non `[a-z0-9]+`: quest'ultimo è soddisfatto anche da
    // `/chiusura-cassa/nuova`, cioè dalla pagina da cui non ci si è ancora
    // mossi — l'asserzione passava prima che il salvataggio partisse.
    await expect(page).toHaveURL(/\/chiusura-cassa\/[a-z0-9]{20,}$/, { timeout: 20_000 })
    await expect(page.getByText('Bozza', { exact: true })).toBeVisible()

    const salvata = await statoChiusuraDelGiorno(giorno)
    expect(salvata?.status).toBe('DRAFT')
    // Il giorno salvato è quello scelto e non il precedente: la data passa da
    // un `<input type="date">` a un `Date` e poi a una colonna `@db.Date`, ed è
    // esattamente il tipo di percorso in cui un giorno si perde.
    expect(salvata?.date.toISOString().slice(0, 10)).toBe(giorno)
  })

  test('invio per validazione e approvazione', async ({ page }) => {
    const giorno = '2019-04-18'
    await liberaGiornoChiusura(giorno)
    await apriConSessioneAdmin(page, '/chiusura-cassa/nuova')
    await page.locator('#date').fill(giorno)
    await page.locator('#cash-0').fill(String(CONTANTI))
    await page.locator('#pos-0').fill(String(POS))

    // Il form chiede conferma via window.confirm quando non ci sono uscite
    // manuali. Accettare è la scelta dell'operatore reale in questo scenario;
    // resta scritto quali domande sono state poste, e il test verifica che
    // siano quelle attese: se ne comparisse una nuova, il test la registra.
    const domande = raccogliConferme(page)

    // L'invio apre il PDF in una scheda nuova: senza aspettarla, la scheda si
    // apre a test finito e Playwright chiude il contesto a metà richiesta.
    const pdf = page.waitForEvent('popup').catch(() => null)
    await page.getByRole('button', { name: 'Invia per Validazione' }).click()
    await expect(page).toHaveURL(/\/chiusura-cassa$/, { timeout: 30_000 })
    await pdf

    expect(domande.join(' ')).toContain('nessuna uscita manuale registrata')

    const inviata = await statoChiusuraDelGiorno(giorno)
    expect(inviata?.status).toBe('SUBMITTED')

    // Lo storico mostra l'incasso, e deve essere quello inserito. Si cerca la
    // riga *di questo giorno*: contare le righe con un certo importo su tutta
    // la tabella dipende da cosa hanno lasciato gli altri test.
    const riga = page.getByRole('row').filter({ hasText: dataCompatta(giorno) })
    await expect(riga).toHaveCount(1, { timeout: 20_000 })
    await expect(riga).toContainText(euro(TOTALE))

    await page.goto(`/chiusura-cassa/${inviata!.id}`)
    await expect(page.getByText('In attesa di validazione')).toBeVisible()

    await page.getByRole('button', { name: 'Approva Chiusura' }).click()
    await expect(page.getByText('Validata', { exact: true })).toBeVisible({ timeout: 20_000 })

    const validata = await statoChiusuraDelGiorno(giorno)
    expect(validata?.status).toBe('VALIDATED')
  })

  test('la quadratura confronta il contato con i contanti battuti', async ({ page }) => {
    const giorno = '2019-04-19'
    await liberaGiornoChiusura(giorno)
    await apriConSessioneAdmin(page, '/chiusura-cassa/nuova')
    await page.locator('#date').fill(giorno)

    // Il conteggio fisico popola da solo i contanti della postazione: due da 50
    // e uno da 20 fanno 120, che è quello che ci si aspetta di trovare.
    await page.getByLabel('Pezzi da € 50', { exact: true }).fill('2')
    await page.getByLabel('Pezzi da € 20', { exact: true }).fill('1')
    await expect(page.locator('#cash-0')).toHaveValue(String(CONTANTI))

    await page.locator('#pos-0').fill(String(POS))

    const riepilogo = cardRiepilogo(page)
    await expect(voce(riepilogo, 'Cassa Contata:')).toHaveText(euro(CONTANTI))
    await expect(voce(riepilogo, 'Differenza:')).toHaveText(`+${euro(0)}`)
    await expect(voce(riepilogo, 'Totale:')).toHaveText(euro(TOTALE))
    await expect(riepilogo.getByText('Differenza Cassa')).toHaveCount(0)

    // Ora i contanti battuti scendono a 100 ma in cassa ce ne sono 120: la
    // differenza è +20, sopra la soglia dei 5 €, e va segnalata.
    await page.locator('#cash-0').fill('100')
    await expect(voce(riepilogo, 'Differenza:')).toHaveText(`+${euro(20)}`)
    await expect(riepilogo.getByText('Differenza Cassa')).toBeVisible()
  })

  /**
   * DIFETTO NOTO — non correggere qui: il file è di un altro proprietario.
   *
   * `PUT /api/chiusure/[id]` cancella le postazioni con `deleteMany` contando
   * su un cascade verso `cash_counts` che non esiste: la relazione è
   * `onDelete: Restrict` (prisma/schema.prisma:315) e il vincolo in Postgres è
   * `confdeltype = 'r'`. Ogni postazione ha sempre un conteggio, quindi la
   * chiamata fallisce SEMPRE con 500 «Errore nell'aggiornamento della chiusura»
   * e nessuna chiusura può essere modificata né inviata dalla pagina
   * `/chiusura-cassa/[id]/modifica`. Vedi src/app/api/chiusure/[id]/route.ts:436.
   *
   * `test.fail()` significa: questo test DEVE fallire finché il difetto c'è.
   * Quando verrà corretto tornerà rosso, e sarà il segnale per togliere questa
   * annotazione — non un test finto, ma una riproduzione eseguibile.
   */
  test('modifica di una bozza esistente (difetto noto: 500 dal PUT)', async ({ page }) => {
    test.fail()

    const giorno = '2019-04-20'
    await liberaGiornoChiusura(giorno)
    await apriConSessioneAdmin(page, '/chiusura-cassa/nuova')
    await page.locator('#date').fill(giorno)
    await page.locator('#cash-0').fill(String(CONTANTI))
    await page.locator('#pos-0').fill(String(POS))
    await page.getByRole('button', { name: 'Salva Bozza' }).click()
    await expect(page).toHaveURL(/\/chiusura-cassa\/[a-z0-9]{20,}$/, { timeout: 20_000 })

    const bozza = await statoChiusuraDelGiorno(giorno)
    await page.goto(`/chiusura-cassa/${bozza!.id}/modifica`)
    await expect(page.getByRole('heading', { name: 'Modifica Chiusura' })).toBeVisible()

    await page.locator('#pos-0').fill('90')
    await page.getByRole('button', { name: 'Salva Bozza' }).click()

    // Il salvataggio dovrebbe riportare al dettaglio della chiusura.
    await expect(page).toHaveURL(/\/chiusura-cassa\/[a-z0-9]{20,}$/, { timeout: 15_000 })
  })
})

/** Il giorno come lo scrive lo storico delle chiusure: «GIO 18/04/19». */
function dataCompatta(giorno: string): string {
  const giorniSettimana = ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB']
  const [anno, mese, dì] = giorno.split('-')
  const d = new Date(`${giorno}T12:00:00`)
  return `${giorniSettimana[d.getDay()]} ${dì}/${mese}/${anno.slice(-2)}`
}

function cardRiepilogo(page: Page): Locator {
  return page.locator('div[data-slot="card"]').filter({ hasText: 'Riepilogo' }).last()
}

/**
 * Nel riepilogo etichetta e importo sono due `<span>` fratelli. Prendere «lo
 * span monospace dentro la card» non basta: «Contanti:» compare due volte
 * (movimentazione e quadratura) e si finirebbe a verificare un numero diverso
 * da quello che si crede — è così che il primo tentativo di questo test
 * confrontava il totale con la differenza di cassa.
 */
function voce(riepilogo: Locator, etichetta: string): Locator {
  return riepilogo.locator(
    `xpath=.//span[normalize-space(.)='${etichetta}']/following-sibling::span[1]`
  )
}

/** Registra le conferme native che l'applicazione chiede, e le accetta. */
function raccogliConferme(page: Page): string[] {
  const domande: string[] = []
  page.on('dialog', (dialog) => {
    domande.push(dialog.message())
    void dialog.accept()
  })
  return domande
}
