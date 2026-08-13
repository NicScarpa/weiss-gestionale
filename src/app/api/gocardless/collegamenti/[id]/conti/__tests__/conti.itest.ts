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

    const esito = await callRoute<{ conti: Array<{ tipo: string; nomeConto?: string }> }>(
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

    const esito = await callRoute<{ conti: Array<{ ultimoMovimento: string | null }> }>(
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

    const esito = await callRoute<{ conti: Array<{ ultimoMovimento: string | null }> }>(
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

    const esito = await callRoute<{ conti: Array<{ tipo: string }> }>(
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

    const esito = await callRoute<{ conti: Array<{ tipo: string; bankAccountId?: string }> }>(
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

describe('PUT configurazione dei conti', () => {
  it('accende un conto con la sua data di taglio', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)

    const esito = await callRoute<{ salvati: number }>(
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

    const esito = await callRoute<{ conti: Array<{ syncEnabled: boolean; syncCutoffDate: string | null }> }>(
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
