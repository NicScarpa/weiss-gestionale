import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import {
  creaChiusura,
  centroDiCosto,
  type ConteggioFixture,
} from '@/test/integration/fixtures/closures'
import { validateClosure } from '@/lib/services/closure-service'
import { PUT as aggiornaChiusura } from '../route'

/**
 * Correzione di una chiusura già validata.
 *
 * È il caso che l'audit ha segnalato come critico: l'admin può modificare gli
 * importi di una chiusura VALIDATA, ma le scritture di prima nota restavano
 * quelle generate alla validazione. Da quel momento lo stesso giorno aveva due
 * verità — una nella chiusura, una nei registri — e nessuna delle due era
 * dichiarata sbagliata.
 *
 * I test qui sotto descrivono la decisione presa: la correzione rigenera le
 * scritture nella stessa transazione, e le vecchie restano nel database
 * annullate logicamente.
 */
setupIntegrationDb()

/** Postazione minima per il corpo della PUT: il resto ha default nello schema. */
function postazione(cashAmount: number, posAmount: number, floatAmount = 114) {
  return { name: 'CASSA 1', position: 0, cashAmount, posAmount, floatAmount }
}

/** Scritture vive della chiusura (l'estensione soft delete filtra le annullate). */
function scrittureVive(closureId: string) {
  return prisma.journalEntry.findMany({ where: { closureId }, orderBy: { createdAt: 'asc' } })
}

function scrittureAnnullate(closureId: string) {
  return prisma.journalEntry.findMany({
    where: { closureId, deletedAt: { not: null } },
  })
}

/** Importo di una scrittura riconosciuta dalla descrizione. */
function importo(
  entries: Awaited<ReturnType<typeof scrittureVive>>,
  frammento: string,
  colonna: 'debitAmount' | 'creditAmount'
): number | undefined {
  const trovata = entries.find(
    (e) => e.description.includes(frammento) && e[colonna] !== null
  )
  return trovata ? Number(trovata[colonna]) : undefined
}

/**
 * Chiusura validata di partenza: 500 in contanti, 300 di POS, 114 di fondo
 * cassa, 37,90 di uscite pagate in contanti. Ne derivano cinque scritture —
 * incasso contanti 537,90, uscita 37,90, POS 300, versamento 348,10 in doppia
 * riga cassa/banca.
 */
async function chiusuraValidata(conteggio?: ConteggioFixture) {
  const admin = await loginAs('admin')
  const closure = await creaChiusura({
    status: 'SUBMITTED',
    submittedById: admin.user.id,
    postazioni: [{ cashAmount: 500, posAmount: 300, floatAmount: 114, conteggio }],
    uscite: [{ amount: 37.9, payee: 'Panificio' }],
  })

  const esito = await validateClosure({
    closureId: closure.id,
    userId: admin.user.id,
    action: 'approve',
  })

  if (esito.outcome !== 'approved') {
    throw new Error(`Chiusura non validata dalla fixture: ${esito.outcome}`)
  }

  return { closure, admin }
}

describe('PUT /api/chiusure/[id] su chiusura validata', () => {
  it('rigenera le scritture di prima nota sui nuovi importi', async () => {
    const { closure } = await chiusuraValidata()

    const prima = await scrittureVive(closure.id)
    expect(importo(prima, 'Incasso giornaliero contanti', 'debitAmount')).toBe(537.9)

    const response = await callRoute(
      aggiornaChiusura,
      jsonRequest(`/api/chiusure/${closure.id}`, {
        method: 'PUT',
        body: {
          stations: [postazione(600, 300)],
          expenses: [{ payee: 'Panificio', amount: 37.9, documentType: 'NONE', isPaid: true }],
        },
      }),
      { id: closure.id }
    )

    expect(response.status).toBe(200)

    const dopo = await scrittureVive(closure.id)

    // Incasso contanti = contanti in cassa + uscite pagate in contanti
    expect(importo(dopo, 'Incasso giornaliero contanti', 'debitAmount')).toBe(637.9)
    // Versamento = contanti - fondo cassa - uscite, in doppia riga cassa/banca
    expect(importo(dopo, 'Versamento', 'creditAmount')).toBe(448.1)
    expect(importo(dopo, 'Versamento', 'debitAmount')).toBe(448.1)
    // Il POS non è cambiato e resta una scrittura sola
    expect(dopo.filter((e) => e.registerType === 'BANK' && Number(e.debitAmount) === 300))
      .toHaveLength(1)

    expect(dopo).toHaveLength(5)
  })

  it('la rigenerazione conserva il centro di costo, di testata e di riga', async () => {
    // La rigenerazione rimonta i movimenti da capo. Ometteva l'imputazione, e
    // il generatore ricadeva sul centro di sistema: correggere una chiusura
    // di Weiss — anche solo nelle note — spostava tutto il giorno su STR,
    // senza che niente lo segnalasse. Il centro di testata qui NON è quello
    // di default, altrimenti conservarlo e azzerarlo sarebbero indistinguibili.
    const admin = await loginAs('admin')
    const weiss = await centroDiCosto('WEISS')
    const casetta = await centroDiCosto('CAS')

    const closure = await creaChiusura({
      status: 'SUBMITTED',
      submittedById: admin.user.id,
      costCenterId: weiss,
      postazioni: [{ cashAmount: 500, posAmount: 300, floatAmount: 114 }],
      uscite: [
        { amount: 37.9, payee: 'Panificio' },
        { amount: 12, payee: 'Ferramenta', costCenterId: casetta },
      ],
    })

    const esito = await validateClosure({
      closureId: closure.id,
      userId: admin.user.id,
      action: 'approve',
    })
    expect(esito.outcome).toBe('approved')

    const centriPrima = new Set((await scrittureVive(closure.id)).map((e) => e.costCenterId))
    expect(centriPrima).toEqual(new Set([weiss, casetta]))

    const response = await callRoute(
      aggiornaChiusura,
      jsonRequest(`/api/chiusure/${closure.id}`, {
        method: 'PUT',
        body: {
          stations: [postazione(600, 300)],
          expenses: [
            { payee: 'Panificio', amount: 37.9, documentType: 'NONE', isPaid: true },
            {
              payee: 'Ferramenta',
              amount: 12,
              documentType: 'NONE',
              isPaid: true,
              costCenterId: casetta,
            },
          ],
        },
      }),
      { id: closure.id }
    )

    expect(response.status).toBe(200)

    const dopo = await scrittureVive(closure.id)
    // Nessun movimento è finito sul centro di sistema, e la riga con
    // l'override si è tenuta il suo.
    expect(new Set(dopo.map((e) => e.costCenterId))).toEqual(new Set([weiss, casetta]))
    expect(
      dopo.filter((e) => e.description.includes('Ferramenta')).map((e) => e.costCenterId)
    ).toEqual([casetta])
  })

  it('conserva il centro anche sulla riga con un conto che ne pretende uno', async () => {
    // La combinazione più a rischio del piano: 124 voci su 192 sono
    // OBBLIGATORIO, e su quelle la risoluzione senza centro esplicito non
    // ripiega — risponde 'invalid'. È la strada che prima produceva un
    // `cost_center_id` nullo, cioè quella che il NOT NULL trasformerebbe in
    // un errore 23502. Oggi due difese in fila la coprono: la testata
    // ripassata dalla rigenerazione (che tiene il centro giusto) e il ripiego
    // di `risolviCentroMovimento` (che comunque non scrive mai null). Questo
    // test verifica la prima; della seconda risponde il test unitario
    // «centro disattivato» in closure-journal-entries.test.ts.
    const admin = await loginAs('admin')
    const weiss = await centroDiCosto('WEISS')
    const contoObbligatorio = await prisma.account.findFirstOrThrow({
      where: { costCenterRule: 'OBBLIGATORIO', isActive: true },
      select: { id: true },
    })

    const closure = await creaChiusura({
      status: 'SUBMITTED',
      submittedById: admin.user.id,
      costCenterId: weiss,
      postazioni: [{ cashAmount: 500, posAmount: 300, floatAmount: 114 }],
      uscite: [{ amount: 37.9, payee: 'Birrificio', accountId: contoObbligatorio.id }],
    })

    const esito = await validateClosure({
      closureId: closure.id,
      userId: admin.user.id,
      action: 'approve',
    })
    expect(esito.outcome).toBe('approved')

    const response = await callRoute(
      aggiornaChiusura,
      jsonRequest(`/api/chiusure/${closure.id}`, {
        method: 'PUT',
        body: {
          stations: [postazione(600, 300)],
          expenses: [
            {
              payee: 'Birrificio',
              amount: 37.9,
              documentType: 'NONE',
              isPaid: true,
              accountId: contoObbligatorio.id,
            },
          ],
        },
      }),
      { id: closure.id }
    )

    expect(response.status).toBe(200)

    const dopo = await scrittureVive(closure.id)
    expect(dopo).toHaveLength(5)
    for (const movimento of dopo) {
      expect(movimento.costCenterId).toBe(weiss)
    }
  })

  it('annulla le vecchie scritture invece di cancellarle', async () => {
    const { closure } = await chiusuraValidata()
    const prima = await scrittureVive(closure.id)

    await callRoute(
      aggiornaChiusura,
      jsonRequest(`/api/chiusure/${closure.id}`, {
        method: 'PUT',
        body: { stations: [postazione(600, 300)], expenses: [] },
      }),
      { id: closure.id }
    )

    const annullate = await scrittureAnnullate(closure.id)

    expect(annullate).toHaveLength(prima.length)
    expect(annullate.map((e) => e.id).sort()).toEqual(prima.map((e) => e.id).sort())
    for (const scrittura of annullate) {
      expect(scrittura.deletedAt).toBeInstanceOf(Date)
    }
  })

  it('lascia traccia nel registro di audit con i totali prima e dopo', async () => {
    const { closure } = await chiusuraValidata()

    await callRoute(
      aggiornaChiusura,
      jsonRequest(`/api/chiusure/${closure.id}`, {
        method: 'PUT',
        body: {
          stations: [postazione(600, 300)],
          expenses: [{ payee: 'Panificio', amount: 37.9, documentType: 'NONE', isPaid: true }],
        },
      }),
      { id: closure.id }
    )

    const log = await prisma.auditLog.findFirst({
      where: { entityType: 'DailyClosure', entityId: closure.id, action: 'UPDATE' },
      orderBy: { timestamp: 'desc' },
    })

    expect(log).not.toBeNull()
    expect(log!.oldValues).toMatchObject({ journalEntries: { totalDebits: 1186 } })
    expect(log!.newValues).toMatchObject({ journalEntries: { totalDebits: 1386 } })
  })

  it('non tocca la prima nota quando la chiusura è ancora in bozza', async () => {
    await loginAs('admin')
    const closure = await creaChiusura({
      status: 'DRAFT',
      postazioni: [{ cashAmount: 100, posAmount: 0 }],
    })

    const response = await callRoute(
      aggiornaChiusura,
      jsonRequest(`/api/chiusure/${closure.id}`, {
        method: 'PUT',
        body: { stations: [postazione(200, 0)] },
      }),
      { id: closure.id }
    )

    expect(response.status).toBe(200)
    expect(await scrittureVive(closure.id)).toHaveLength(0)
  })

  it('rifiuta la correzione se una scrittura è già riconciliata in banca', async () => {
    const { closure } = await chiusuraValidata()
    const prima = await scrittureVive(closure.id)
    const posEntry = prima.find((e) => e.registerType === 'BANK')!

    await prisma.bankTransaction.create({
      data: {
        venueId: closure.venueId,
        transactionDate: closure.date,
        description: 'Accredito POS',
        amount: 300,
        status: 'MATCHED',
        matchedEntryId: posEntry.id,
        reconciledAt: new Date(),
      },
    })

    const response = await callRoute<{ error: string }>(
      aggiornaChiusura,
      jsonRequest(`/api/chiusure/${closure.id}`, {
        method: 'PUT',
        body: { stations: [postazione(600, 300)], expenses: [] },
      }),
      { id: closure.id }
    )

    expect(response.status).toBe(409)
    expect(response.body.error).toContain('riconcili')

    // Nulla è cambiato: né le scritture né i dati della chiusura
    const dopo = await scrittureVive(closure.id)
    expect(dopo.map((e) => e.id).sort()).toEqual(prima.map((e) => e.id).sort())

    const stazioni = await prisma.cashStation.findMany({ where: { closureId: closure.id } })
    expect(stazioni).toHaveLength(1)
    expect(Number(stazioni[0].cashAmount)).toBe(500)
  })
})

/**
 * Postazioni con il conteggio del cassetto: la forma che hanno in produzione.
 *
 * La PUT sostituisce le postazioni cancellandole e ricreandole, ma
 * `CashCount.station` è dichiarata `onDelete: Restrict`, e il conteggio tiene
 * in vita la postazione a cui appartiene. Ne seguiva che ogni chiusura
 * compilata dall'interfaccia — dove la griglia dei tagli viene sempre inviata —
 * rispondeva 500 a qualunque modifica: nessuna chiusura era più correggibile
 * né inviabile.
 *
 * I test qui sopra non lo vedevano perché la fixture creava postazioni senza
 * conteggio, cioè le uniche che si lasciano cancellare. Questi partono dallo
 * stato vero.
 */
describe('PUT /api/chiusure/[id] con i conteggi di cassa', () => {
  /** 8 da 50 + 5 da 20 = 500, quanto dichiarato in cassa. */
  const CONTEGGIO_INIZIALE: ConteggioFixture = { bills50: 8, bills20: 5 }
  /** 10 da 50 + 5 da 20 = 600: il conteggio corretto dopo la modifica. */
  const CONTEGGIO_CORRETTO = { bills50: 10, bills20: 5 }

  it('modifica una chiusura le cui postazioni hanno il conteggio del cassetto', async () => {
    await loginAs('admin')
    const closure = await creaChiusura({
      status: 'DRAFT',
      postazioni: [{ cashAmount: 500, posAmount: 300, conteggio: CONTEGGIO_INIZIALE }],
    })

    const response = await callRoute(
      aggiornaChiusura,
      jsonRequest(`/api/chiusure/${closure.id}`, {
        method: 'PUT',
        body: {
          stations: [{ ...postazione(600, 300), cashCount: CONTEGGIO_CORRETTO }],
        },
      }),
      { id: closure.id }
    )

    expect(response.status).toBe(200)

    const stazioni = await prisma.cashStation.findMany({
      where: { closureId: closure.id },
      include: { cashCount: true },
    })

    expect(stazioni).toHaveLength(1)
    expect(Number(stazioni[0].cashAmount)).toBe(600)
    expect(stazioni[0].cashCount).not.toBeNull()
    expect(stazioni[0].cashCount!.bills50).toBe(10)
    expect(Number(stazioni[0].cashCount!.totalCounted)).toBe(600)
    expect(Number(stazioni[0].cashCount!.difference)).toBe(0)
  })

  it('non lascia indietro il conteggio di una postazione rimossa', async () => {
    await loginAs('admin')
    const closure = await creaChiusura({
      status: 'DRAFT',
      postazioni: [
        { name: 'CASSA 1', cashAmount: 500, conteggio: CONTEGGIO_INIZIALE },
        { name: 'CASSA 2', cashAmount: 200, conteggio: { bills20: 10 } },
      ],
    })

    const response = await callRoute(
      aggiornaChiusura,
      jsonRequest(`/api/chiusure/${closure.id}`, {
        method: 'PUT',
        body: { stations: [{ ...postazione(500, 0), cashCount: CONTEGGIO_INIZIALE }] },
      }),
      { id: closure.id }
    )

    expect(response.status).toBe(200)

    const stazioni = await prisma.cashStation.findMany({ where: { closureId: closure.id } })
    expect(stazioni).toHaveLength(1)
    expect(stazioni[0].name).toBe('CASSA 1')

    // Un conteggio senza la sua postazione sarebbe denaro contato che non
    // appartiene a nessuna cassa: nel database non ne deve restare nessuno.
    expect(await prisma.cashCount.count()).toBe(1)
  })

  it('rigenera comunque la prima nota quando la chiusura corretta è validata', async () => {
    const { closure } = await chiusuraValidata(CONTEGGIO_INIZIALE)

    const response = await callRoute(
      aggiornaChiusura,
      jsonRequest(`/api/chiusure/${closure.id}`, {
        method: 'PUT',
        body: {
          stations: [{ ...postazione(600, 300), cashCount: CONTEGGIO_CORRETTO }],
          expenses: [{ payee: 'Panificio', amount: 37.9, documentType: 'NONE', isPaid: true }],
        },
      }),
      { id: closure.id }
    )

    expect(response.status).toBe(200)

    const dopo = await scrittureVive(closure.id)
    expect(importo(dopo, 'Incasso giornaliero contanti', 'debitAmount')).toBe(637.9)
    expect(importo(dopo, 'Versamento', 'creditAmount')).toBe(448.1)
    expect(dopo).toHaveLength(5)
  })
})
