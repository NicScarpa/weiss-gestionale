import { describe, it, expect, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { impostaClientPerTest } from '@/lib/gocardless/servizio'
import type { ClientGoCardless } from '@/lib/gocardless/client'
import { GET as leggiConti, PUT as salvaConti } from '../route'

setupIntegrationDb()
afterEach(() => impostaClientPerTest(null))

const IBAN_A = 'IT00X0000000000000000001111'
const IBAN_B = 'IT00X0000000000000000002222'

async function connessioneCollegata(conti: string[]) {
  const venue = await venueDiTest()
  const connessione = await prisma.bankConnection.create({
    data: {
      venueId: venue.id,
      institutionId: 'BANCA_FINTA_XXXX',
      institutionName: 'Banca Finta',
      requisitionId: 'req-1',
      status: 'LN',
    },
  })
  // Ogni chiamata al client finto (requisition o dettagli) aggiunge una voce
  // qui: è ciò che permette ai test sul risparmio di chiamate di dimostrare
  // che la seconda lettura non tocca la banca.
  const chiamate: string[] = []
  impostaClientPerTest({
    leggiRequisition: async () => {
      chiamate.push('leggiRequisition')
      return { dati: { id: 'req-1', status: 'LN', accounts: conti, link: '' }, limiti: { restanti: null, ripresaFraSecondi: null } }
    },
    dettagliConto: async (id: string) => {
      chiamate.push('dettagliConto')
      return {
        dati: { account: { iban: id === 'gc-a' ? IBAN_A : IBAN_B, currency: 'EUR' } },
        limiti: { restanti: null, ripresaFraSecondi: null },
      }
    },
  } as unknown as ClientGoCardless)
  return { venue, connessione, chiamate }
}

async function contoDiTest(venueId: string, nome: string, iban: string) {
  return prisma.bankAccount.create({
    data: { venueId, name: nome, accountType: 'BANK', iban, currency: 'EUR' },
  })
}

describe('GET conti di un collegamento', () => {
  it('abbina i conti riconosciuti e lascia sconosciuti gli altri', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a', 'gc-b'])
    await contoDiTest(venue.id, 'Conto principale', IBAN_A)

    const esito = await callRoute<{ conti: Array<{ tipo: string; nomeConto?: string }> }, { id: string }>(
      leggiConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`),
      { id: connessione.id }
    )

    expect(esito.status).toBe(200)
    expect(esito.body.conti[0]).toMatchObject({ tipo: 'riconosciuto', nomeConto: 'Conto principale' })
    expect(esito.body.conti[1]).toMatchObject({ tipo: 'sconosciuto' })
  })

  it('dice qual è il movimento più recente che gia possiede per il conto riconosciuto', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)
    await prisma.bankTransaction.create({
      data: {
        venueId: venue.id,
        bankAccountId: conto.id,
        transactionDate: new Date('2026-07-31T00:00:00.000Z'),
        description: 'Movimento da CSV',
        amount: '10.00',
      },
    })

    const esito = await callRoute<{ conti: Array<{ ultimoMovimento: string | null }> }, { id: string }>(
      leggiConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`),
      { id: connessione.id }
    )

    expect(esito.body.conti[0].ultimoMovimento).toBe('2026-07-31')
  })

  it('per un conto senza movimenti l ultimo movimento è nullo, non una data inventata', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    await contoDiTest(venue.id, 'Conto principale', IBAN_A)

    const esito = await callRoute<{ conti: Array<{ ultimoMovimento: string | null }> }, { id: string }>(
      leggiConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`),
      { id: connessione.id }
    )

    expect(esito.body.conti[0].ultimoMovimento).toBeNull()
  })

  it('non chiede più un conto già ignorato', async () => {
    await entraCome('admin')
    const { connessione } = await connessioneCollegata(['gc-a'])
    await prisma.bankConnection.update({ where: { id: connessione.id }, data: { contiIgnorati: ['gc-a'] } })

    const esito = await callRoute<{ conti: Array<{ tipo: string }> }, { id: string }>(
      leggiConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`),
      { id: connessione.id }
    )

    expect(esito.body.conti[0].tipo).toBe('ignorato')
  })

  // `abbinaConti` decide `gia-collegato` guardando `connectionId` qualunque
  // esso sia: senza normalizzare quello di questa stessa connessione, un
  // conto appena configurato tornerebbe «già legato a un'altra connessione»
  // — intoccabile dal pannello che dovrebbe poterne cambiare la data.
  it('il conto appena configurato da questa connessione torna riconosciuto, non già collegato altrove', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)

    await callRoute(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: { conti: [{ providerAccountId: 'gc-a', azione: 'configura', attivo: true, bankAccountId: conto.id, dataTaglio: '2026-08-12' }] },
      }),
      { id: connessione.id }
    )

    const esito = await callRoute<{ conti: Array<{ tipo: string; bankAccountId?: string }> }, { id: string }>(
      leggiConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`),
      { id: connessione.id }
    )

    expect(esito.body.conti[0]).toMatchObject({ tipo: 'riconosciuto', bankAccountId: conto.id })
  })

  it('non espone il collegamento di un altra sede', async () => {
    await entraCome('admin')
    const { connessione } = await connessioneCollegata(['gc-a'])
    // `Venue.code` è obbligatorio e unico: senza, la `create` fallisce.
    const altra = await prisma.venue.create({ data: { name: 'Altra sede', code: 'ALTRA' } })
    await prisma.bankConnection.update({ where: { id: connessione.id }, data: { venueId: altra.id } })

    const esito = await callRoute(leggiConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`), { id: connessione.id })

    expect(esito.status).toBe(404)
  })
})

// C1 della revisione finale: `accessValidUntil` non si scrive più in
// POST /collegamenti o POST /rinnovo, ma qui — nel punto in cui la GET
// scopre che lo stato è appena passato a `LN`. Prima di allora un consenso
// mai concesso (autenticazione mai completata) non deve avere una scadenza.
describe('la scadenza si scrive quando il consenso diventa attivo, non prima', () => {
  it('scrive accessValidUntil nel momento in cui lo stato passa a LN', async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    const connessione = await prisma.bankConnection.create({
      data: {
        venueId: venue.id,
        institutionId: 'BANCA_FINTA_XXXX',
        institutionName: 'Banca Finta',
        requisitionId: 'req-1',
        status: 'UA',
        accessValidUntil: null,
      },
    })
    impostaClientPerTest({
      leggiRequisition: async () => ({
        dati: { id: 'req-1', status: 'LN', accounts: [], link: '' },
        limiti: { restanti: null, ripresaFraSecondi: null },
      }),
      istituzioni: async () => ({
        dati: [{ id: 'BANCA_FINTA_XXXX', name: 'Banca Finta', max_access_valid_for_days: '90' }],
        limiti: { restanti: null, ripresaFraSecondi: null },
      }),
    } as unknown as ClientGoCardless)

    await callRoute(leggiConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`), { id: connessione.id })

    const riga = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connessione.id } })
    expect(riga.status).toBe('LN')
    expect(riga.accessValidUntil).not.toBeNull()
    const giorniAllaScadenza = Math.round((riga.accessValidUntil!.getTime() - Date.now()) / 86_400_000)
    expect(giorniAllaScadenza).toBeGreaterThanOrEqual(89)
    expect(giorniAllaScadenza).toBeLessThanOrEqual(90)
  })

  // Il client finto non ha `istituzioni`: se il codice la chiamasse fuori dal
  // ramo `LN` il test esploderebbe con un errore chiaro invece di passare in
  // silenzio, dimostrando che quella chiamata resta condizionata allo stato.
  it('non tocca la scadenza se lo stato resta non attivo', async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    const connessione = await prisma.bankConnection.create({
      data: {
        venueId: venue.id,
        institutionId: 'BANCA_FINTA_XXXX',
        institutionName: 'Banca Finta',
        requisitionId: 'req-1',
        status: 'CR',
        accessValidUntil: null,
      },
    })
    impostaClientPerTest({
      leggiRequisition: async () => ({
        dati: { id: 'req-1', status: 'UA', accounts: [], link: '' },
        limiti: { restanti: null, ripresaFraSecondi: null },
      }),
    } as unknown as ClientGoCardless)

    await callRoute(leggiConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`), { id: connessione.id })

    const riga = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connessione.id } })
    expect(riga.status).toBe('UA')
    expect(riga.accessValidUntil).toBeNull()
  })

  // Ultimo giro della revisione finale. L'istituto sparito dal catalogo
  // (fusione, ritiro dall'elenco) non deve produrre una scadenza inventata:
  // la stessa condizione, in POST /rinnovo, risponde con un 409 esplicito
  // perché lì la conseguenza sarebbe visibile subito. Qui sarebbe
  // invisibile — una data a schermo indistinguibile da una vera — quindi si
  // tratta come «non ho l'informazione».
  it("non scrive una scadenza inventata se l'istituto non è più disponibile", async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    const connessione = await prisma.bankConnection.create({
      data: {
        venueId: venue.id,
        institutionId: 'BANCA_SPARITA',
        institutionName: 'Banca Sparita',
        requisitionId: 'req-1',
        status: 'UA',
        accessValidUntil: null,
      },
    })
    impostaClientPerTest({
      leggiRequisition: async () => ({
        dati: { id: 'req-1', status: 'LN', accounts: [], link: '' },
        limiti: { restanti: null, ripresaFraSecondi: null },
      }),
      istituzioni: async () => ({
        dati: [{ id: 'ALTRA_BANCA', name: 'Un altro istituto', max_access_valid_for_days: '90' }],
        limiti: { restanti: null, ripresaFraSecondi: null },
      }),
    } as unknown as ClientGoCardless)

    const esito = await callRoute(leggiConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`), { id: connessione.id })

    expect(esito.status).toBe(200)
    const riga = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connessione.id } })
    expect(riga.status).toBe('LN')
    expect(riga.accessValidUntil).toBeNull()
  })

  // La stessa chiamata è un arricchimento, non l'essenziale: sta nella
  // stessa catena `await` che scrive lo stato, e un 429 o un 5xx qui non
  // deve far fallire l'intera lettura dei conti proprio quando
  // l'amministratore torna dalla banca.
  it('un errore di istituzioni() non fa fallire la lettura: lo stato si scrive lo stesso', async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    const connessione = await prisma.bankConnection.create({
      data: {
        venueId: venue.id,
        institutionId: 'BANCA_FINTA_XXXX',
        institutionName: 'Banca Finta',
        requisitionId: 'req-1',
        status: 'UA',
        accessValidUntil: null,
      },
    })
    impostaClientPerTest({
      leggiRequisition: async () => ({
        dati: { id: 'req-1', status: 'LN', accounts: [], link: '' },
        limiti: { restanti: null, ripresaFraSecondi: null },
      }),
      istituzioni: async () => {
        throw new Error('la banca non risponde')
      },
    } as unknown as ClientGoCardless)

    const esito = await callRoute(leggiConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`), { id: connessione.id })

    expect(esito.status).toBe(200)
    const riga = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connessione.id } })
    expect(riga.status).toBe('LN')
    expect(riga.accessValidUntil).toBeNull()
  })
})

describe('PUT configurazione dei conti', () => {
  it('accende un conto con la sua data di taglio', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)

    const esito = await callRoute<{ salvati: number }, { id: string }>(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: { conti: [{ providerAccountId: 'gc-a', azione: 'configura', attivo: true, bankAccountId: conto.id, dataTaglio: '2026-08-12' }] },
      }),
      { id: connessione.id }
    )

    expect(esito.status).toBe(200)
    const aggiornato = await prisma.bankAccount.findUniqueOrThrow({ where: { id: conto.id } })
    expect(aggiornato).toMatchObject({
      providerAccountId: 'gc-a',
      connectionId: connessione.id,
      syncEnabled: true,
    })
    expect(aggiornato.syncCutoffDate?.toISOString().slice(0, 10)).toBe('2026-08-12')
  })

  // La data di taglio è l'unica cosa che impedisce di reimportare quello che
  // il CSV ha già portato dentro: senza, non si accende niente.
  it('rifiuta di accendere un conto senza data di taglio', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)

    const esito = await callRoute(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: { conti: [{ providerAccountId: 'gc-a', azione: 'configura', attivo: true, bankAccountId: conto.id }] },
      }),
      { id: connessione.id }
    )

    expect(esito.status).toBe(400)
    expect(await prisma.bankAccount.findUniqueOrThrow({ where: { id: conto.id } })).toMatchObject({ syncEnabled: false })
  })

  it('un conto ignorato finisce nella lista della connessione e non accende nulla', async () => {
    await entraCome('admin')
    const { connessione } = await connessioneCollegata(['gc-a'])

    await callRoute(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: { conti: [{ providerAccountId: 'gc-a', azione: 'ignora' }] },
      }),
      { id: connessione.id }
    )

    const riga = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connessione.id } })
    expect(riga.contiIgnorati).toEqual(['gc-a'])
  })

  // Sequenza «prima lo importo, poi cambio idea e lo ignoro»: due richieste
  // distinte, il percorso più naturale che esista. Senza lo spegnimento,
  // `abbinaConti` classifica il conto come 'ignorato' alla lettura
  // successiva — variante che non porta `bankAccountId` — e il conto
  // continuerebbe a sincronizzare, irraggiungibile dal pannello per
  // spegnerlo.
  it('ignorare un conto già importato lo spegne davvero', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)

    await callRoute(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: { conti: [{ providerAccountId: 'gc-a', azione: 'configura', attivo: true, bankAccountId: conto.id, dataTaglio: '2026-08-12' }] },
      }),
      { id: connessione.id }
    )

    await callRoute(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: { conti: [{ providerAccountId: 'gc-a', azione: 'ignora' }] },
      }),
      { id: connessione.id }
    )

    const aggiornato = await prisma.bankAccount.findUniqueOrThrow({ where: { id: conto.id } })
    expect(aggiornato).toMatchObject({ syncEnabled: false, connectionId: null, providerAccountId: null })
    const riga = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connessione.id } })
    expect(riga.contiIgnorati).toEqual(['gc-a'])
  })

  it('«lascia» non tocca niente', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)

    await callRoute(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: { conti: [{ providerAccountId: 'gc-a', azione: 'lascia' }] },
      }),
      { id: connessione.id }
    )

    const aggiornato = await prisma.bankAccount.findUniqueOrThrow({ where: { id: conto.id } })
    expect(aggiornato).toMatchObject({ syncEnabled: false, providerAccountId: null, connectionId: null })
  })

  // Senza questo controllo, la seconda voce vince perché scritta per ultima
  // nella stessa transazione: il conto resta acceso e sincronizza, ma
  // `abbinaConti` lo classifica «ignorato» alla lettura successiva — e quella
  // variante non porta `bankAccountId`, quindi diventa irraggiungibile dal
  // pannello.
  it('rifiuta un corpo con lo stesso conto due volte, con azioni in conflitto', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)

    const esito = await callRoute(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: {
          conti: [
            { providerAccountId: 'gc-a', azione: 'configura', attivo: true, bankAccountId: conto.id, dataTaglio: '2026-08-12' },
            { providerAccountId: 'gc-a', azione: 'ignora' },
          ],
        },
      }),
      { id: connessione.id }
    )

    expect(esito.status).toBe(400)
    const aggiornato = await prisma.bankAccount.findUniqueOrThrow({ where: { id: conto.id } })
    expect(aggiornato).toMatchObject({ syncEnabled: false, providerAccountId: null, connectionId: null })
    const riga = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connessione.id } })
    expect(riga.contiIgnorati).toEqual([])
  })

  // Ultimo giro della revisione finale: speculare al test sopra, sul verso
  // opposto. Due `providerAccountId` diversi non fermano il controllo dei
  // duplicati, ma se scelgono lo stesso `bankAccountId` scriverebbero la
  // stessa riga due volte nella stessa transazione — vince l'ultima,
  // `salvati` ne conterebbe comunque due, e nessuno saprebbe quale
  // configurazione è davvero in vigore.
  it('rifiuta due righe che scelgono lo stesso conto del gestionale', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a', 'gc-b'])
    const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)

    const esito = await callRoute(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: {
          conti: [
            { providerAccountId: 'gc-a', azione: 'configura', attivo: true, bankAccountId: conto.id, dataTaglio: '2026-08-12' },
            { providerAccountId: 'gc-b', azione: 'configura', attivo: true, bankAccountId: conto.id, dataTaglio: '2026-08-12' },
          ],
        },
      }),
      { id: connessione.id }
    )

    expect(esito.status).toBe(400)
    const invariato = await prisma.bankAccount.findUniqueOrThrow({ where: { id: conto.id } })
    expect(invariato).toMatchObject({ syncEnabled: false, providerAccountId: null, connectionId: null })
  })

  // La lettura propone come candidati solo i conti BANK; senza filtrare
  // `accountType` anche in scrittura, passare l'id di una cassa la
  // trasforma in un conto bancario sincronizzato.
  it('rifiuta di accendere una cassa come se fosse un conto bancario', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    const cassa = await prisma.bankAccount.create({
      data: { venueId: venue.id, name: 'Cassa contanti', accountType: 'CASH', currency: 'EUR' },
    })

    const esito = await callRoute(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: { conti: [{ providerAccountId: 'gc-a', azione: 'configura', attivo: true, bankAccountId: cassa.id, dataTaglio: '2026-08-12' }] },
      }),
      { id: connessione.id }
    )

    expect(esito.status).toBe(400)
    const aggiornata = await prisma.bankAccount.findUniqueOrThrow({ where: { id: cassa.id } })
    expect(aggiornata).toMatchObject({ syncEnabled: false, providerAccountId: null, connectionId: null })
  })

  // I3 della revisione finale. Il pannello abbina per impronta dell'IBAN, la
  // sincronizzazione userà `providerAccountId`: se un secondo conto banca
  // (senza IBAN, per esempio una carta) si abbina allo stesso conto del
  // gestionale già legato al primo, il pannello continuerebbe a mostrare
  // l'abbinamento per impronta (rifatto alla lettura successiva) mentre la
  // banca dati userebbe per sincronizzare il conto appena scritto — due cose
  // diverse, e nessuna delle due lo direbbe.
  it('rifiuta di abbinare un conto del gestionale già abbinato a un altro conto banca', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a', 'gc-b'])
    const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)

    await callRoute(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: { conti: [{ providerAccountId: 'gc-a', azione: 'configura', attivo: true, bankAccountId: conto.id, dataTaglio: '2026-08-12' }] },
      }),
      { id: connessione.id }
    )

    const esito = await callRoute(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: { conti: [{ providerAccountId: 'gc-b', azione: 'configura', attivo: true, bankAccountId: conto.id, dataTaglio: '2026-08-12' }] },
      }),
      { id: connessione.id }
    )

    expect(esito.status).toBe(400)
    const aggiornato = await prisma.bankAccount.findUniqueOrThrow({ where: { id: conto.id } })
    expect(aggiornato.providerAccountId).toBe('gc-a')
  })

  // Lo stesso abbinamento, riscritto (stesso conto banca, stesso conto del
  // gestionale) resta permesso: è solo un cambio di data o interruttore, non
  // lo spostamento descritto sopra.
  it('permette di riscrivere lo stesso abbinamento già salvato', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)
    const corpo = (dataTaglio: string) => ({
      conti: [{ providerAccountId: 'gc-a', azione: 'configura', attivo: true, bankAccountId: conto.id, dataTaglio }],
    })

    await callRoute(salvaConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, { method: 'PUT', body: corpo('2026-08-12') }), { id: connessione.id })
    const esito = await callRoute(salvaConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, { method: 'PUT', body: corpo('2026-08-20') }), { id: connessione.id })

    expect(esito.status).toBe(200)
    const aggiornato = await prisma.bankAccount.findUniqueOrThrow({ where: { id: conto.id } })
    expect(aggiornato.syncCutoffDate?.toISOString().slice(0, 10)).toBe('2026-08-20')
  })

  // m3 della revisione finale. `filteredAccounts` porta dentro anche gli
  // archiviati quando «Mostra archiviati» è acceso: senza questo controllo,
  // un conto archiviato diventerebbe destinazione di movimenti bancari pur
  // restando invisibile alle operazioni quotidiane.
  it('rifiuta di abbinare un conto archiviato', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    const conto = await prisma.bankAccount.create({
      data: { venueId: venue.id, name: 'Conto archiviato', accountType: 'BANK', iban: IBAN_A, currency: 'EUR', isActive: false },
    })

    const esito = await callRoute(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: { conti: [{ providerAccountId: 'gc-a', azione: 'configura', attivo: true, bankAccountId: conto.id, dataTaglio: '2026-08-12' }] },
      }),
      { id: connessione.id }
    )

    expect(esito.status).toBe(400)
    const aggiornato = await prisma.bankAccount.findUniqueOrThrow({ where: { id: conto.id } })
    expect(aggiornato).toMatchObject({ syncEnabled: false, providerAccountId: null, connectionId: null })
  })

  // Chiusura del punto 5 di «Dopo il piano: cosa resta». Il controllo su
  // `providerAccountId` sopra guarda la colonna SALVATA, che per un conto
  // abbinato solo per impronta (mostrato «riconosciuto» dalla GET, mai
  // passato da un «Salva») è vuota: non basta da solo. Scenario esatto: `X`
  // ha la stessa impronta di `gc-a` (mai salvata su `X`), `gc-b` non ha
  // impronta che corrisponda a nulla. Scegliere `X` per `gc-b` passerebbe il
  // controllo sulla colonna — vuota — ma alla lettura successiva
  // `abbinaConti` riabbina `gc-a → X` per impronta, con l'interruttore e la
  // data pensati per `gc-b`: il pannello mostra un abbinamento, la colonna
  // ne dice un altro.
  it("rifiuta un conto del gestionale che corrisponde per IBAN a un altro conto della banca", async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a', 'gc-b'])
    const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)
    // Popola la memoria: senza, il controllo si salterebbe (caso 4 sotto).
    await callRoute(leggiConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`), { id: connessione.id })

    const esito = await callRoute<{ error: string }, { id: string }>(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: { conti: [{ providerAccountId: 'gc-b', azione: 'configura', attivo: true, bankAccountId: conto.id, dataTaglio: '2026-08-13' }] },
      }),
      { id: connessione.id }
    )

    expect(esito.status).toBe(400)
    // Il messaggio nomina la forma mascherata del conto con cui fa coppia,
    // così l'amministratore capisce cosa fare invece di un rifiuto muto.
    expect(esito.body.error).toContain('IT•• •••• 1111')
    const invariato = await prisma.bankAccount.findUniqueOrThrow({ where: { id: conto.id } })
    expect(invariato).toMatchObject({ syncEnabled: false, providerAccountId: null, connectionId: null })
  })

  // I quattro casi che devono continuare a passare: è facilissimo romperli
  // aggiungendo il controllo sull'impronta sopra.
  describe('il controllo sull\'impronta non rompe i casi normali', () => {
    it('caso 1: accetta quando l\'impronta corrisponde proprio al conto che si sta salvando', async () => {
      await entraCome('admin')
      const { venue, connessione } = await connessioneCollegata(['gc-a'])
      const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)
      await callRoute(leggiConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`), { id: connessione.id })

      const esito = await callRoute(
        salvaConti,
        jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
          method: 'PUT',
          body: { conti: [{ providerAccountId: 'gc-a', azione: 'configura', attivo: true, bankAccountId: conto.id, dataTaglio: '2026-08-13' }] },
        }),
        { id: connessione.id }
      )

      expect(esito.status).toBe(200)
    })

    it('caso 2: permette di risalvare lo stesso abbinamento cambiando solo la data', async () => {
      await entraCome('admin')
      const { venue, connessione } = await connessioneCollegata(['gc-a'])
      const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)
      await callRoute(leggiConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`), { id: connessione.id })
      const corpo = (dataTaglio: string) => ({
        conti: [{ providerAccountId: 'gc-a', azione: 'configura', attivo: true, bankAccountId: conto.id, dataTaglio }],
      })

      await callRoute(salvaConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, { method: 'PUT', body: corpo('2026-08-12') }), { id: connessione.id })
      const esito = await callRoute(salvaConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, { method: 'PUT', body: corpo('2026-08-20') }), { id: connessione.id })

      expect(esito.status).toBe(200)
      const aggiornato = await prisma.bankAccount.findUniqueOrThrow({ where: { id: conto.id } })
      expect(aggiornato.syncCutoffDate?.toISOString().slice(0, 10)).toBe('2026-08-20')
    })

    it('caso 3: un conto del gestionale senza IBAN è abbinabile a qualunque conto della banca', async () => {
      await entraCome('admin')
      const { venue, connessione } = await connessioneCollegata(['gc-a'])
      const conto = await prisma.bankAccount.create({
        data: { venueId: venue.id, name: 'Conto senza IBAN', accountType: 'BANK', currency: 'EUR' },
      })
      await callRoute(leggiConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`), { id: connessione.id })

      const esito = await callRoute(
        salvaConti,
        jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
          method: 'PUT',
          body: { conti: [{ providerAccountId: 'gc-a', azione: 'configura', attivo: true, bankAccountId: conto.id, dataTaglio: '2026-08-13' }] },
        }),
        { id: connessione.id }
      )

      expect(esito.status).toBe(200)
    })

    it('caso 4: senza memoria dei conti letti il controllo si salta, non rifiuta tutto', async () => {
      await entraCome('admin')
      const { venue, connessione } = await connessioneCollegata(['gc-a', 'gc-b'])
      const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)
      // Nessuna GET prima di questa PUT: `connessione.contiLetti` è null.

      const esito = await callRoute(
        salvaConti,
        jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
          method: 'PUT',
          body: { conti: [{ providerAccountId: 'gc-b', azione: 'configura', attivo: true, bankAccountId: conto.id, dataTaglio: '2026-08-13' }] },
        }),
        { id: connessione.id }
      )

      expect(esito.status).toBe(200)
    })
  })

  // Il regex accetta `2026-02-30`: `new Date(...)` non lancia, normalizza in
  // silenzio al primo marzo. Questa data è l'unica cosa che impedisce di
  // reimportare quello che il CSV ha già portato dentro, quindi uno
  // scivolamento silenzioso è il guasto che non deve accadere.
  it('rifiuta una data di taglio che non esiste nel calendario', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)

    const esito = await callRoute(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: { conti: [{ providerAccountId: 'gc-a', azione: 'configura', attivo: true, bankAccountId: conto.id, dataTaglio: '2026-02-30' }] },
      }),
      { id: connessione.id }
    )

    expect(esito.status).toBe(400)
    expect(await prisma.bankAccount.findUniqueOrThrow({ where: { id: conto.id } })).toMatchObject({ syncEnabled: false })
  })

  it('respinge chi non è amministratore', async () => {
    await entraCome('staff')
    const { connessione } = await connessioneCollegata(['gc-a'])

    const esito = await callRoute(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: { conti: [] },
      }),
      { id: connessione.id }
    )

    expect(esito.status).toBe(403)
  })
})

describe('memoria dei conti letti', () => {
  it('la prima lettura interroga la banca e conserva ciò che ha letto', async () => {
    await entraCome('admin')
    const { connessione } = await connessioneCollegata(['gc-a'])

    await callRoute(leggiConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`), { id: connessione.id })

    const riga = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connessione.id } })
    expect(riga.contiLettiIl).not.toBeNull()
    expect(Array.isArray(riga.contiLetti)).toBe(true)
  })

  // Il punto del task: quattro aperture del pannello non devono esaurire il
  // contingente della banca.
  it('la seconda lettura non chiama la banca', async () => {
    await entraCome('admin')
    const { connessione, chiamate } = await connessioneCollegata(['gc-a'])

    await callRoute(leggiConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`), { id: connessione.id })
    const dopoLaPrima = chiamate.length
    await callRoute(leggiConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`), { id: connessione.id })

    expect(chiamate.length).toBe(dopoLaPrima)
  })

  // Differito della revisione finale: un array vuoto è memoria valida quanto
  // uno pieno. Prima di questo fix `leggiConservati` lo scartava (la
  // lunghezza doveva essere > 0), quindi un consenso che copre zero conti
  // ricontattava la banca a ogni apertura del pannello — con C1 addosso,
  // quella chiamata sprecata sarebbe arrivata a costarne quattro.
  it('un consenso che copre zero conti non richiede di nuovo alla banca', async () => {
    await entraCome('admin')
    const { connessione, chiamate } = await connessioneCollegata([])

    await callRoute(leggiConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`), { id: connessione.id })
    const dopoLaPrima = chiamate.length
    await callRoute(leggiConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`), { id: connessione.id })

    expect(chiamate.length).toBe(dopoLaPrima)
  })

  it('con ?aggiorna=1 richiede alla banca anche se ha memoria', async () => {
    await entraCome('admin')
    const { connessione, chiamate } = await connessioneCollegata(['gc-a'])

    await callRoute(leggiConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`), { id: connessione.id })
    const dopoLaPrima = chiamate.length
    await callRoute(leggiConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti?aggiorna=1`), { id: connessione.id })

    expect(chiamate.length).toBeGreaterThan(dopoLaPrima)
  })

  // Nessun IBAN in chiaro a riposo: la colonna conserva impronta e maschera.
  it('non conserva mai l IBAN in chiaro', async () => {
    await entraCome('admin')
    const { connessione } = await connessioneCollegata(['gc-a'])

    await callRoute(leggiConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`), { id: connessione.id })

    const riga = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connessione.id } })
    expect(JSON.stringify(riga.contiLetti)).not.toContain(IBAN_A)
  })

  it('la risposta dice quali conti sono accesi e con quale data', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)
    await prisma.bankAccount.update({
      where: { id: conto.id },
      data: { connectionId: connessione.id, providerAccountId: 'gc-a', syncEnabled: true, syncCutoffDate: new Date('2026-08-13T00:00:00.000Z') },
    })

    const esito = await callRoute<{ conti: Array<{ syncEnabled: boolean; syncCutoffDate: string | null }> }, { id: string }>(
      leggiConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`),
      { id: connessione.id }
    )

    expect(esito.body.conti[0]).toMatchObject({ syncEnabled: true, syncCutoffDate: '2026-08-13' })
  })
})

describe('configura con lo stato desiderato', () => {
  it('spegne un conto senza ignorarlo, conservando abbinamento e data', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)

    const corpo = (attivo: boolean) => ({
      conti: [{ providerAccountId: 'gc-a', azione: 'configura', bankAccountId: conto.id, dataTaglio: '2026-08-13', attivo }],
    })

    await callRoute(salvaConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, { method: 'PUT', body: corpo(true) }), { id: connessione.id })
    await callRoute(salvaConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, { method: 'PUT', body: corpo(false) }), { id: connessione.id })

    const aggiornato = await prisma.bankAccount.findUniqueOrThrow({ where: { id: conto.id } })
    expect(aggiornato).toMatchObject({ syncEnabled: false, providerAccountId: 'gc-a', connectionId: connessione.id })
    expect(aggiornato.syncCutoffDate).not.toBeNull()
    const riga = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connessione.id } })
    expect(riga.contiIgnorati).toEqual([])
  })
})
