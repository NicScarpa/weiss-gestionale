import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { setupIntegrationDb } from '@/test/integration/db'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { creaChiusura, venueDiTest } from '@/test/integration/fixtures/closures'
import { creaMovimento } from '@/test/integration/fixtures/scadenzario'
import { riportaSaldoIniziale, riportaSaldiTutteLeSedi } from '@/lib/riporto-anno'
import { POST as POST_cron } from '@/app/api/saldi/riporto-anno/cron/route'

/**
 * Riporto del saldo di fine anno.
 *
 * La decisione che questi test difendono è che **la riga non si inventa**: se
 * il 31 dicembre non è chiuso e validato, il riporto si astiene. Un saldo
 * iniziale sbagliato non si nota — si trascina per dodici mesi e sposta ogni
 * numero che ne discende.
 */
setupIntegrationDb()

const CRON_SECRET = 'segreto-di-prova'

let venueId: string

beforeEach(async () => {
  process.env.CRON_SECRET = CRON_SECRET
  venueId = (await venueDiTest()).id
})

/** Saldo iniziale dell'anno, letto secco. */
async function saldoIniziale(anno: number) {
  const riga = await prisma.initialBalance.findUnique({
    where: { venueId_year: { venueId, year: anno } },
  })
  return riga
    ? { cash: Number(riga.cashBalance), bank: Number(riga.bankBalance), notes: riga.notes }
    : null
}

/** Chiusura del 31 dicembre nello stato indicato. */
function chiusuraDiFineAnno(anno: number, status: 'DRAFT' | 'SUBMITTED' | 'VALIDATED') {
  return creaChiusura({ venueId, date: new Date(`${anno}-12-31`), status })
}

describe('il riporto crea il saldo del nuovo anno', () => {
  it('riporta cassa e banca al 31 dicembre', async () => {
    await prisma.initialBalance.create({
      data: { venueId, year: 2026, cashBalance: 500, bankBalance: 1000 },
    })
    // Movimenti dell'anno: +200 in cassa, −300 in banca
    await creaMovimento({ venueId, entrata: 200, date: new Date('2026-06-10'), registerType: 'CASH' })
    await creaMovimento({ venueId, uscita: 300, date: new Date('2026-06-11'), registerType: 'BANK' })
    await chiusuraDiFineAnno(2026, 'VALIDATED')

    const esito = await riportaSaldoIniziale({ venueId, annoDaChiudere: 2026 })

    expect(esito).toMatchObject({ esito: 'creato', anno: 2027, cashBalance: 700, bankBalance: 700 })
    // Il valore scritto, non solo l'esito dichiarato
    expect(await saldoIniziale(2027)).toMatchObject({ cash: 700, bank: 700 })
  })

  it('la nota dice da dove viene il numero', async () => {
    await chiusuraDiFineAnno(2026, 'VALIDATED')

    await riportaSaldoIniziale({ venueId, annoDaChiudere: 2026 })

    expect((await saldoIniziale(2027))?.notes).toContain('2026-12-31')
  })
})

describe("senza il 31 dicembre validato non si inventa nulla", () => {
  it('nessuna chiusura: nessuna riga, e il motivo lo dice', async () => {
    await creaMovimento({ venueId, entrata: 200, date: new Date('2026-06-10') })

    const esito = await riportaSaldoIniziale({ venueId, annoDaChiudere: 2026 })

    expect(esito).toMatchObject({ esito: 'chiusura_mancante', anno: 2027 })
    expect('motivo' in esito && esito.motivo).toContain('2026-12-31')
    expect(await saldoIniziale(2027)).toBeNull()
  })

  it('chiusura in bozza: nessuna riga', async () => {
    // Il caso insidioso: la chiusura ESISTE ma non è validata, quindi le
    // scritture di quel giorno non sono ancora state generate. Un saldo
    // calcolato qui sarebbe plausibile e incompleto.
    await chiusuraDiFineAnno(2026, 'DRAFT')

    const esito = await riportaSaldoIniziale({ venueId, annoDaChiudere: 2026 })

    expect(esito).toMatchObject({ esito: 'chiusura_mancante' })
    expect('motivo' in esito && esito.motivo).toContain('DRAFT')
    expect(await saldoIniziale(2027)).toBeNull()
  })

  it('chiusura inviata ma non ancora validata: nessuna riga', async () => {
    await chiusuraDiFineAnno(2026, 'SUBMITTED')

    expect(await riportaSaldoIniziale({ venueId, annoDaChiudere: 2026 })).toMatchObject({
      esito: 'chiusura_mancante',
    })
    expect(await saldoIniziale(2027)).toBeNull()
  })

  it('chiusura validata ma cancellata: nessuna riga', async () => {
    const chiusura = await chiusuraDiFineAnno(2026, 'VALIDATED')
    await prisma.dailyClosure.update({
      where: { id: chiusura.id },
      data: { deletedAt: new Date() },
    })

    expect(await riportaSaldoIniziale({ venueId, annoDaChiudere: 2026 })).toMatchObject({
      esito: 'chiusura_mancante',
    })
    expect(await saldoIniziale(2027)).toBeNull()
  })
})

describe('il riporto non sovrascrive e non raddoppia', () => {
  it('un saldo iniziale già presente resta intatto', async () => {
    await chiusuraDiFineAnno(2026, 'VALIDATED')
    await prisma.initialBalance.create({
      data: {
        venueId,
        year: 2027,
        cashBalance: new Prisma.Decimal('123.45'),
        bankBalance: new Prisma.Decimal('678.90'),
        notes: 'inserito a mano dal titolare',
      },
    })

    expect(await riportaSaldoIniziale({ venueId, annoDaChiudere: 2026 })).toMatchObject({
      esito: 'gia_presente',
    })
    // Il valore scritto a mano non si tocca: è più informato del calcolo
    expect(await saldoIniziale(2027)).toMatchObject({
      cash: 123.45,
      bank: 678.9,
      notes: 'inserito a mano dal titolare',
    })
  })

  it('due riporti simultanei creano una riga sola', { repeats: 5 }, async () => {
    await chiusuraDiFineAnno(2026, 'VALIDATED')

    const esiti = await Promise.all([
      riportaSaldoIniziale({ venueId, annoDaChiudere: 2026 }),
      riportaSaldoIniziale({ venueId, annoDaChiudere: 2026 }),
    ])

    expect(esiti.every((e) => e.esito === 'creato' || e.esito === 'gia_presente')).toBe(true)
    expect(
      await prisma.initialBalance.count({ where: { venueId, year: 2027 } })
    ).toBe(1)
  })
})

describe('una sede in ritardo non ferma le altre', () => {
  it('riporta chi ha chiuso e segnala chi no', async () => {
    const altra = await prisma.venue.create({
      data: { name: 'Sede senza chiusura', code: 'ZZTEST' },
    })
    await chiusuraDiFineAnno(2026, 'VALIDATED')

    const esiti = await riportaSaldiTutteLeSedi(2026)

    expect(esiti.find((e) => e.venueId === venueId)?.esito).toBe('creato')
    expect(esiti.find((e) => e.venueId === altra.id)?.esito).toBe('chiusura_mancante')
  })
})

describe('la route del cron', () => {
  function chiama(opzioni: { segreto?: string; anno?: number } = {}) {
    return callRoute<{ creati?: number; daChiudere?: unknown[]; error?: string }>(
      POST_cron,
      jsonRequest(
        `/api/saldi/riporto-anno/cron${opzioni.anno ? `?anno=${opzioni.anno}` : ''}`,
        {
          method: 'POST',
          headers: opzioni.segreto ? { authorization: `Bearer ${opzioni.segreto}` } : {},
        }
      )
    )
  }

  it('senza segreto risponde 401 e non scrive nulla', async () => {
    await chiusuraDiFineAnno(2026, 'VALIDATED')

    expect((await chiama({ anno: 2026 })).status).toBe(401)
    expect(await saldoIniziale(2027)).toBeNull()
  })

  it('con il segreto sbagliato risponde 401', async () => {
    expect((await chiama({ segreto: 'sbagliato', anno: 2026 })).status).toBe(401)
  })

  it('con il segreto giusto riporta e dice quante sedi restano da chiudere', async () => {
    await chiusuraDiFineAnno(2026, 'VALIDATED')

    const esito = await chiama({ segreto: CRON_SECRET, anno: 2026 })

    expect(esito.status).toBe(200)
    expect(esito.body.creati).toBe(1)
    expect(esito.body.daChiudere).toEqual([])
    expect(await saldoIniziale(2027)).not.toBeNull()
  })

  it('le sedi da chiudere compaiono nella risposta, e non sono un errore', async () => {
    // Nessuna chiusura: il cron ha funzionato, semplicemente non c'era nulla
    // da riportare. Chi legge deve distinguere «non ho potuto» da «sono rotto».
    const esito = await chiama({ segreto: CRON_SECRET, anno: 2026 })

    expect(esito.status).toBe(200)
    expect(esito.body.creati).toBe(0)
    expect(esito.body.daChiudere).toHaveLength(1)
  })

  it('un anno fuori scala è rifiutato', async () => {
    expect((await chiama({ segreto: CRON_SECRET, anno: 12026 })).status).toBe(400)
  })
})
