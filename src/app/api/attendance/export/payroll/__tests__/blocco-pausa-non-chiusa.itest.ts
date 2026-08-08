import { describe, it, expect } from 'vitest'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs, setSession, type SeedRole } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { prisma } from '@/lib/prisma'
import { romeDateKey, romeInstant } from '@/lib/timezone'
import { GET as esportaPaghe } from '../route'

/**
 * Il mese non si consegna al consulente del lavoro con dentro una giornata
 * che il programma sa essere incompleta.
 *
 * Vale già per anticipo e straordinario in attesa di revisione. Ora vale
 * anche per la pausa iniziata e mai chiusa: le ore restano quelle timbrate —
 * nessuno viene pagato di meno per una dimenticanza, l'ha deciso il titolare
 * — ma l'errore non può più passare muto. Prima quell'ora regalata arrivava
 * in busta paga senza che nessuno l'avesse guardata.
 */

setupIntegrationDb()

/** Vedi la nota in categorization-rules: gli utenti del seed nascono con `mustChangePassword`. */
async function entraCome(role: SeedRole) {
  const session = await loginAs(role)
  setSession({ ...session, user: { ...session.user, mustChangePassword: false } })
  return session
}

/** Tre giorni fa: una giornata chiusa, senza dipendere dall'ora del test. */
function giornoDiTest(): string {
  return romeDateKey(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000))
}

/** Timbrature di una giornata, in minuti dalla mezzanotte italiana. */
async function preparaGiornata(
  timbrature: { tipo: 'IN' | 'OUT' | 'BREAK_START' | 'BREAK_END'; minuti: number }[]
) {
  const venue = await prisma.venue.findFirstOrThrow({ where: { isActive: true } })
  const utente = await prisma.user.update({
    where: {
      id: (
        await prisma.user.findFirstOrThrow({
          where: { venueId: venue.id, isActive: true },
        })
      ).id,
    },
    // Il calcolo paghe guarda solo chi ha il portale attivo.
    data: { portalEnabled: true },
  })
  const giorno = giornoDiTest()

  for (const t of timbrature) {
    await prisma.attendanceRecord.create({
      data: {
        userId: utente.id,
        venueId: venue.id,
        punchType: t.tipo,
        punchMethod: 'APP',
        punchedAt: romeInstant(giorno, t.minuti),
      },
    })
  }

  return { venue, utente, giorno }
}

async function esporta(giorno: string) {
  const [anno, mese] = giorno.split('-').map(Number)

  return callRoute<{ error?: string; details?: string[] }>(
    esportaPaghe,
    jsonRequest('/api/attendance/export/payroll', {
      searchParams: { month: mese, year: anno, format: 'csv' },
    })
  )
}

describe('GET /api/attendance/export/payroll', () => {
  it('rifiuta il mese con una pausa iniziata e mai chiusa', async () => {
    const { giorno, utente } = await preparaGiornata([
      { tipo: 'IN', minuti: 9 * 60 },
      { tipo: 'BREAK_START', minuti: 13 * 60 },
      { tipo: 'OUT', minuti: 18 * 60 },
    ])
    await entraCome('admin')

    const { status, body } = await esporta(giorno)

    expect(status).toBe(409)
    expect(body.error).toMatch(/pausa/i)
    expect(body.details?.join(' ')).toContain(utente.lastName)
  })

  it('dice quale giorno bloccarsi a guardare', async () => {
    const { giorno } = await preparaGiornata([
      { tipo: 'IN', minuti: 9 * 60 },
      { tipo: 'BREAK_START', minuti: 13 * 60 },
      { tipo: 'OUT', minuti: 18 * 60 },
    ])
    await entraCome('admin')

    const { body } = await esporta(giorno)
    const atteso = giorno.split('-').reverse().join('/')

    expect(body.details?.join(' ')).toContain(atteso)
  })

  it('esporta il mese quando la pausa è stata chiusa', async () => {
    const { giorno } = await preparaGiornata([
      { tipo: 'IN', minuti: 9 * 60 },
      { tipo: 'BREAK_START', minuti: 13 * 60 },
      { tipo: 'BREAK_END', minuti: 14 * 60 },
      { tipo: 'OUT', minuti: 18 * 60 },
    ])
    await entraCome('admin')

    const { status } = await esporta(giorno)

    expect(status).toBe(200)
  })

  it('esporta il mese senza pause timbrate del tutto', async () => {
    // Chi non timbra le pause non deve essere bloccato: il blocco riguarda
    // la pausa cominciata e lasciata aperta, non la pausa mai iniziata.
    const { giorno } = await preparaGiornata([
      { tipo: 'IN', minuti: 9 * 60 },
      { tipo: 'OUT', minuti: 18 * 60 },
    ])
    await entraCome('admin')

    const { status } = await esporta(giorno)

    expect(status).toBe(200)
  })
})
