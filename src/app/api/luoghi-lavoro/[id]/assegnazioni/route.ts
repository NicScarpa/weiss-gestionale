import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { badRequest, created, handleApiError, notFound, ok, withAuth } from '@/lib/api-utils'
import { assegnazioneLuogoSchema } from '@/lib/validations/luoghi-lavoro'
import { RUOLI_CONFIGURAZIONE } from '../../condiviso'

type Params = { id: string }
const OPZIONI = { roles: RUOLI_CONFIGURAZIONE, venueScoped: true } as const

// POST /api/luoghi-lavoro/[id]/assegnazioni - Abilita un dipendente su un luogo
export const POST = withAuth<Params>(async (request: NextRequest, { params, user, venueId }) => {
  try {
    const { id } = params

    const luogo = await prisma.workLocation.findFirst({
      where: { id, venueId },
      select: { id: true, name: true },
    })

    if (!luogo) {
      return notFound('Luogo non trovato')
    }

    const body = await request.json()
    const dati = assegnazioneLuogoSchema.parse(body)

    // Il dipendente deve esistere, essere attivo e della stessa sede: un id
    // qualsiasi finirebbe dritto nella foreign key con un 500 opaco.
    const dipendente = await prisma.user.findFirst({
      where: { id: dati.userId, isActive: true, venueId },
      select: { id: true },
    })

    if (!dipendente) {
      return badRequest('Dipendente non trovato')
    }

    // Riassegnare qualcuno già abilitato non crea un doppione: aggiorna la
    // modalità e riapre l'assegnazione se era stata chiusa.
    const selezione = {
      id: true,
      trackingMode: true,
      user: { select: { id: true, firstName: true, lastName: true } },
    } as const

    const argomenti = {
      where: {
        userId_workLocationId: { userId: dati.userId, workLocationId: id },
      },
      create: {
        userId: dati.userId,
        workLocationId: id,
        trackingMode: dati.trackingMode,
      },
      update: { trackingMode: dati.trackingMode, endedAt: null },
      select: selezione,
    }

    let assegnazione
    try {
      assegnazione = await prisma.workLocationAssignment.upsert(argomenti)
    } catch (err) {
      // L'upsert di Prisma non è atomico: due richieste simultanee sulla
      // stessa coppia fanno fallire la seconda sul vincolo di unicità. A quel
      // punto la riga esiste: si ritenta una volta e va in aggiornamento.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        assegnazione = await prisma.workLocationAssignment.upsert(argomenti)
      } else {
        throw err
      }
    }

    await createAuditLog({
      userId: user.id,
      action: 'UPDATE',
      entityType: 'WorkLocationAssignment',
      entityId: assegnazione.id,
      venueId,
      newValues: {
        luogo: luogo.name,
        dipendente: `${assegnazione.user.firstName} ${assegnazione.user.lastName}`,
        modalita: assegnazione.trackingMode,
      },
    })

    return created({ data: assegnazione })
  } catch (err) {
    return handleApiError(
      err,
      'POST /api/luoghi-lavoro/[id]/assegnazioni',
      "Errore nell'assegnazione del dipendente"
    )
  }
}, OPZIONI)

// DELETE /api/luoghi-lavoro/[id]/assegnazioni?userId=... - Revoca l'abilitazione
export const DELETE = withAuth<Params>(async (request: NextRequest, { params, user, venueId }) => {
  try {
    const { id } = params
    const userId = request.nextUrl.searchParams.get('userId')

    if (!userId) {
      return badRequest('Dipendente non indicato')
    }

    const assegnazione = await prisma.workLocationAssignment.findFirst({
      where: { userId, workLocationId: id, workLocation: { venueId } },
      select: { id: true },
    })

    if (!assegnazione) {
      return notFound('Assegnazione non trovata')
    }

    // Si chiude invece di cancellare: le timbrature già registrate su questo
    // luogo restano leggibili insieme alla modalità con cui furono raccolte.
    await prisma.workLocationAssignment.update({
      where: { id: assegnazione.id },
      data: { endedAt: new Date() },
    })

    await createAuditLog({
      userId: user.id,
      action: 'UPDATE',
      entityType: 'WorkLocationAssignment',
      entityId: assegnazione.id,
      venueId,
      newValues: { endedAt: 'ora' },
    })

    return ok({ success: true })
  } catch (err) {
    return handleApiError(
      err,
      'DELETE /api/luoghi-lavoro/[id]/assegnazioni',
      "Errore nella revoca dell'assegnazione"
    )
  }
}, OPZIONI)
