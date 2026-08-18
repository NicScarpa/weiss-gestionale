/**
 * Quanto cambiano i punteggi delle proposte VERE con le tre correzioni del
 * 17 agosto 2026: forma societaria tollerata, ripiego per somiglianza sulla
 * finestra migliore, e disaccordo sul metodo di pagamento che non azzera più
 * il fattore.
 *
 * Sola lettura sul database configurato. Non ricalcola l'intero motore: prende
 * i fattori **salvati** con ogni proposta e applica i due delta, che è il
 * confronto onesto fra prima e dopo sulle stesse coppie.
 *
 * Uso: npx tsx --env-file=.env scripts/riconciliazione/misura-elasticita.ts
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
// Da `causale.ts` e `scala.ts`, che sono moduli foglia: passare da
// `punteggio.ts` trascinerebbe `matcher.ts` e con lui il client Prisma.
import { normalizzaTesto, senzaFormaSocietaria } from '../../src/lib/reconciliation/causale'
import { PESI, SOGLIE, fascia } from '../../src/lib/reconciliation/scala'

interface FattoriSalvati {
  importo?: number
  riferimento?: number
  controparte?: number
  data?: number
  codiceBanca?: number
  unicita?: number
}

// Il client si costruisce qui invece di importare `src/lib/prisma`: quel modulo
// importa `server-only`, che tsx non sa risolvere fuori dal bundle di Next.
// Nessun campo cifrato serve a questa misura.
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const proposte = await prisma.reconciliationProposal.findMany({
    select: {
      id: true,
      punteggio: true,
      fattori: true,
      motivazioni: true,
      stato: true,
      bankTransaction: { select: { description: true } },
      gambe: { select: { schedule: { select: { controparteNome: true } } } },
    },
  })

  let guadagnoControparte = 0
  let guadagnoCodice = 0
  const primaPerFascia: Record<string, number> = { alta: 0, media: 0, bassa: 0 }
  const dopoPerFascia: Record<string, number> = { alta: 0, media: 0, bassa: 0 }
  const promosseInAlta: Array<{ prima: number; dopo: number; chi: string }> = []

  for (const p of proposte) {
    const fattori = (p.fattori ?? {}) as FattoriSalvati
    const causale = normalizzaTesto(p.bankTransaction?.description ?? '')
    let delta = 0

    // 1) La controparte che il nome intero faceva sparire.
    if ((fattori.controparte ?? 0) === 0) {
      for (const gamba of p.gambe) {
        const nome = normalizzaTesto(gamba.schedule?.controparteNome ?? '')
        if (!nome) continue
        const nudo = senzaFormaSocietaria(nome)
        if (nudo !== nome && nudo.length >= 8 && causale.includes(nudo)) {
          delta += 18
          guadagnoControparte++
          break
        }
      }
    }

    // 2) Il disaccordo sul metodo di pagamento, che azzerava il fattore.
    const motivazioni = Array.isArray(p.motivazioni)
      ? (p.motivazioni as Array<{ testo?: string }>)
      : []
    const discorda = motivazioni.some((m) => /codice operazione indica/i.test(m.testo ?? ''))
    if (discorda && (fattori.codiceBanca ?? 0) === 0) {
      delta += Math.round(PESI.CODICE_BANCA / 2)
      guadagnoCodice++
    }

    const prima = p.punteggio
    const dopo = prima + delta
    primaPerFascia[fascia(prima)]++
    dopoPerFascia[fascia(dopo)]++
    if (fascia(prima) !== 'alta' && fascia(dopo) === 'alta') {
      promosseInAlta.push({
        prima,
        dopo,
        chi: p.gambe[0]?.schedule?.controparteNome ?? '(senza controparte)',
      })
    }
  }

  console.log(`RISULTATO — proposte esaminate: ${proposte.length} (soglia Alta: ${SOGLIE.ALTA})`)
  console.log(`  guadagnano la controparte (forma societaria):  ${guadagnoControparte}`)
  console.log(`  guadagnano metà del codice banca:              ${guadagnoCodice}`)
  console.log('')
  console.log('  fascia      prima   dopo')
  for (const f of ['alta', 'media', 'bassa'] as const) {
    console.log(`  ${f.padEnd(10)} ${String(primaPerFascia[f]).padStart(5)} ${String(dopoPerFascia[f]).padStart(6)}`)
  }
  console.log('')
  console.log(`  promosse in fascia Alta: ${promosseInAlta.length}`)
  for (const p of promosseInAlta.slice(0, 15)) {
    console.log(`    ${String(p.prima).padStart(3)} → ${String(p.dopo).padStart(3)}  ${p.chi}`)
  }

  await prisma.$disconnect()
}

main()
