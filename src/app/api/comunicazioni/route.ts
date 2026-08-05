import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { getVenueId } from '@/lib/venue'
import { romeDayRange, toDateOnlyUtc } from '@/lib/timezone'
import { comunicazioneSchema } from '@/lib/validations/comunicazioni'
import { sendBulkNotification } from '@/lib/notifications/send'
import {
  comunicazioneSelect,
  filtroVisibili,
  destinatariDi,
} from '@/lib/comunicazioni'

// GET /api/comunicazioni - Elenco delle comunicazioni della sede.
//
// Admin e manager vedono tutto, con quante persone hanno letto ciascuna.
// Con `?visibili=1` la lista è invece quella del destinatario — non scadute e
// per il proprio ruolo — che è quella che serve al portale: la usano anche
// admin e manager, che il portale ce l'hanno come tutti gli altri.
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const venueId = await getVenueId()
    const isGestore = ['admin', 'manager'].includes(session.user.role || '')
    const soloVisibili =
      !isGestore || new URL(request.url).searchParams.get('visibili') === '1'

    const comunicazioni = await prisma.communication.findMany({
      where: {
        venueId,
        ...(soloVisibili ? filtroVisibili(session.user.role || '') : {}),
      },
      select: {
        ...comunicazioneSelect,
        // Le letture dell'utente corrente: una riga al massimo, per il pallino
        // "non letto" nel portale.
        reads: { where: { userId: session.user.id }, select: { readAt: true } },
        _count: { select: { reads: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    })

    // Quante persone dovrebbero leggere ciascuna comunicazione. Il totale
    // dipende dai ruoli destinatari, quindi si conta una volta sola per ruolo
    // e poi si somma: gli utenti del portale sono decine, non serve altro.
    let perRuolo: Map<string, number> | null = null
    if (isGestore) {
      const destinatari = await prisma.user.findMany({
        where: { venueId, isActive: true, portalEnabled: true },
        select: { role: { select: { name: true } } },
      })
      perRuolo = new Map()
      for (const utente of destinatari) {
        const nome = utente.role.name
        perRuolo.set(nome, (perRuolo.get(nome) ?? 0) + 1)
      }
    }
    const totaleDestinatari = perRuolo
      ? [...perRuolo.values()].reduce((somma, n) => somma + n, 0)
      : 0

    // Quante letture e su quanti destinatari sono numeri per chi pubblica: a
    // chi legge il portale non servono.
    const data = comunicazioni.map(({ reads, _count, ...comunicazione }) => ({
      ...comunicazione,
      letta: reads.length > 0,
      ...(perRuolo && {
        letture: _count.reads,
        destinatari:
          comunicazione.targetRoles.length === 0
            ? totaleDestinatari
            : comunicazione.targetRoles.reduce(
                (somma, ruolo) => somma + (perRuolo.get(ruolo) ?? 0),
                0
              ),
      }),
    }))

    return NextResponse.json({ data })
  } catch (error) {
    logger.error('Errore GET /api/comunicazioni', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle comunicazioni' },
      { status: 500 }
    )
  }
}

// POST /api/comunicazioni - Pubblica una comunicazione e avvisa i destinatari.
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const dati = comunicazioneSchema.parse(body)

    const venueId = await getVenueId()

    const comunicazione = await prisma.communication.create({
      data: {
        venueId,
        title: dati.title,
        message: dati.message,
        priority: dati.priority,
        eventDate: dati.eventDate ? toDateOnlyUtc(dati.eventDate) : null,
        // La scadenza copre tutto il giorno indicato: chi scrive "scade il 10"
        // intende che il 10 si legge ancora.
        expiresAt: dati.expiresAt ? romeDayRange(dati.expiresAt).end : null,
        targetRoles: dati.targetRoles,
        createdById: session.user.id,
      },
      select: comunicazioneSelect,
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'Communication',
      entityId: comunicazione.id,
      venueId,
      newValues: {
        title: dati.title,
        priority: dati.priority,
        targetRoles: dati.targetRoles,
      },
    })

    // La push è un di più: se Firebase non risponde la comunicazione è
    // comunque pubblicata, e chi apre il portale la trova.
    ;(async () => {
      const userIds = await destinatariDi(venueId, dati.targetRoles, {
        escludiUserId: session.user.id,
      })
      if (userIds.length === 0) return

      await sendBulkNotification({
        userIds,
        payload: {
          type: 'COMPANY_COMMUNICATION',
          title: dati.title,
          body:
            dati.message.length > 120
              ? `${dati.message.slice(0, 117)}...`
              : dati.message,
          url: '/portale/comunicazioni',
          referenceId: comunicazione.id,
          referenceType: 'Communication',
        },
      })
    })().catch((err) =>
      logger.error('Errore invio notifiche comunicazione aziendale', err)
    )

    return NextResponse.json({ data: comunicazione }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/comunicazioni', error)
    return NextResponse.json(
      { error: 'Errore nella creazione della comunicazione' },
      { status: 500 }
    )
  }
}
