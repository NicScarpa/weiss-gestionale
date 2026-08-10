import { describe, it, expect } from 'vitest'
import {
  FINESTRA_RECUPERO_GIORNI,
  fineTurnoInMinuti,
  orarioChiusuraAutomatica,
} from '../auto-clockout'
import { romeInstant } from '@/lib/timezone'

/** Colonna @db.Time come la restituisce Prisma: 1° gennaio 1970 in UTC. */
function orario(ore: number, minuti = 0): Date {
  return new Date(Date.UTC(1970, 0, 1, ore, minuti))
}

describe('fineTurnoInMinuti', () => {
  it('senza turni non sa dire nulla', () => {
    expect(fineTurnoInMinuti([])).toBeNull()
  })

  it('legge la fine del turno semplice', () => {
    expect(fineTurnoInMinuti([{ startTime: orario(7), endTime: orario(13) }])).toBe(13 * 60)
  })

  it('sul turno spezzato vale la fine della sera, non quella di mezzogiorno', () => {
    const fine = fineTurnoInMinuti([
      { startTime: orario(7), endTime: orario(13) },
      { startTime: orario(17), endTime: orario(22) },
    ])

    expect(fine).toBe(22 * 60)
  })

  it('il turno che scavalca la mezzanotte finisce dopo il minuto 1440', () => {
    // 21:00 -> 01:00: la fine è l'01:00 del giorno dopo, minuto 1500.
    expect(fineTurnoInMinuti([{ startTime: orario(21), endTime: orario(1) }])).toBe(25 * 60)
  })

  it('ignora i turni senza orari', () => {
    const fine = fineTurnoInMinuti([
      { startTime: null, endTime: null },
      { startTime: orario(9), endTime: orario(18) },
    ])

    expect(fine).toBe(18 * 60)
  })
})

describe('orarioChiusuraAutomatica', () => {
  it('chiude alla fine del turno pianificato, non a dodici ore', () => {
    // Difetto 2 dell'audit W5-F3. Mario ha il turno 07:00-13:00, entra alle
    // 06:58 e non timbra l'uscita. Prima il sistema gli scriveva le 18:58 —
    // un orario che nessuno ha mai lavorato — e gli pagava 12 ore invece di
    // 6: 84 € di troppo per una dimenticanza. Il sistema sapeva già calcolare
    // la fine del turno (sessioni-aperte.ts, usata dalla chiusura di cassa) e
    // non la importava nemmeno.
    const esito = orarioChiusuraAutomatica({
      entrataAlle: romeInstant('2026-08-20', 6 * 60 + 58),
      dateKeyEntrata: '2026-08-20',
      fineTurnoMinuti: 13 * 60,
      maxHours: 12,
    })

    expect(esito.orario.getTime()).toBe(romeInstant('2026-08-20', 13 * 60).getTime())
    expect(esito.origine).toBe('turno')
  })

  it('senza turno pianificato ripiega sul tetto di ore', () => {
    const esito = orarioChiusuraAutomatica({
      entrataAlle: romeInstant('2026-08-20', 6 * 60 + 58),
      dateKeyEntrata: '2026-08-20',
      fineTurnoMinuti: null,
      maxHours: 12,
    })

    expect(esito.orario.getTime()).toBe(romeInstant('2026-08-20', 18 * 60 + 58).getTime())
    expect(esito.origine).toBe('ripiego')
  })

  it('il tetto di ore resta un tetto anche col turno pianificato', () => {
    // Turno dichiarato 07:00-23:00: sedici ore. Il pianificato non può
    // scavalcare il limite di sicurezza, altrimenti basterebbe un turno
    // sbagliato per far pagare una giornata intera.
    const esito = orarioChiusuraAutomatica({
      entrataAlle: romeInstant('2026-08-20', 7 * 60),
      dateKeyEntrata: '2026-08-20',
      fineTurnoMinuti: 23 * 60,
      maxHours: 12,
    })

    expect(esito.orario.getTime()).toBe(romeInstant('2026-08-20', 19 * 60).getTime())
    expect(esito.origine).toBe('ripiego')
  })

  it('una fine turno anteriore all entrata non viene usata', () => {
    // Dato incoerente: chiuderebbe l'uscita prima dell'entrata.
    const esito = orarioChiusuraAutomatica({
      entrataAlle: romeInstant('2026-08-20', 14 * 60),
      dateKeyEntrata: '2026-08-20',
      fineTurnoMinuti: 13 * 60,
      maxHours: 12,
    })

    expect(esito.origine).toBe('ripiego')
    expect(esito.orario.getTime()).toBeGreaterThan(
      romeInstant('2026-08-20', 14 * 60).getTime()
    )
  })

  it('il turno serale si chiude dopo la mezzanotte, nel giorno giusto', () => {
    // Entrata alle 21:00 del 20, turno fino all'01:00 del 21.
    const esito = orarioChiusuraAutomatica({
      entrataAlle: romeInstant('2026-08-20', 21 * 60),
      dateKeyEntrata: '2026-08-20',
      fineTurnoMinuti: 25 * 60,
      maxHours: 12,
    })

    expect(esito.orario.getTime()).toBe(romeInstant('2026-08-21', 60).getTime())
    expect(esito.origine).toBe('turno')
  })
})

describe('FINESTRA_RECUPERO_GIORNI', () => {
  it('è abbastanza larga da non perdere le entrate se il servizio si ferma', () => {
    // Difetto 3 dell'audit W5-F3: con `gte: now - 24h` e una soglia di 12 ore
    // la finestra utile era di 12 ore soltanto. Se il servizio restava fermo
    // mezza giornata, quella timbratura usciva dalla portata del programma e
    // NESSUN giro futuro la guardava più: l'entrata restava aperta per sempre
    // e la giornata valeva zero ore al dipendente. Col valore massimo
    // consentito dalle impostazioni (24 ore) la finestra era proprio vuota, e
    // il programma smetteva di chiudere qualsiasi cosa in silenzio.
    const soglieAmmesse = [4, 12, 24] // z.number().min(4).max(24) nelle policy

    for (const soglia of soglieAmmesse) {
      const oreUtili = FINESTRA_RECUPERO_GIORNI * 24 - soglia
      expect(oreUtili).toBeGreaterThan(24 * 7)
    }
  })
})
