import { describe, it, expect, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { creaChiusura, centroDiCostoDiDefault } from '@/test/integration/fixtures/closures'
import { validateClosure } from '../closure-service'
import { POST as validaChiusura } from '@/app/api/chiusure/[id]/validate/route'

/**
 * Guasto simulato nella generazione delle scritture.
 *
 * È l'unico pezzo finto di questo file, e serve a provare una cosa che con dati
 * validi non si vedrebbe mai: che un errore *dopo* il cambio di stato non
 * lasci la chiusura validata a fronte di una prima nota incompleta. Il database
 * resta reale, così la transazione che deve annullarsi è una transazione vera.
 */
const guasto = vi.hoisted(() => ({ attivo: false }))

vi.mock('@/lib/closure-journal-entries', async (importOriginal) => {
  const originale =
    await importOriginal<typeof import('@/lib/closure-journal-entries')>()

  return {
    ...originale,
    generateJournalEntriesFromClosure: async (
      ...args: Parameters<typeof originale.generateJournalEntriesFromClosure>
    ) => {
      if (guasto.attivo) {
        throw new Error('Guasto simulato durante la generazione delle scritture')
      }
      return originale.generateJournalEntriesFromClosure(...args)
    },
  }
})

/**
 * Test di riferimento dell'harness di integrazione.
 *
 * Non insegue un bug: dimostra che i pezzi funzionano insieme — database vero
 * con lo schema di Prisma, seed applicato, reset fra un test e l'altro, utenti
 * reali nella sessione e route dell'App Router invocate direttamente. I casi
 * scelti sono quelli che si fermano prima di scrivere in prima nota, così il
 * verde dice qualcosa sull'harness e non sulla contabilità.
 */
setupIntegrationDb()

describe('validateClosure sul database reale', () => {
  it('rifiuta una chiusura che non è stata inviata', async () => {
    const closure = await creaChiusura({ status: 'DRAFT' })
    const { user } = await loginAs('admin')

    const result = await validateClosure({
      closureId: closure.id,
      userId: user.id,
      action: 'approve',
    })

    expect(result).toEqual({ outcome: 'invalid_status', currentStatus: 'DRAFT' })
  })

  it('segnala una chiusura inesistente', async () => {
    const { user } = await loginAs('admin')

    const result = await validateClosure({
      closureId: 'chiusura-che-non-esiste',
      userId: user.id,
      action: 'approve',
    })

    expect(result).toEqual({ outcome: 'not_found' })
  })

  it('rifiuta una chiusura già validata', async () => {
    const admin = await loginAs('admin')
    const closure = await creaChiusura({ status: 'VALIDATED' })

    const result = await validateClosure({
      closureId: closure.id,
      userId: admin.user.id,
      action: 'approve',
    })

    expect(result).toEqual({ outcome: 'invalid_status', currentStatus: 'VALIDATED' })
  })

  it('non valida una chiusura cancellata', async () => {
    // Il caso che l'audit chiedeva di blindare: una chiusura eliminata non deve
    // poter rientrare dalla finestra e generare la prima nota del suo giorno,
    // che è già stato riaperto ad altri.
    const admin = await loginAs('admin')
    const closure = await creaChiusura({
      status: 'SUBMITTED',
      postazioni: [{ cashAmount: 500, posAmount: 300 }],
    })
    await prisma.dailyClosure.updateMany({
      where: { id: closure.id },
      data: { deletedAt: new Date() },
    })

    const result = await validateClosure({
      closureId: closure.id,
      userId: admin.user.id,
      action: 'approve',
    })

    expect(result).toEqual({ outcome: 'not_found' })
    expect(
      await prisma.journalEntry.count({ where: { closureId: closure.id } })
    ).toBe(0)
  })

  it('il reset riporta il database allo stato del seed fra un test e l\'altro', async () => {
    // Stessa data del primo test: passerebbe solo se la chiusura precedente è
    // sparita, perché sede+data sono uniche.
    const closure = await creaChiusura({ status: 'DRAFT' })

    expect(closure.id).toBeTruthy()
  })
})

describe('POST /api/chiusure/[id]/validate', () => {
  it('senza sessione risponde 401', async () => {
    const closure = await creaChiusura({ status: 'DRAFT' })

    const response = await callRoute(
      validaChiusura,
      jsonRequest(`/api/chiusure/${closure.id}/validate`, {
        method: 'POST',
        body: { action: 'approve' },
      }),
      { id: closure.id }
    )

    expect(response.status).toBe(401)
  })

  it('lo staff non può validare', async () => {
    const closure = await creaChiusura({ status: 'DRAFT' })
    await loginAs('staff')

    const response = await callRoute(
      validaChiusura,
      jsonRequest(`/api/chiusure/${closure.id}/validate`, {
        method: 'POST',
        body: { action: 'approve' },
      }),
      { id: closure.id }
    )

    expect(response.status).toBe(403)
  })

  it('l\'admin riceve 400 su una chiusura ancora in bozza', async () => {
    const closure = await creaChiusura({ status: 'DRAFT' })
    await loginAs('admin')

    const response = await callRoute<{ error: string }, { id: string }>(
      validaChiusura,
      jsonRequest(`/api/chiusure/${closure.id}/validate`, {
        method: 'POST',
        body: { action: 'approve' },
      }),
      { id: closure.id }
    )

    expect(response.status).toBe(400)
    expect(response.body.error).toContain('inviate')
  })

  it('su una chiusura cancellata risponde 404', async () => {
    const closure = await creaChiusura({
      status: 'SUBMITTED',
      postazioni: [{ cashAmount: 500 }],
    })
    await prisma.dailyClosure.updateMany({
      where: { id: closure.id },
      data: { deletedAt: new Date() },
    })
    await loginAs('admin')

    const response = await callRoute<{ error: string }, { id: string }>(
      validaChiusura,
      jsonRequest(`/api/chiusure/${closure.id}/validate`, {
        method: 'POST',
        body: { action: 'approve' },
      }),
      { id: closure.id }
    )

    expect(response.status).toBe(404)
  })

  it('due click ravvicinati validano una volta sola', async () => {
    const admin = await loginAs('admin')
    const closure = await creaChiusura({
      status: 'SUBMITTED',
      submittedById: admin.user.id,
      postazioni: [{ cashAmount: 500, posAmount: 300, floatAmount: 114 }],
    })

    const richiesta = () =>
      callRoute(
        validaChiusura,
        jsonRequest(`/api/chiusure/${closure.id}/validate`, {
          method: 'POST',
          body: { action: 'approve' },
        }),
        { id: closure.id }
      )

    const [prima, seconda] = await Promise.all([richiesta(), richiesta()])

    expect([prima.status, seconda.status].sort()).toEqual([200, 400])
    expect(await scrittureVive(closure.id)).toHaveLength(4)
  })
})

/** Scritture ancora valide di una chiusura: le annullate sono già filtrate. */
function scrittureVive(closureId: string) {
  return prisma.journalEntry.findMany({ where: { closureId } })
}

/**
 * Chiusura inviata con importi che producono tutte e cinque le scritture:
 * incasso contanti 537,90 — POS 300 — uscita 37,90 — versamento 348,10 in
 * doppia riga cassa/banca.
 */
async function chiusuraInviata(submittedById: string) {
  return creaChiusura({
    status: 'SUBMITTED',
    submittedById,
    postazioni: [{ cashAmount: 500, posAmount: 300, floatAmount: 114 }],
    uscite: [{ amount: 37.9, payee: 'Panificio' }],
  })
}

describe('validazione concorrente', () => {
  // La corsa non è deterministica: una singola esecuzione verde non dimostra
  // nulla, cinque cominciano a dire qualcosa.
  it(
    'due validazioni simultanee generano un solo set di scritture',
    { repeats: 5 },
    async () => {
      const admin = await loginAs('admin')
      const closure = await chiusuraInviata(admin.user.id)

      const valida = () =>
        validateClosure({
          closureId: closure.id,
          userId: admin.user.id,
          action: 'approve',
        })

      const [prima, seconda] = await Promise.all([valida(), valida()])

      // Una approva, l'altra riceve un rifiuto pulito: nessuna delle due esplode
      expect([prima.outcome, seconda.outcome].sort()).toEqual([
        'approved',
        'invalid_status',
      ])

      const perdente = prima.outcome === 'invalid_status' ? prima : seconda
      expect(perdente).toEqual({ outcome: 'invalid_status', currentStatus: 'VALIDATED' })

      const scritture = await scrittureVive(closure.id)
      expect(scritture).toHaveLength(5)

      // Gli incassi del giorno compaiono una volta sola, non due
      const incassi = scritture.filter((e) => Number(e.debitAmount) === 537.9)
      expect(incassi).toHaveLength(1)

      const totaleDare = scritture.reduce((s, e) => s + Number(e.debitAmount ?? 0), 0)
      expect(totaleDare).toBeCloseTo(1186, 2)
    }
  )

  it('non genera scritture se le trova già presenti', async () => {
    const admin = await loginAs('admin')
    const closure = await chiusuraInviata(admin.user.id)

    // Stato incoerente: chiusura ancora INVIATA ma con una scrittura viva,
    // come la lascerebbe una validazione andata a metà.
    const preesistente = await prisma.journalEntry.create({
      data: {
        venueId: closure.venueId,
        date: closure.date,
        registerType: 'CASH',
        description: 'Scrittura rimasta da una validazione precedente',
        debitAmount: 537.9,
        closureId: closure.id,
        createdById: admin.user.id,
        costCenterId: await centroDiCostoDiDefault(),
      },
    })

    const result = await validateClosure({
      closureId: closure.id,
      userId: admin.user.id,
      action: 'approve',
    })

    expect(result.outcome).toBe('already_posted')

    const scritture = await scrittureVive(closure.id)
    expect(scritture.map((e) => e.id)).toEqual([preesistente.id])

    // Il rifiuto ha annullato anche il cambio di stato
    const dopo = await prisma.dailyClosure.findUnique({ where: { id: closure.id } })
    expect(dopo!.status).toBe('SUBMITTED')
    expect(dopo!.validatedAt).toBeNull()
  })
})

describe('atomicità della validazione', () => {
  it('un guasto a metà transazione non lascia né scritture né chiusura validata', async () => {
    const admin = await loginAs('admin')
    const closure = await chiusuraInviata(admin.user.id)

    guasto.attivo = true
    try {
      await expect(
        validateClosure({
          closureId: closure.id,
          userId: admin.user.id,
          action: 'approve',
        })
      ).rejects.toThrow('Guasto simulato')
    } finally {
      guasto.attivo = false
    }

    expect(await scrittureVive(closure.id)).toHaveLength(0)

    const dopo = await prisma.dailyClosure.findUnique({ where: { id: closure.id } })
    expect(dopo!.status).toBe('SUBMITTED')
    expect(dopo!.validatedAt).toBeNull()
    expect(dopo!.validatedById).toBeNull()
  })
})

describe('rifiuto di una chiusura', () => {
  it('annulla le scritture e riporta la chiusura in bozza', async () => {
    const admin = await loginAs('admin')
    const closure = await chiusuraInviata(admin.user.id)

    // Scrittura lasciata da un giro di validazione precedente: il rifiuto deve
    // portarla via, altrimenti resterebbe a gonfiare i registri.
    const scrittura = await prisma.journalEntry.create({
      data: {
        venueId: closure.venueId,
        date: closure.date,
        registerType: 'CASH',
        description: 'Incasso da annullare',
        debitAmount: 537.9,
        closureId: closure.id,
        createdById: admin.user.id,
        costCenterId: await centroDiCostoDiDefault(),
      },
    })

    const result = await validateClosure({
      closureId: closure.id,
      userId: admin.user.id,
      action: 'reject',
      rejectionNotes: 'Contanti non quadrano',
    })

    expect(result.outcome).toBe('rejected')

    expect(await scrittureVive(closure.id)).toHaveLength(0)

    // Annullata, non cancellata: la riga resta tracciabile, ma per rileggerla
    // bisogna nominare `deletedAt` — è la via di fuga dal filtro automatico.
    const annullata = await prisma.journalEntry.findUnique({
      where: { id: scrittura.id, deletedAt: { not: null } },
    })
    expect(annullata!.deletedAt).toBeInstanceOf(Date)

    const dopo = await prisma.dailyClosure.findUnique({ where: { id: closure.id } })
    expect(dopo!.status).toBe('DRAFT')
    expect(dopo!.rejectionNotes).toBe('Contanti non quadrano')
    expect(dopo!.submittedById).toBeNull()
  })

  it('due rifiuti simultanei riportano la chiusura in bozza una volta sola', async () => {
    const admin = await loginAs('admin')
    const closure = await chiusuraInviata(admin.user.id)

    const rifiuta = () =>
      validateClosure({
        closureId: closure.id,
        userId: admin.user.id,
        action: 'reject',
        rejectionNotes: 'Doppio rifiuto',
      })

    const [prima, seconda] = await Promise.all([rifiuta(), rifiuta()])

    expect([prima.outcome, seconda.outcome].sort()).toEqual([
      'invalid_status',
      'rejected',
    ])
  })
})
