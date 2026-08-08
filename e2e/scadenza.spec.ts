import { expect, test, type Page } from '@playwright/test'
import { apriConSessioneAdmin } from './helpers/app'
import { archiviaScadenzePerDescrizione, chiudiDb, scadenzeVivePerDescrizione } from './helpers/db'

/**
 * Creazione di una scadenza. Due cose, entrambe già costate un incidente:
 *
 * 1. Il giorno salvato è quello scelto nel calendario. Il payload manda un
 *    giorno civile 'yyyy-MM-dd' e non una `Date`, perché `JSON.stringify` di
 *    una `Date` produce l'istante UTC: una scadenza scelta per il 15 e inserita
 *    dopo le 22:00 italiane arrivava al server come il 14, cioè già scaduta.
 *    Il test sceglie una data e legge dal database quella salvata.
 *
 * 2. Un solo salvataggio anche con più click. Fra il click e il re-render React
 *    passa un attimo in cui altri click arrivano lo stesso, e ognuno creava una
 *    scadenza; il rimedio è un ref che cambia valore prima di qualunque await.
 *    Il test clicca tre volte nello stesso giro di esecuzione e conta le righe.
 */

const DESCRIZIONE_DATA = 'E2E scadenza data scelta'
const DESCRIZIONE_DOPPIONE = 'E2E scadenza click ripetuti'

test.describe('Scadenzario', () => {
  test.afterAll(async () => {
    await archiviaScadenzePerDescrizione(DESCRIZIONE_DATA)
    await archiviaScadenzePerDescrizione(DESCRIZIONE_DOPPIONE)
    await chiudiDb()
  })

  test('la data salvata è quella scelta nel calendario', async ({ page }) => {
    await archiviaScadenzePerDescrizione(DESCRIZIONE_DATA)
    await apriConSessioneAdmin(page, '/scadenzario')

    const giorno = quindiciDelMeseProssimo()

    await apriDialogNuovaScadenza(page)
    const dialog = dialogScadenza(page)
    await dialog.getByLabel('Descrizione *').fill(DESCRIZIONE_DATA)
    await dialog.getByRole('spinbutton').first().fill('250.50')

    await scegliDataScadenza(page, giorno)
    // Prima ancora del salvataggio: il bottone deve mostrare il giorno scelto.
    // Se il calendario avesse selezionato il giorno sbagliato, il resto del
    // test verificherebbe la coerenza di un errore.
    await expect(dialog.getByRole('button', { name: formatoItaliano(giorno) })).toBeVisible()

    await dialog.getByRole('button', { name: 'Conferma' }).click()
    await expect(dialog).toBeHidden({ timeout: 20_000 })

    const salvate = await scadenzeVivePerDescrizione(DESCRIZIONE_DATA)
    expect(salvate).toHaveLength(1)
    expect(salvate[0].dataScadenza.toISOString().slice(0, 10)).toBe(giorno)
    expect(Number(salvate[0].importoTotale)).toBeCloseTo(250.5, 2)
  })

  test('tre click sul salva creano una scadenza sola', async ({ page }) => {
    await archiviaScadenzePerDescrizione(DESCRIZIONE_DOPPIONE)
    await apriConSessioneAdmin(page, '/scadenzario')

    await apriDialogNuovaScadenza(page)
    const dialog = dialogScadenza(page)
    await dialog.getByLabel('Descrizione *').fill(DESCRIZIONE_DOPPIONE)
    await dialog.getByRole('spinbutton').first().fill('99')

    // I tre click partono nello stesso giro di esecuzione del browser: è la
    // condizione che il `disabled` sul bottone da solo non copre, perché il
    // re-render di React arriva dopo. Con `click()` di Playwright, che aspetta
    // che l'elemento sia azionabile fra un click e l'altro, la corsa non si
    // riprodurrebbe e il test sarebbe verde per il motivo sbagliato.
    const submitPartiti = await dialog
      .getByRole('button', { name: 'Conferma' })
      .evaluate((bottone: HTMLElement) => {
        let contati = 0
        const form = document.getElementById('create-schedule-form')!
        form.addEventListener('submit', () => contati++, true)
        bottone.click()
        bottone.click()
        bottone.click()
        return contati
      })

    // Senza questa verifica il test sarebbe una tautologia: se il browser
    // avesse consegnato un submit solo, «una scadenza sola» sarebbe vero anche
    // con la protezione rimossa. Tre submit consegnati e una riga salvata è
    // quello che si vuole poter affermare.
    expect(submitPartiti, 'i tre click devono produrre tre submit').toBe(3)

    await expect(dialog).toBeHidden({ timeout: 20_000 })
    // Il dialog si chiude appena la prima risposta arriva: si dà tempo a due
    // eventuali salvataggi in più di materializzarsi prima di contare.
    await page.waitForTimeout(2_000)

    const salvate = await scadenzeVivePerDescrizione(DESCRIZIONE_DOPPIONE)
    expect(salvate).toHaveLength(1)
  })
})

/** Il 15 del mese prossimo: lontano dai bordi, mai un «giorno fuori mese». */
function quindiciDelMeseProssimo(): string {
  const oggi = new Date()
  const d = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 15)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`
}

function formatoItaliano(giorno: string): string {
  const [anno, mese, dì] = giorno.split('-')
  return `${dì}/${mese}/${anno}`
}

/**
 * Il dialog va identificato per nome: in Radix anche il popover del calendario
 * ha `role="dialog"`, e un `getByRole('dialog')` nudo ne trova due — con
 * l'aggravante che il secondo è chiuso, quindi un'asserzione «è nascosto»
 * passerebbe guardando l'elemento sbagliato.
 */
function dialogScadenza(page: Page) {
  return page.getByRole('dialog', { name: 'Aggiungi nuova scadenza' })
}

async function apriDialogNuovaScadenza(page: Page) {
  await page.getByRole('button', { name: 'Nuova Scadenza' }).click()
  await expect(page.getByRole('heading', { name: 'Aggiungi nuova scadenza' })).toBeVisible()
}

/**
 * Il calendario si apre sul mese corrente; il giorno si identifica con
 * `data-day`, che il componente valorizza con `toLocaleDateString()` — cioè
 * dipende dalla lingua del browser. Il valore atteso si calcola nel browser
 * stesso, così il test non si rompe se la lingua cambia.
 */
async function scegliDataScadenza(page: Page, giorno: string) {
  const dialog = dialogScadenza(page)
  await dialog.getByRole('button', { name: /^\d{2}\/\d{2}\/\d{4}$/ }).last().click()

  const calendario = page.locator('.rdp-root').last()
  await expect(calendario).toBeVisible()
  await calendario.locator('.rdp-button_next').click()

  const chiave = await page.evaluate(
    (iso) => new Date(iso).toLocaleDateString(),
    `${giorno}T12:00:00`
  )
  await calendario.locator(`[data-day="${chiave}"]`).click()
}
