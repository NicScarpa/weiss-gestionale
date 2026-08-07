/**
 * Script 04 — Rollback della migrazione al piano dei conti v4.
 *
 * Riporta il database allo stato fotografato dallo snapshot che `03-migrate.ts`
 * salva prima di scrivere. In una sola transazione SERIALIZABLE:
 *   1. riattiva i conti legacy come erano nello snapshot;
 *   2. ripristina righe di budget e mappature budget cancellate;
 *   3. toglie la `system_key = CORRISPETTIVI` dalla voce 10.01 se lo snapshot
 *      dice che prima non c'era;
 *   4. disattiva — non cancella MAI — le 155 voci v4 introdotte dalla
 *      migrazione. Le voci che esistevano già prima tornano all'anagrafica
 *      INTERA registrata nello snapshot (nome, mastro, gruppo, regola centro,
 *      is_active): l'upsert della migrazione le aveva sovrascritte.
 *
 * Regola non negoziabile: una voce v4 che nel frattempo ha acquisito
 * riferimenti (un movimento, una fetta, una riga fattura, una regola…) NON
 * viene toccata e il rollback si ferma elencandole. Cancellarle o
 * disattivarle romperebbe dati nati dopo la migrazione: in quel caso il
 * rollback va deciso a mano, non a colpi di script.
 *
 * Il bersaglio dello snapshot deve coincidere con quello corrente: gli
 * snapshot di prova e quelli di produzione finiscono nella stessa cartella e
 * si distinguono solo dal timestamp. Applicare lo snapshot sbagliato
 * spegnerebbe le 155 voci del database giusto.
 *
 * MODALITÀ: dry-run di default, `--execute` per scrivere davvero.
 *
 * Uso:
 *   DATABASE_URL="…" npx tsx scripts/piano-v4/04-rollback.ts --snapshot <file>.json
 *   DATABASE_URL="…" npx tsx scripts/piano-v4/04-rollback.ts --snapshot <file>.json --execute
 *
 * Flag:
 *   --forza   procede anche se lo snapshot viene da un altro bersaglio
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { PIANO_CONTI_WEISS_V4 } from '../../src/lib/accounts/piano-conti-weiss-v4'

import {
  argomento,
  comeDb,
  confermaScrittura,
  contaRiferimenti,
  creaClient,
  descriviDatabase,
  flag,
  formattaDettaglio,
  stampaIntestazione,
  validaArgomenti,
  type Db,
} from './_comune'

const VOCE_CORRISPETTIVI = '10.01'
const CODICI_V4 = [...new Set(PIANO_CONTI_WEISS_V4.map((v) => v.code))]

validaArgomenti(['execute', 'forza'], ['snapshot'])

const esegui = flag('execute')
const forza = flag('forza')

interface ContoLegacySnapshot {
  id: string
  code: string
  name: string
  type: string
  isActive: boolean
  systemKey: string | null
}

interface VoceV4Snapshot {
  id: string
  code: string
  name: string
  type: string
  isActive: boolean
  systemKey: string | null
  mastroCode: string | null
  mastroNome: string | null
  gruppoCode: string | null
  gruppoNome: string | null
  costCenterRule: string
}

interface Snapshot {
  versione: number
  generatoIl: string
  /** Identità completa del bersaglio: utente@nomedb su host:porta. */
  bersaglio: string
  modalita: string
  mantieniBudget?: boolean
  contiLegacy: ContoLegacySnapshot[]
  vociV4Preesistenti: VoceV4Snapshot[]
  budgetLines: Record<string, unknown>[]
  accountBudgetMappings: Record<string, unknown>[]
}

const VERSIONI_LETTE = [3]

function leggiSnapshot(percorso: string): Snapshot {
  const grezzo = JSON.parse(readFileSync(percorso, 'utf8'))
  if (!VERSIONI_LETTE.includes(grezzo.versione)) {
    throw new Error(
      `Snapshot di versione ${grezzo.versione}: questo script legge solo la/le versione/i ${VERSIONI_LETTE.join(', ')}. Rifare il dry-run con lo script 03 aggiornato.`
    )
  }
  for (const campo of ['contiLegacy', 'vociV4Preesistenti', 'budgetLines', 'accountBudgetMappings']) {
    if (!Array.isArray(grezzo[campo])) {
      throw new Error(`Snapshot malformato: manca l'elenco "${campo}"`)
    }
    // Ogni riga deve avere un id: senza, il confronto con lo stato attuale
    // slitterebbe in silenzio e il ripristino sarebbe parziale.
    const righe = grezzo[campo] as Record<string, unknown>[]
    const senzaId = righe.findIndex((r) => !r || typeof r.id !== 'string' || r.id.length === 0)
    if (senzaId >= 0) {
      throw new Error(`Snapshot malformato: "${campo}" ha una riga senza id (posizione ${senzaId})`)
    }
  }
  if (typeof grezzo.bersaglio !== 'string' || grezzo.bersaglio.length === 0) {
    throw new Error('Snapshot malformato: manca il campo "bersaglio"')
  }
  return grezzo as Snapshot
}

/**
 * Prova diretta della provenienza dello snapshot: quanti dei conti legacy
 * fotografati esistono davvero in questo database.
 *
 * Il confronto sulle stringhe di connessione è una premessa, non una prova:
 * due ambienti possono presentarsi allo stesso modo, e chiunque può
 * modificare un JSON. Gli id sono cuid generati alla creazione del conto:
 * se non ne esiste nemmeno uno, lo snapshot viene da un altro database.
 */
async function contiLegacyRiconosciuti(db: Db, snap: Snapshot): Promise<number> {
  if (snap.contiLegacy.length === 0) return 0
  return db.account.count({ where: { id: { in: snap.contiLegacy.map((c) => c.id) } } })
}

/**
 * Le colonne data vanno riconvertite: nel JSON sono stringhe ISO. Si guarda
 * il nome della colonna oltre alla forma del valore, per non trasformare in
 * data una nota di testo che per caso somigli a un timestamp.
 */
function ripristinaTipi(riga: Record<string, unknown>): Record<string, unknown> {
  const fuori: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(riga)) {
    const sembraData = typeof v === 'string' && /(?:At|Date)$/.test(k) && /^\d{4}-\d{2}-\d{2}T/.test(v)
    fuori[k] = sembraData ? new Date(v as string) : v
  }
  return fuori
}

/** Campi dell'anagrafica che l'upsert della migrazione può aver sovrascritto. */
const CAMPI_ANAGRAFICA = [
  'name',
  'isActive',
  'mastroCode',
  'mastroNome',
  'gruppoCode',
  'gruppoNome',
  'costCenterRule',
] as const

interface Piano {
  legacyDaRiattivare: { id: string; code: string; name: string }[]
  budgetLinesDaRipristinare: number
  mappingDaRipristinare: number
  vociDaDisattivare: { code: string; name: string }[]
  vociPreesistentiDaRipristinare: { code: string; campi: string[]; dati: Record<string, unknown> }[]
  corrispettiviDaTogliere: boolean
  vociConRiferimenti: { code: string; name: string; dettaglio: string }[]
}

async function calcolaPiano(db: Db, snap: Snapshot): Promise<Piano> {
  const preesistenti = new Map(snap.vociV4Preesistenti.map((v) => [v.code, v]))

  // Conti legacy: si riattiva solo ciò che nello snapshot risultava attivo.
  const legacyOra = await db.account.findMany({
    where: { id: { in: snap.contiLegacy.map((c) => c.id) } },
    select: { id: true, code: true, name: true, isActive: true },
  })
  const statoOra = new Map(legacyOra.map((c) => [c.id, c]))
  const legacyDaRiattivare = snap.contiLegacy
    .filter((c) => c.isActive && statoOra.get(c.id) && !statoOra.get(c.id)!.isActive)
    .map((c) => ({ id: c.id, code: c.code, name: c.name }))

  // Budget: si reinserisce solo ciò che oggi manca.
  const idBudgetLines = snap.budgetLines.map((b) => b.id as string)
  const budgetLinesEsistenti = new Set(
    (await db.budgetLine.findMany({ where: { id: { in: idBudgetLines } }, select: { id: true } })).map(
      (b) => b.id
    )
  )
  const idMapping = snap.accountBudgetMappings.map((m) => m.id as string)
  const mappingEsistenti = new Set(
    (
      await db.accountBudgetMapping.findMany({ where: { id: { in: idMapping } }, select: { id: true } })
    ).map((m) => m.id)
  )

  // Voci v4 oggi nel database.
  const vociOra = await db.account.findMany({
    where: { code: { in: CODICI_V4 } },
    select: {
      id: true,
      code: true,
      name: true,
      isActive: true,
      systemKey: true,
      mastroCode: true,
      mastroNome: true,
      gruppoCode: true,
      gruppoNome: true,
      costCenterRule: true,
    },
  })

  const riferimenti = await contaRiferimenti(
    db,
    vociOra.map((v) => v.id)
  )

  const vociConRiferimenti: Piano['vociConRiferimenti'] = []
  const vociDaDisattivare: Piano['vociDaDisattivare'] = []
  const vociPreesistentiDaRipristinare: Piano['vociPreesistentiDaRipristinare'] = []

  for (const voce of vociOra) {
    const rif = riferimenti.get(voce.id)
    const prima = preesistenti.get(voce.code)

    if (prima) {
      // Esisteva già: torna com'era in TUTTI i campi che l'upsert tocca,
      // senza guardare i riferimenti (non è la migrazione ad averla
      // introdotta, quindi non la si sta togliendo di mezzo).
      const attuale = voce as unknown as Record<string, unknown>
      const atteso = prima as unknown as Record<string, unknown>
      const campi = CAMPI_ANAGRAFICA.filter((c) => attuale[c] !== atteso[c])
      if (campi.length > 0) {
        const dati: Record<string, unknown> = {}
        for (const c of campi) dati[c] = atteso[c]
        vociPreesistentiDaRipristinare.push({ code: voce.code, campi: [...campi], dati })
      }
      continue
    }

    if (rif && rif.totale > 0) {
      vociConRiferimenti.push({ code: voce.code, name: voce.name, dettaglio: formattaDettaglio(rif) })
      continue
    }
    if (voce.isActive) vociDaDisattivare.push({ code: voce.code, name: voce.name })
  }

  const corrispettivi = vociOra.find((v) => v.code === VOCE_CORRISPETTIVI)
  const corrispettiviPrima = preesistenti.get(VOCE_CORRISPETTIVI)
  const corrispettiviDaTogliere = Boolean(
    corrispettivi &&
      corrispettivi.systemKey === 'CORRISPETTIVI' &&
      corrispettiviPrima?.systemKey !== 'CORRISPETTIVI'
  )

  return {
    legacyDaRiattivare,
    budgetLinesDaRipristinare: snap.budgetLines.filter((b) => !budgetLinesEsistenti.has(b.id as string))
      .length,
    mappingDaRipristinare: snap.accountBudgetMappings.filter((m) => !mappingEsistenti.has(m.id as string))
      .length,
    vociDaDisattivare,
    vociPreesistentiDaRipristinare,
    corrispettiviDaTogliere,
    vociConRiferimenti,
  }
}

class RollbackBloccato extends Error {
  constructor(public voci: Piano['vociConRiferimenti']) {
    super('Rollback bloccato: voci v4 con riferimenti')
    this.name = 'RollbackBloccato'
  }
}

function stampaBlocco(voci: Piano['vociConRiferimenti']) {
  console.error('❌ ROLLBACK BLOCCATO — queste voci del piano v4 hanno già riferimenti:')
  console.error('')
  for (const v of voci) console.error(`   • ${v.code} — ${v.name}: ${v.dettaglio}`)
  console.error('')
  console.error('   Disattivarle romperebbe dati nati dopo la migrazione, e cancellarle')
  console.error('   non è mai un\'opzione. Nessuna scrittura è stata effettuata: decidere')
  console.error('   a mano come rimappare quei riferimenti, poi rilanciare.')
}

async function applica(tx: Db, snap: Snapshot): Promise<Piano> {
  // Ricalcolo dentro la transazione: fra dry-run ed esecuzione il database
  // può essere cambiato.
  const piano = await calcolaPiano(tx, snap)
  if (piano.vociConRiferimenti.length > 0) {
    throw new RollbackBloccato(piano.vociConRiferimenti)
  }

  if (piano.legacyDaRiattivare.length > 0) {
    await tx.account.updateMany({
      where: { id: { in: piano.legacyDaRiattivare.map((c) => c.id) } },
      data: { isActive: true },
    })
  }

  // Il ripristino del budget va fatto PRIMA di toccare le voci v4: le righe
  // puntano ai conti legacy, che a questo punto sono di nuovo attivi.
  const idBudgetLines = snap.budgetLines.map((b) => b.id as string)
  const giaPresenti = new Set(
    (await tx.budgetLine.findMany({ where: { id: { in: idBudgetLines } }, select: { id: true } })).map(
      (b) => b.id
    )
  )
  for (const riga of snap.budgetLines) {
    if (giaPresenti.has(riga.id as string)) continue
    await tx.budgetLine.create({ data: ripristinaTipi(riga) as never })
  }

  const idMapping = snap.accountBudgetMappings.map((m) => m.id as string)
  const mappingPresenti = new Set(
    (
      await tx.accountBudgetMapping.findMany({ where: { id: { in: idMapping } }, select: { id: true } })
    ).map((m) => m.id)
  )
  for (const riga of snap.accountBudgetMappings) {
    if (mappingPresenti.has(riga.id as string)) continue
    await tx.accountBudgetMapping.create({ data: ripristinaTipi(riga) as never })
  }

  if (piano.corrispettiviDaTogliere) {
    await tx.account.update({
      where: { code: VOCE_CORRISPETTIVI },
      data: { systemKey: null },
    })
  }

  if (piano.vociDaDisattivare.length > 0) {
    await tx.account.updateMany({
      where: { code: { in: piano.vociDaDisattivare.map((v) => v.code) } },
      data: { isActive: false },
    })
  }

  for (const v of piano.vociPreesistentiDaRipristinare) {
    await tx.account.update({ where: { code: v.code }, data: v.dati as never })
  }

  const admin = await tx.user.findFirst({
    where: { role: { name: 'admin' }, isActive: true },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })
  await tx.auditLog.create({
    data: {
      userId: admin?.id ?? null,
      action: 'UPDATE',
      entityType: 'Account',
      newValues: JSON.parse(
        JSON.stringify({
          operazione: 'rollback-piano-conti-v4',
          script: 'scripts/piano-v4/04-rollback.ts',
          snapshot: snap.generatoIl,
          legacyRiattivati: piano.legacyDaRiattivare.map((c) => c.code),
          vociV4Disattivate: piano.vociDaDisattivare.length,
          vociV4Ripristinate: piano.vociPreesistentiDaRipristinare.length,
          budgetLinesRipristinate: piano.budgetLinesDaRipristinare,
          mappingRipristinate: piano.mappingDaRipristinare,
        })
      ),
    },
  })

  return piano
}

async function main() {
  const percorso = argomento('snapshot')
  if (!percorso) {
    console.error('❌ Manca --snapshot <file>: il rollback ha bisogno della fotografia')
    console.error('   salvata da 03-migrate.ts (cartella scripts/piano-v4/snapshots/).')
    process.exitCode = 1
    return
  }

  const assoluto = resolve(process.cwd(), percorso)
  const snap = leggiSnapshot(assoluto)

  stampaIntestazione(
    'Piano dei conti v4 — script 04: rollback',
    esegui ? 'ESECUZIONE (scrive nel database)' : 'DRY-RUN (nessuna scrittura) — usare --execute per scrivere'
  )

  console.log(`Snapshot  : ${assoluto}`)
  console.log(`  generato : ${snap.generatoIl} (modalità ${snap.modalita})`)
  console.log(`  bersaglio: ${snap.bersaglio}`)
  console.log('')

  // Snapshot di prova e snapshot di produzione stanno nella stessa cartella e
  // si distinguono solo dal timestamp. Con quello sbagliato `legacyDaRiattivare`
  // resterebbe vuoto (gli id non esistono qui) ma le voci v4 verrebbero
  // spente lo stesso, perché quelle si calcolano per CODICE: si spegnerebbe
  // il piano dei conti del database giusto.
  const bersaglioAttuale = descriviDatabase()
  if (snap.bersaglio !== bersaglioAttuale) {
    if (!forza) {
      console.error('❌ ROLLBACK BLOCCATO — lo snapshot viene da un altro bersaglio:')
      console.error('')
      console.error(`   snapshot : ${snap.bersaglio}`)
      console.error(`   corrente : ${bersaglioAttuale}`)
      console.error('')
      console.error('   Applicarlo qui spegnerebbe le 155 voci di QUESTO database (si calcolano')
      console.error('   per codice, non per id) e toglierebbe la system_key CORRISPETTIVI.')
      console.error('   Se è davvero quello che si vuole, rilanciare con --forza.')
      process.exitCode = 1
      return
    }
    console.log(`⚠️  Bersaglio diverso da quello dello snapshot (${snap.bersaglio}): proseguo per --forza.`)
    console.log('')
  }

  const { prisma, chiudi } = creaClient()
  try {
    // Seconda prova, questa volta sui dati e non sulle stringhe: due ambienti
    // possono presentarsi con la stessa identità, e un JSON si modifica.
    // `--forza` non la salta: serve a dire "so che l'identità è diversa", non
    // "applica uno snapshot che non c'entra niente con questo database".
    const riconosciuti = await contiLegacyRiconosciuti(prisma, snap)
    if (snap.contiLegacy.length > 0 && riconosciuti === 0) {
      console.error('❌ ROLLBACK BLOCCATO — lo snapshot non appartiene a questo database:')
      console.error('')
      console.error(
        `   nessuno dei ${snap.contiLegacy.length} conti legacy dello snapshot esiste qui (0 su ${snap.contiLegacy.length}).`
      )
      console.error('   Gli id sono generati alla creazione del conto: se non ne torna nemmeno')
      console.error('   uno, la fotografia è di un altro database. Non proseguo nemmeno con --forza.')
      process.exitCode = 1
      return
    }
    if (snap.contiLegacy.length > 0) {
      console.log(
        `✅ Provenienza confermata: ${riconosciuti} conti legacy dello snapshot su ${snap.contiLegacy.length} esistono in questo database`
      )
      console.log('')
    }

    const piano = await calcolaPiano(prisma, snap)

    if (piano.vociConRiferimenti.length > 0) {
      stampaBlocco(piano.vociConRiferimenti)
      process.exitCode = 1
      return
    }

    console.log('PIANO D\'AZIONE')
    console.log('')
    console.log(`  1. conti legacy da riattivare: ${piano.legacyDaRiattivare.length}`)
    for (const c of piano.legacyDaRiattivare) console.log(`       · ${c.code.padEnd(10)} ${c.name}`)
    console.log(`  2. righe di budget da ripristinare: ${piano.budgetLinesDaRipristinare}`)
    console.log(`     mappature budget da ripristinare: ${piano.mappingDaRipristinare}`)
    console.log(
      `  3. system_key CORRISPETTIVI: ${piano.corrispettiviDaTogliere ? `da togliere dalla voce ${VOCE_CORRISPETTIVI}` : 'da lasciare com\'è'}`
    )
    console.log(`  4. voci v4 da disattivare (mai cancellare): ${piano.vociDaDisattivare.length}`)
    console.log(
      `  5. voci v4 preesistenti da riportare all'anagrafica di partenza: ${piano.vociPreesistentiDaRipristinare.length}`
    )
    for (const v of piano.vociPreesistentiDaRipristinare.slice(0, 10)) {
      console.log(`       · ${v.code.padEnd(10)} campi: ${v.campi.join(', ')}`)
    }
    if (piano.vociPreesistentiDaRipristinare.length > 10) {
      console.log(`       · … e altre ${piano.vociPreesistentiDaRipristinare.length - 10}`)
    }
    console.log('')

    if (!esegui) {
      console.log('DRY-RUN: nulla è stato scritto.')
      console.log('')
      console.log('Per eseguire davvero:')
      console.log(
        `  DATABASE_URL="…" npx tsx scripts/piano-v4/04-rollback.ts --snapshot ${percorso} --execute${forza ? ' --forza' : ''}`
      )
      return
    }

    await confermaScrittura()

    const fatto = await prisma.$transaction((tx) => applica(comeDb(tx), snap), {
      timeout: 180_000,
      maxWait: 30_000,
      isolationLevel: 'Serializable',
    })

    console.log('✅ ROLLBACK COMPLETATO')
    console.log('')
    console.log(`   conti legacy riattivati    : ${fatto.legacyDaRiattivare.length}`)
    console.log(`   righe di budget ripristinate: ${fatto.budgetLinesDaRipristinare}`)
    console.log(`   mappature budget ripristinate: ${fatto.mappingDaRipristinare}`)
    console.log(`   voci v4 disattivate        : ${fatto.vociDaDisattivare.length}`)
    console.log(`   voci v4 riportate all'anagrafica di partenza: ${fatto.vociPreesistentiDaRipristinare.length}`)
    console.log('')
    console.log('Le voci v4 restano in tabella disattivate: nessun conto è stato cancellato.')
  } catch (e) {
    if (e instanceof RollbackBloccato) {
      stampaBlocco(e.voci)
      process.exitCode = 1
      return
    }
    throw e
  } finally {
    await chiudi()
  }
}

main().catch((e) => {
  console.error('❌ Errore durante il rollback (transazione annullata, database invariato):', e)
  process.exitCode = 1
})
