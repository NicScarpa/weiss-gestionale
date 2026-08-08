import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAsUser, setSession } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { romeInstant } from '@/lib/timezone'
import { POST as confermaUscite } from '../route'

/**
 * La chiusura di cassa la compila lo staff, e chiudendola registra l'uscita
 * dei colleghi ancora dentro: è una scelta di prodotto voluta, ma significa
 * che l'orario di fine servizio di una persona lo può scrivere un'altra.
 * Marco esce alle 23:40, chi fa la cassa dichiara le 22:00, e Marco perde
 * un'ora e quaranta senza saperlo fino alla busta paga. L'avviso non toglie
 * il permesso: rende la modifica visibile a chi la subisce, in giornata.
 */
setupIntegrationDb()

const GIORNO = '2026-03-15'

async function entraComeUtente(userId: string) {
  const session = await loginAsUser(userId)
  setSession({ ...session, user: { ...session.user, mustChangePassword: false } })
  return session
}

/** Due colleghi con ruolo staff: chi è dentro e chi compila la chiusura. */
async function dueColleghi() {
  const utenti = await prisma.user.findMany({
    where: { role: { name: 'staff' }, isActive: true },
    orderBy: { username: 'asc' },
    take: 2,
  })
  if (utenti.length < 2) throw new Error('Servono due utenti staff nel seed.')
  return { dentro: utenti[0], operatore: utenti[1] }
}

/** Entrata senza uscita: la persona risulta ancora in servizio. */
async function entrataAperta(userId: string, oraDiRoma = 18 * 60) {
  const venue = await venueDiTest()
  return prisma.attendanceRecord.create({
    data: {
      userId,
      venueId: venue.id,
      punchType: 'IN',
      punchedAt: romeInstant(GIORNO, oraDiRoma),
    },
  })
}

function chiudi(userId: string, orario: string) {
  return jsonRequest('/api/attendance/timbrature-aperte', {
    method: 'POST',
    body: { date: GIORNO, uscite: [{ userId, orario }] },
  })
}

async function notificheDi(userId: string) {
  return prisma.notificationLog.findMany({ where: { userId } })
}

describe('POST /api/attendance/timbrature-aperte', () => {
  it('avvisa chi si vede registrare l\'uscita da un collega', async () => {
    const { dentro, operatore } = await dueColleghi()
    await entrataAperta(dentro.id)
    await entraComeUtente(operatore.id)

    const { status } = await callRoute(confermaUscite, chiudi(dentro.id, '22:00'))

    expect(status).toBe(200)

    const avvisi = await notificheDi(dentro.id)
    expect(avvisi).toHaveLength(1)
    // L'avviso deve dire l'orario registrato e chi l'ha registrato: senza
    // quei due dati non si capisce cosa contestare, né a chi.
    expect(avvisi[0].body).toContain('22:00')
    expect(avvisi[0].body).toContain(operatore.firstName)
  })

  it('non avvisa nessuno quando è la persona stessa a registrarsi l\'uscita', async () => {
    const { dentro } = await dueColleghi()
    await entrataAperta(dentro.id)
    await entraComeUtente(dentro.id)

    const { status } = await callRoute(confermaUscite, chiudi(dentro.id, '22:00'))

    expect(status).toBe(200)
    expect(await notificheDi(dentro.id)).toHaveLength(0)
  })

  it('non avvisa quando la chiusura viene rifiutata', async () => {
    const { dentro, operatore } = await dueColleghi()
    // Nessuna entrata aperta: la route rifiuta l'intera chiusura con 422 e
    // non registra niente. Nemmeno l'avviso deve partire.
    await entraComeUtente(operatore.id)

    const { status } = await callRoute(confermaUscite, chiudi(dentro.id, '22:00'))

    expect(status).toBe(422)
    expect(await notificheDi(dentro.id)).toHaveLength(0)
  })

  it('avvisa ciascuno degli interessati, e nessun altro', async () => {
    const utenti = await prisma.user.findMany({
      where: { role: { name: 'staff' }, isActive: true },
      orderBy: { username: 'asc' },
      take: 3,
    })
    const [primo, secondo, operatore] = utenti
    await entrataAperta(primo.id)
    await entrataAperta(secondo.id, 19 * 60)
    await entraComeUtente(operatore.id)

    const { status } = await callRoute(
      confermaUscite,
      jsonRequest('/api/attendance/timbrature-aperte', {
        method: 'POST',
        body: {
          date: GIORNO,
          uscite: [
            { userId: primo.id, orario: '22:00' },
            { userId: secondo.id, orario: '23:30' },
          ],
        },
      })
    )

    expect(status).toBe(200)
    expect(await notificheDi(primo.id)).toHaveLength(1)
    expect(await notificheDi(secondo.id)).toHaveLength(1)
    expect(await notificheDi(operatore.id)).toHaveLength(0)
    expect((await notificheDi(secondo.id))[0].body).toContain('23:30')
  })
})
