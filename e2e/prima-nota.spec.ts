import { expect, test, type Page } from '@playwright/test'
import { apriConSessioneAdmin, euro } from './helpers/app'
import { archiviaMovimentiPerDescrizione, chiudiDb } from './helpers/db'

/**
 * I saldi della prima nota.
 *
 * Le card in cima alla pagina sono renderizzate dal layout server chiamando
 * `saldiAlGiorno`; `/api/prima-nota/saldi` chiama la stessa funzione. Il test
 * verifica che i due numeri coincidano — che è il difetto che si vuole
 * presidiare: prima le card leggevano `register_balances`, una tabella che
 * nessun codice popolava, e mostravano zero mentre l'API rispondeva il saldo
 * vero.
 *
 * Confrontare due zeri però non prova niente: il test prima registra un
 * movimento di importo riconoscibile e verifica che il saldo si muova
 * esattamente di quell'importo.
 */

const DESCRIZIONE = 'E2E saldo prima nota'
const IMPORTO = 137.42

test.describe('Prima nota', () => {
  test.beforeEach(async () => {
    await archiviaMovimentiPerDescrizione(DESCRIZIONE)
  })

  test.afterAll(async () => {
    await archiviaMovimentiPerDescrizione(DESCRIZIONE)
    await chiudiDb()
  })

  test('le card dei saldi mostrano quello che risponde l\'API, e si muovono col movimento', async ({
    page,
  }) => {
    await apriConSessioneAdmin(page, '/prima-nota/movimenti')

    const primaCassa = await saldoDallApi(page, 'CASH')
    const primaBanca = await saldoDallApi(page, 'BANK')

    await expect(cardSaldo(page, 'CASSA')).toHaveText(euro(primaCassa))
    await expect(cardSaldo(page, 'BANCA')).toHaveText(euro(primaBanca))
    await expect(cardSaldo(page, 'LIQUIDITÀ TOTALE')).toHaveText(euro(primaCassa + primaBanca))

    // ---- Un incasso in cassa -------------------------------------------------
    await page.getByRole('button', { name: 'Nuovo' }).click()
    await page.getByRole('menuitem', { name: 'Crea movimento' }).click()

    const dialog = page.getByRole('dialog').filter({ hasText: 'Nuovo Movimento' })
    await expect(dialog).toBeVisible()
    // Registro «Cassa» e tipo «Incasso» sono già i valori predefiniti del form.
    await dialog.getByRole('spinbutton').first().fill(String(IMPORTO))
    await dialog.getByPlaceholder('Descrizione del movimento...').fill(DESCRIZIONE)
    // L'IVA è dichiarata opzionale ma lasciarla vuota blocca il salvataggio:
    // vedi il test in fondo a questo file. Qui si compila per poter arrivare
    // al comportamento che si vuole verificare, cioè il saldo.
    await dialog.getByRole('spinbutton').last().fill('0')
    await dialog.getByRole('button', { name: 'Salva' }).click()

    await expect(dialog).toBeHidden({ timeout: 20_000 })
    await expect(page.getByRole('cell', { name: DESCRIZIONE })).toBeVisible({ timeout: 20_000 })

    // Le card vengono dal layout server: si aggiornano al ricaricamento, non
    // alla mutazione lato client.
    await page.reload()

    const dopoCassa = await saldoDallApi(page, 'CASH')
    const dopoBanca = await saldoDallApi(page, 'BANK')

    expect(dopoCassa).toBeCloseTo(primaCassa + IMPORTO, 2)
    expect(dopoBanca).toBeCloseTo(primaBanca, 2)

    await expect(cardSaldo(page, 'CASSA')).toHaveText(euro(dopoCassa))
    await expect(cardSaldo(page, 'BANCA')).toHaveText(euro(dopoBanca))
    await expect(cardSaldo(page, 'LIQUIDITÀ TOTALE')).toHaveText(euro(dopoCassa + dopoBanca))
  })

  /**
   * DIFETTO NOTO — non correggere qui: il file è di un altro proprietario.
   *
   * Il campo «IVA (opzionale)» è registrato con `valueAsNumber: true`
   * (src/components/prima-nota/movimenti/MovimentoFormDialog.tsx:337): lasciato
   * vuoto produce `NaN`, e lo schema `z.number().min(0).optional()` lo rifiuta
   * con «Invalid input: expected number, received NaN». Risultato: un campo
   * dichiarato opzionale è di fatto obbligatorio e nessun movimento si salva
   * senza scrivere un'IVA. Vale anche per l'importo, che però l'utente compila
   * comunque.
   *
   * `test.fail()`: deve fallire finché il difetto c'è; quando sarà corretto
   * tornerà rosso e sarà il segnale per togliere l'annotazione.
   */
  test('un movimento senza IVA si salva (difetto noto: il campo opzionale blocca)', async ({
    page,
  }) => {
    test.fail()

    await apriConSessioneAdmin(page, '/prima-nota/movimenti')

    await page.getByRole('button', { name: 'Nuovo' }).click()
    await page.getByRole('menuitem', { name: 'Crea movimento' }).click()

    const dialog = page.getByRole('dialog').filter({ hasText: 'Nuovo Movimento' })
    await dialog.getByRole('spinbutton').first().fill('10')
    await dialog.getByPlaceholder('Descrizione del movimento...').fill(DESCRIZIONE)
    await dialog.getByRole('button', { name: 'Salva' }).click()

    await expect(dialog).toBeHidden({ timeout: 10_000 })
  })
})

/**
 * `page.request` condivide i cookie del contesto: la chiamata parte con la
 * stessa sessione della pagina, che è la sola condizione perché il confronto
 * abbia senso.
 */
async function saldoDallApi(page: Page, registro: 'CASH' | 'BANK'): Promise<number> {
  const risposta = await page.request.get('/api/prima-nota/saldi')
  expect(risposta.status(), 'l\'API dei saldi deve rispondere 200').toBe(200)

  const corpo = (await risposta.json()) as {
    data: Array<{ registers: Record<string, { closingBalance: number }> }>
  }
  return corpo.data[0].registers[registro].closingBalance
}

/**
 * L'importo grande dentro la card del registro indicato. Il filtro è sul titolo
 * *esatto*: `hasText` fa una ricerca per sottostringa e senza distinzione di
 * maiuscole, quindi «CASSA» prenderebbe anche card che parlano di cassa per
 * altri motivi.
 */
function cardSaldo(page: Page, titolo: string) {
  return page
    .locator('div[data-slot="card"]')
    .filter({ has: page.getByText(titolo, { exact: true }) })
    .locator('div.font-mono')
    .first()
}
