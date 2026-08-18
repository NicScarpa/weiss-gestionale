import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'

import { avvisaContrattiInScadenza } from '../contratti-in-scadenza'

/**
 * L'avviso dei contratti a termine in scadenza.
 *
 * Gira di notte, quando non c'è nessuno a guardare: se sbaglia destinatario o
 * si ripete ogni giorno, l'unico effetto è che si impara a ignorarlo — e un
 * avviso che si impara a ignorare non funziona proprio quando servirebbe.
 */

setupIntegrationDb()

const OGGI = new Date('2026-08-18')

async function dipendenteConScadenza(giorni: number, nome = 'Anna') {
  const venue = await prisma.venue.findFirstOrThrow()
  const ruolo = await prisma.role.findFirstOrThrow({ where: { name: 'staff' } })
  const fine = new Date(OGGI)
  fine.setUTCDate(fine.getUTCDate() + giorni)

  return prisma.user.create({
    data: {
      firstName: nome,
      lastName: 'Zamai',
      username: `${nome.toLowerCase()}.zamai.${giorni}`,
      email: `${nome.toLowerCase()}${giorni}@esempio.it`,
      passwordHash: 'x',
      roleId: ruolo.id,
      venueId: venue.id,
      contractType: 'TEMPO_DETERMINATO',
      hireDate: new Date('2026-01-01'),
      contractEndDate: fine,
      isActive: true,
    },
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('avviso dei contratti in scadenza', () => {
  it('avvisa per un contratto che scade entro il preavviso', async () => {
    const dipendente = await dipendenteConScadenza(7)

    const esito = await avvisaContrattiInScadenza(OGGI)

    expect(esito.contrattiSegnalati).toBe(1)
    const avvisi = await prisma.notificationLog.findMany({
      where: { type: 'CONTRACT_EXPIRING' },
    })
    expect(avvisi.length).toBeGreaterThan(0)
    expect(avvisi[0].referenceId).toBe(dipendente.id)
    expect(avvisi[0].body).toContain('Anna Zamai')
  })

  it('non avvisa per un contratto ancora lontano', async () => {
    await dipendenteConScadenza(60)

    const esito = await avvisaContrattiInScadenza(OGGI)

    expect(esito.contrattiSegnalati).toBe(0)
    expect(await prisma.notificationLog.count({ where: { type: 'CONTRACT_EXPIRING' } })).toBe(0)
  })

  it('avvisa admin e manager, non la persona interessata', async () => {
    const dipendente = await dipendenteConScadenza(3)

    await avvisaContrattiInScadenza(OGGI)

    const destinatari = await prisma.notificationLog.findMany({
      where: { type: 'CONTRACT_EXPIRING' },
      select: { userId: true },
    })
    expect(destinatari.map((d) => d.userId)).not.toContain(dipendente.id)

    const ruoli = await prisma.user.findMany({
      where: { id: { in: destinatari.map((d) => d.userId) } },
      select: { role: { select: { name: true } } },
    })
    expect(ruoli.every((u) => ['admin', 'manager'].includes(u.role.name))).toBe(true)
  })

  it('non ripete lo stesso avviso la notte dopo', async () => {
    // Il contratto resta in scadenza per quindici notti di fila: ripetere
    // l'avviso ogni volta lo trasformerebbe in rumore da ignorare.
    await dipendenteConScadenza(5)

    const primo = await avvisaContrattiInScadenza(OGGI)
    const domani = new Date('2026-08-19')
    const secondo = await avvisaContrattiInScadenza(domani)

    expect(primo.contrattiSegnalati).toBe(1)
    expect(secondo.contrattiSegnalati).toBe(0)
  })

  it('torna ad avvisare se la data di fine cambia', async () => {
    // Contratto rinnovato: è un contratto nuovo, e la sua scadenza va
    // segnalata a suo tempo come tutte le altre.
    const dipendente = await dipendenteConScadenza(5)
    await avvisaContrattiInScadenza(OGGI)

    await prisma.user.update({
      where: { id: dipendente.id },
      data: { contractEndDate: new Date('2026-08-30') },
    })

    const dopoIlRinnovo = await avvisaContrattiInScadenza(new Date('2026-08-20'))
    expect(dopoIlRinnovo.contrattiSegnalati).toBe(1)
  })
})
