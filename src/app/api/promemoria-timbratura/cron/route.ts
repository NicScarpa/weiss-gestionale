import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { sendBulkNotification } from '@/lib/notifications/send'
import { notifyMancataUscitaSpezzato } from '@/lib/notifications/triggers'
import {
  romeDayRange,
  timeColumnToMinutes,
  toDateOnlyUtc,
  toRomeParts,
} from '@/lib/timezone'
import { valutaPromemoria } from '@/lib/promemoria-timbratura'

/**
 * Invio dei promemoria di timbratura.
 *
 * Gira ogni quarto d'ora (vercel.json) e non ha sessione: si difende con il
 * segreto in `Authorization`, come l'auto clock-out. È idempotente grazie a
 * `lastSentDate`, che segna l'ultima giornata italiana in cui il promemoria è
 * partito: senza quello, ogni passaggio del cron rimanderebbe la stessa
 * notifica fino a mezzanotte.
 */

/** Rifiuto della richiesta, oppure `null` se il segreto combacia. */
function verificaSegretoCron(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    logger.error('CRON_SECRET environment variable is not set')
    return NextResponse.json(
      { error: 'Errore di configurazione server' },
      { status: 500 }
    )
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  return null
}

interface EsitoInvio {
  id: string
  name: string
  inviati: number
  saltati: number
}

async function inviaPromemoriaDovuti() {
  const adesso = new Date()
  const { dateKey, weekday } = toRomeParts(adesso)
  const oggi = toDateOnlyUtc(dateKey)
  const giornata = romeDayRange(dateKey)

  // Il filtro sul giorno resta nella query perché è un confronto sull'indice;
  // orario e `lastSentDate` li decide `valutaPromemoria`, che è la stessa
  // regola provata dai test.
  const promemoria = await prisma.clockReminder.findMany({
    where: { isActive: true, daysOfWeek: { has: weekday } },
    include: { recipients: { select: { userId: true } } },
  })

  let inviati = 0
  let saltati = 0
  const dettagli: EsitoInvio[] = []

  for (const p of promemoria) {
    const esito = valutaPromemoria(p, adesso)
    if (esito === 'GIORNO_ESCLUSO' || esito === 'GIA_INVIATO' || esito === 'NON_ANCORA') {
      continue
    }

    if (esito === 'TROPPO_TARDI') {
      await prisma.clockReminder.update({
        where: { id: p.id },
        data: { lastSentDate: oggi },
      })
      continue
    }

    try {
      // Senza destinatari espliciti vale tutto l'organico con il portale
      // attivo. Anche con destinatari scelti si ripassa da qui: chi nel
      // frattempo è stato disattivato non deve ricevere più nulla.
      const scelti = p.recipients.map((r) => r.userId)
      const destinatari = await prisma.user.findMany({
        where: {
          venueId: p.venueId,
          isActive: true,
          portalEnabled: true,
          ...(scelti.length > 0 ? { id: { in: scelti } } : {}),
        },
        select: { id: true },
      })

      let userIds = destinatari.map((u) => u.id)
      let saltatiQui = 0

      if (p.skipIfPunched && userIds.length > 0) {
        const giaTimbrato = await prisma.attendanceRecord.findMany({
          where: {
            userId: { in: userIds },
            punchType: p.punchType,
            punchedAt: { gte: giornata.start, lt: giornata.end },
          },
          select: { userId: true },
          distinct: ['userId'],
        })

        const esclusi = new Set(giaTimbrato.map((r) => r.userId))
        saltatiQui = esclusi.size
        userIds = userIds.filter((id) => !esclusi.has(id))
      }

      // La giornata si segna prima dell'invio: se il cron si sovrapponesse a se
      // stesso, una notifica doppia sarebbe peggio di una mancata.
      await prisma.clockReminder.update({
        where: { id: p.id },
        data: { lastSentDate: oggi },
      })

      if (userIds.length > 0) {
        await sendBulkNotification({
          userIds,
          payload: {
            type: 'CLOCK_REMINDER',
            title: p.title,
            body: p.body,
            url: '/portale/timbra',
            referenceId: p.id,
            referenceType: 'ClockReminder',
          },
        })
      }

      inviati += userIds.length
      saltati += saltatiQui
      dettagli.push({
        id: p.id,
        name: p.name,
        inviati: userIds.length,
        saltati: saltatiQui,
      })
    } catch (error) {
      // Un promemoria che fallisce non deve fermare gli altri.
      logger.error('Errore invio promemoria di timbratura', { id: p.id, error })
    }
  }

  return { inviati, saltati, dettagli, timestamp: adesso.toISOString() }
}

/**
 * Guardrail di fine turno: chi risulta ancora "dentro" un quarto d'ora dopo
 * la fine del turno pianificato riceve una spinta a timbrare l'uscita.
 * Serve a distinguere lo straordinario vero dall'uscita dimenticata, prima
 * che ci pensi l'auto clock-out. I turni serali che scavalcano la mezzanotte
 * restano fuori: la loro fine reale non si conosce (la segnala la chiusura
 * di cassa), e per la dimenticanza c'è comunque l'auto clock-out.
 */
const RITARDO_AVVISO_MINUTI = 15

async function avvisaFineTurno() {
  const adesso = new Date()
  const { dateKey, minutesFromMidnight } = toRomeParts(adesso)
  const oggi = toDateOnlyUtc(dateKey)
  const giornata = romeDayRange(dateKey)

  const turni = await prisma.shiftAssignment.findMany({
    where: {
      date: oggi,
      schedule: { status: 'PUBLISHED' },
      user: { isActive: true, portalEnabled: true },
    },
    select: { userId: true, venueId: true, startTime: true, endTime: true },
  })

  const finestrePerUtente = new Map<
    string,
    { venueId: string; inizio: number; fine: number }[]
  >()
  for (const turno of turni) {
    if (!turno.startTime || !turno.endTime) continue

    const inizio = timeColumnToMinutes(turno.startTime)
    const fine = timeColumnToMinutes(turno.endTime)
    if (fine <= inizio) continue

    const finestra = { venueId: turno.venueId, inizio, fine }
    const lista = finestrePerUtente.get(turno.userId)
    if (lista) {
      lista.push(finestra)
    } else {
      finestrePerUtente.set(turno.userId, [finestra])
    }
  }

  // L'avviso parte nel quarto d'ora in cui cade fine turno + ritardo: il cron
  // gira ogni 15 minuti, quindi ogni turno viene avvisato una volta sola.
  // Se la finestra mancata non è l'ultima della giornata è il turno spezzato:
  // il buco non verrà contato, e va avvisato anche il responsabile.
  const daAvvisare = new Set<string>()
  const spezzatoNonFinale = new Map<string, { venueId: string; fine: number }>()
  for (const [userId, finestre] of finestrePerUtente) {
    for (const finestra of finestre) {
      const momento = finestra.fine + RITARDO_AVVISO_MINUTI
      if (momento > minutesFromMidnight - 15 && momento <= minutesFromMidnight) {
        daAvvisare.add(userId)
        if (finestre.some((altra) => altra.inizio > finestra.fine)) {
          spezzatoNonFinale.set(userId, {
            venueId: finestra.venueId,
            fine: finestra.fine,
          })
        }
      }
    }
  }

  if (daAvvisare.size === 0) {
    return { avvisati: 0 }
  }

  // È ancora "dentro" chi ha come ultima timbratura della giornata un'entrata.
  const timbrature = await prisma.attendanceRecord.findMany({
    where: {
      userId: { in: [...daAvvisare] },
      punchType: { in: ['IN', 'OUT'] },
      punchedAt: { gte: giornata.start, lt: giornata.end },
    },
    select: { userId: true, punchType: true },
    orderBy: { punchedAt: 'asc' },
  })

  const ultimaTimbratura = new Map<string, string>()
  for (const t of timbrature) {
    ultimaTimbratura.set(t.userId, t.punchType)
  }

  const ancoraDentro = [...daAvvisare].filter(
    (id) => ultimaTimbratura.get(id) === 'IN'
  )

  if (ancoraDentro.length === 0) {
    return { avvisati: 0 }
  }

  await sendBulkNotification({
    userIds: ancoraDentro,
    payload: {
      type: 'CLOCK_REMINDER',
      title: 'Il tuo turno è finito',
      body: "Ricordati di timbrare l'uscita. Se stai ancora lavorando, le ore extra passeranno da una revisione.",
      url: '/portale/timbra',
      referenceType: 'ShiftAssignment',
    },
  })

  for (const userId of ancoraDentro) {
    const spezzato = spezzatoNonFinale.get(userId)
    if (!spezzato) continue

    const fineOrario =
      `${String(Math.floor(spezzato.fine / 60)).padStart(2, '0')}:` +
      String(spezzato.fine % 60).padStart(2, '0')
    await notifyMancataUscitaSpezzato({
      userId,
      venueId: spezzato.venueId,
      fineFinestra: fineOrario,
    }).catch((err) =>
      logger.error('Errore notifica mancata uscita turno spezzato', err)
    )
  }

  return { avvisati: ancoraDentro.length }
}

async function esegui(request: NextRequest) {
  const rifiuto = verificaSegretoCron(request)
  if (rifiuto) return rifiuto

  try {
    const risultato = await inviaPromemoriaDovuti()
    const fineTurno = await avvisaFineTurno()

    return NextResponse.json({ success: true, ...risultato, fineTurno })
  } catch (error) {
    logger.error('Errore job promemoria di timbratura', error)
    return NextResponse.json(
      { error: 'Errore nel job dei promemoria di timbratura' },
      { status: 500 }
    )
  }
}

// Il cron di Vercel invoca in GET; il POST c'è per poter lanciare il job a mano.
export async function GET(request: NextRequest) {
  return esegui(request)
}

export async function POST(request: NextRequest) {
  return esegui(request)
}
