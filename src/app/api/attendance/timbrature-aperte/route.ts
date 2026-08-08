import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { requireRole } from '@/lib/api-utils'
import { getVenueId } from '@/lib/venue'
import { romeDateKey, romeInstant, romeTimeString, toRomeParts } from '@/lib/timezone'
import { trovaSessioniAperte } from '@/lib/attendance/sessioni-aperte'
import { createManualPunch } from '@/lib/attendance/manual-punch'
import { notifyUsciteRegistrateDaAltri } from '@/lib/notifications/triggers'

/**
 * Le timbrature ancora aperte della giornata, per la chiusura di cassa.
 *
 * La chiusura termina il servizio: prima dell'invio l'operatore vede chi
 * risulta ancora "dentro" e conferma — o corregge, per chi è andato via
 * prima senza timbrare — l'orario di uscita di ciascuno. Lo staff può
 * farlo perché è lo staff a compilare la chiusura la sera: le uscite
 * nascono manuali, tracciate, e le ore oltre il turno restano comunque
 * sospese finché un revisore non le approva.
 */

const dateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data non valida (attesa yyyy-MM-dd)')

// GET /api/attendance/timbrature-aperte?date=yyyy-MM-dd
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    const check = requireRole(session, ['admin', 'manager', 'staff'])
    if (!check.authorized) return check.response

    const venueId = await getVenueId()
    if (!venueId) {
      return NextResponse.json({ error: 'Nessuna sede configurata' }, { status: 400 })
    }

    const raw = request.nextUrl.searchParams.get('date') ?? romeDateKey(new Date())
    const parsed = dateKeySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Data non valida' }, { status: 400 })
    }

    const sessioni = await trovaSessioniAperte(venueId, parsed.data)

    return NextResponse.json({
      data: sessioni.map((s) => ({
        userId: s.userId,
        firstName: s.firstName,
        lastName: s.lastName,
        dentroDalle: s.dentroDalle,
        finePrevista: s.finePrevista,
      })),
    })
  } catch (error) {
    logger.error('Errore GET /api/attendance/timbrature-aperte', error)
    return NextResponse.json(
      { error: 'Errore nel caricamento delle timbrature aperte' },
      { status: 500 }
    )
  }
}

const confermaUsciteSchema = z.object({
  date: dateKeySchema,
  uscite: z
    .array(
      z.object({
        userId: z.string().min(1),
        /** Orario italiano 'HH:mm' dell'uscita confermata dall'operatore. */
        orario: z.string().regex(/^\d{2}:\d{2}$/, 'Orario non valido (atteso HH:mm)'),
      })
    )
    .min(1, 'Nessuna uscita da confermare')
    .max(50),
})

// POST /api/attendance/timbrature-aperte - conferma le uscite in chiusura
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    const check = requireRole(session, ['admin', 'manager', 'staff'])
    if (!check.authorized) return check.response

    const venueId = await getVenueId()
    if (!venueId) {
      return NextResponse.json({ error: 'Nessuna sede configurata' }, { status: 400 })
    }

    const body = confermaUsciteSchema.parse(await request.json())

    // Si può chiudere solo chi risulta davvero dentro: l'elenco arriva dal
    // client, ma la verità sta nelle timbrature.
    const aperte = await trovaSessioniAperte(venueId, body.date)
    const apertePerUtente = new Map(aperte.map((s) => [s.userId, s]))

    const adesso = new Date()
    const scarti: string[] = []
    const daChiudere: { userId: string; punchedAt: Date }[] = []

    for (const uscita of body.uscite) {
      const sessione = apertePerUtente.get(uscita.userId)
      if (!sessione) {
        scarti.push(`${uscita.userId}: nessuna timbratura aperta`)
        continue
      }

      const [ore, minuti] = uscita.orario.split(':').map(Number)
      let minutiUscita = ore * 60 + minuti
      // L'uscita "prima" dell'entrata è il giorno dopo: il turno serale che
      // finisce all'1:30 appartiene alla giornata della chiusura.
      const minutiEntrata = toRomeParts(sessione.entrataAlle).minutesFromMidnight
      if (minutiUscita < minutiEntrata) {
        minutiUscita += 24 * 60
      }

      const punchedAt = romeInstant(body.date, minutiUscita)
      if (punchedAt.getTime() <= sessione.entrataAlle.getTime()) {
        scarti.push(
          `${sessione.firstName} ${sessione.lastName}: l'uscita precede l'entrata`
        )
        continue
      }
      if (punchedAt.getTime() > adesso.getTime() + 2 * 60 * 1000) {
        scarti.push(
          `${sessione.firstName} ${sessione.lastName}: l'uscita è nel futuro`
        )
        continue
      }

      daChiudere.push({ userId: uscita.userId, punchedAt })
    }

    if (scarti.length > 0) {
      return NextResponse.json(
        { error: `Uscite non valide: ${scarti.join('; ')}`, details: scarti },
        { status: 422 }
      )
    }

    // O si chiudono tutte o nessuna: una chiusura a metà lascerebbe il
    // gate d'invio in uno stato incomprensibile per l'operatore.
    const records = await prisma.$transaction(async (tx) => {
      const creati = []
      for (const chiusura of daChiudere) {
        creati.push(
          await createManualPunch(tx, {
            userId: chiusura.userId,
            venueId,
            punchType: 'OUT',
            punchedAt: chiusura.punchedAt,
            enteredById: session!.user.id,
            reason: 'Fine servizio confermata in chiusura di cassa',
            workdayKey: body.date,
            // Le ore oltre il turno restano da rivedere: l'operatore
            // conferma l'orario, non lo straordinario.
            revisioneScostamento: 'PENDING',
          })
        )
      }
      return creati
    })

    for (const record of records) {
      await createAuditLog({
        userId: session!.user.id,
        action: 'CREATE',
        entityType: 'AttendanceRecord',
        entityId: record.id,
        newValues: {
          punchType: 'OUT',
          punchedAt: record.punchedAt.toISOString(),
          motivo: 'chiusura di cassa',
        },
      })
    }

    // Chi si vede scrivere l'uscita da un altro deve saperlo subito. Si
    // aspetta l'invio invece di lasciarlo correre da solo: è l'unica
    // contromisura a un orario deciso da terzi sulle ore pagate di qualcuno,
    // e se non parte vogliamo trovarlo nel log di questa richiesta. I
    // destinatari sono una manciata e i push partono in parallelo.
    try {
      await notifyUsciteRegistrateDaAltri({
        autoreId: session!.user.id,
        dateKey: body.date,
        uscite: records.map((record) => ({
          userId: record.userId,
          orarioUscita: romeTimeString(record.punchedAt),
        })),
      })
    } catch (error) {
      // Le uscite sono già registrate: un guasto del canale push non deve
      // far credere all'operatore che la chiusura non sia passata.
      logger.error('Errore invio avviso uscite registrate in chiusura', error)
    }

    return NextResponse.json({
      data: { chiuse: records.length },
      message:
        records.length === 1
          ? 'Uscita registrata'
          : `${records.length} uscite registrate`,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/attendance/timbrature-aperte', error)
    return NextResponse.json(
      { error: 'Errore nella registrazione delle uscite' },
      { status: 500 }
    )
  }
}
