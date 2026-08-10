import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { saldiAlGiorno } from '@/lib/saldi'
import { toDateOnlyUtc } from '@/lib/timezone'

/**
 * Riporto del saldo da un anno al successivo.
 *
 * Senza la riga `InitialBalance` dell'anno in corso, `saldi.ts` non si ferma:
 * ripiega sulla più recente che trova (`year: { lte: anno }`). Il 1° gennaio
 * quella è la riga dell'anno prima, quindi i saldi ripartono da una fotografia
 * vecchia di dodici mesi — e nessuna schermata dice che sta succedendo. Il
 * ripiego è ragionevole finché i movimenti intermedi ci sono tutti, ma è un
 * silenzio che non si nota.
 *
 * **La riga non viene mai inventata.** Se il 31 dicembre non è stato chiuso e
 * validato, il riporto si astiene e lo dice. È una decisione presa dal
 * committente, e il motivo tecnico la conferma: le scritture di prima nota di
 * una giornata nascono quando la chiusura viene **validata**
 * (`closure-service.ts`, `generateJournalEntriesFromClosure` dentro la
 * transazione che porta a VALIDATED). Con il 31 dicembre ancora in bozza i
 * movimenti dell'ultimo giorno non esistono ancora: il saldo calcolato sarebbe
 * plausibile e sbagliato, e resterebbe sbagliato per tutto l'anno nuovo.
 * Meglio nessuna riga con un avviso che una riga falsa.
 */

export type EsitoRiporto =
  /** Riga creata: `anno` è quello nuovo, i saldi sono quelli al 31 dicembre precedente. */
  | { esito: 'creato'; venueId: string; anno: number; cashBalance: number; bankBalance: number }
  /** C'era già: il riporto non sovrascrive mai un saldo iniziale esistente. */
  | { esito: 'gia_presente'; venueId: string; anno: number }
  /** Il 31 dicembre non è chiuso e validato: non si inventa un saldo. */
  | { esito: 'chiusura_mancante'; venueId: string; anno: number; motivo: string }

/** L'ultimo giorno dell'anno, come giorno civile 'yyyy-MM-dd'. */
function ultimoGiorno(anno: number): string {
  return `${anno}-12-31`
}

/**
 * Crea il saldo iniziale di `annoDaChiudere + 1` con i saldi al 31 dicembre di
 * `annoDaChiudere`. Idempotente: chiamarla due volte non cambia nulla, e due
 * chiamate simultanee non creano due righe (se ne occupa
 * `@@unique([venueId, year])`, con la perdente che esce come 'gia_presente'
 * invece che come errore).
 */
export async function riportaSaldoIniziale({
  venueId,
  annoDaChiudere,
}: {
  venueId: string
  annoDaChiudere: number
}): Promise<EsitoRiporto> {
  const annoNuovo = annoDaChiudere + 1

  const esistente = await prisma.initialBalance.findUnique({
    where: { venueId_year: { venueId, year: annoNuovo } },
    select: { id: true },
  })
  if (esistente) return { esito: 'gia_presente', venueId, anno: annoNuovo }

  const giorno = ultimoGiorno(annoDaChiudere)
  const chiusura = await prisma.dailyClosure.findFirst({
    where: { venueId, date: toDateOnlyUtc(giorno), deletedAt: null },
    select: { id: true, status: true },
  })

  if (!chiusura) {
    return {
      esito: 'chiusura_mancante',
      venueId,
      anno: annoNuovo,
      motivo: `Nessuna chiusura di cassa per il ${giorno}: il saldo iniziale ${annoNuovo} non è stato creato`,
    }
  }
  if (chiusura.status !== 'VALIDATED') {
    return {
      esito: 'chiusura_mancante',
      venueId,
      anno: annoNuovo,
      motivo:
        `La chiusura del ${giorno} è in stato ${chiusura.status} e non validata: le scritture ` +
        `di quel giorno non esistono ancora, quindi il saldo iniziale ${annoNuovo} non è stato creato`,
    }
  }

  const saldi = await saldiAlGiorno(venueId, giorno)

  try {
    await prisma.initialBalance.create({
      data: {
        venueId,
        year: annoNuovo,
        cashBalance: new Prisma.Decimal(saldi.cashBalance.toFixed(2)),
        bankBalance: new Prisma.Decimal(saldi.bankBalance.toFixed(2)),
        notes: `Riporto automatico dalla chiusura del ${giorno}`,
      },
    })
  } catch (error) {
    // Due esecuzioni sovrapposte: il vincolo di unicità ferma la seconda, che
    // non ha nulla da fare perché la riga ormai c'è.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { esito: 'gia_presente', venueId, anno: annoNuovo }
    }
    throw error
  }

  return {
    esito: 'creato',
    venueId,
    anno: annoNuovo,
    cashBalance: saldi.cashBalance,
    bankBalance: saldi.bankBalance,
  }
}

/**
 * Riporto per tutte le sedi. Non si ferma alla prima che non ha chiuso: ogni
 * sede è indipendente, e una sede in ritardo non deve impedire alle altre di
 * avere il proprio saldo iniziale.
 */
export async function riportaSaldiTutteLeSedi(annoDaChiudere: number): Promise<EsitoRiporto[]> {
  const sedi = await prisma.venue.findMany({ select: { id: true }, orderBy: { code: 'asc' } })

  const esiti: EsitoRiporto[] = []
  for (const sede of sedi) {
    esiti.push(await riportaSaldoIniziale({ venueId: sede.id, annoDaChiudere }))
  }

  const mancanti = esiti.filter((e) => e.esito === 'chiusura_mancante')
  if (mancanti.length > 0) {
    // Livello warn, non info: è la condizione che richiede l'intervento di una
    // persona, ed è l'unico posto in cui il sistema può dirlo.
    logger.warn('Riporto di fine anno: sedi senza chiusura validata del 31 dicembre', {
      annoDaChiudere,
      sedi: mancanti.map((e) => ({ venueId: e.venueId, motivo: e.motivo })),
    })
  }
  logger.info('Riporto di fine anno eseguito', {
    annoDaChiudere,
    creati: esiti.filter((e) => e.esito === 'creato').length,
    giaPresenti: esiti.filter((e) => e.esito === 'gia_presente').length,
    mancanti: mancanti.length,
  })

  return esiti
}
