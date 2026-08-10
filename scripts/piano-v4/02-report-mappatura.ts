/**
 * Script 02 — Report di mappatura dei conti legacy verso il piano v4.
 *
 * SOLA LETTURA. Non scrive nulla nel database: produce la tabella che il
 * committente deve approvare PRIMA che si possa eseguire `03-migrate.ts`.
 *
 * Per ogni conto non-v4 (quelli con `mastro_code` NULL: i conti del vecchio
 * piano e i patrimoniali) conta i riferimenti su tutte le 14 chiavi esterne
 * che puntano ad `accounts` — elencate una volta sola in `_comune.ts` — e
 * propone l'azione: disattivare, conservare, oppure fermarsi perché il conto
 * è realmente usato da scritture contabili.
 *
 * La colonna "voce v4 equivalente" è un SUGGERIMENTO automatico ricavato
 * dalla somiglianza dei nomi: serve a dare un punto di partenza alla
 * discussione, non è una decisione. Le corrispondenze decise a mano si
 * scrivono in EQUIVALENZE_MANUALI qui sotto e hanno sempre la precedenza.
 *
 * Uso:
 *   npx tsx scripts/piano-v4/02-report-mappatura.ts
 *   npx tsx scripts/piano-v4/02-report-mappatura.ts --out docs/migrazione-piano-conti-v4.md
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { PIANO_CONTI_WEISS_V4 } from '../../src/lib/accounts/piano-conti-weiss-v4'

import {
  argomento,
  bersaglioRemoto,
  contaRiferimenti,
  creaClient,
  descriviDatabasePerDocumento,
  formattaDettaglio,
  RIFERIMENTI,
  stampaIntestazione,
  validaArgomenti,
  type RiepilogoRiferimenti,
} from './_comune'

validaArgomenti([], ['out'])

/**
 * Corrispondenze decise a mano fra vecchio codice e voce del piano v4.
 * Formato: { '<code legacy>': '<code v4>' }.
 *
 * Compilate il 10 agosto 2026 sui venti conti veri della produzione.
 *
 * **La corrispondenza è quasi sempre uno-a-molti**, perché il v4 disaggrega
 * dove il piano vecchio teneva un conto solo: «Acquisti bevande» si apre in
 * nove voci fra alcolici (20.1.x) e analcolici (20.2.x), «Utenze» in energia,
 * gas, acqua e rifiuti. Qui si annota la voce **rappresentativa**, quella dove
 * finirà la maggior parte di quel costo: serve a sapere fra un anno dove è
 * andato a finire un conto, non a spostare importi — la migrazione disattiva i
 * conti legacy, non li rimappa.
 *
 * Tre conti non compaiono di proposito: `500` Costi, `520` Costi per servizi e
 * `530` Costi amministrativi erano **mastri**, e nel v4 i mastri non sono conti
 * imputabili (vivono denormalizzati su `mastroCode`). Non hanno un equivalente
 * e restano «da decidere» nel report, che è la risposta giusta.
 */
const EQUIVALENZE_MANUALI: Record<string, string> = {
  // ─── Ricavi ───
  // Il v4 non separa bar e caffetteria nei ricavi: un corrispettivo è un
  // corrispettivo, e la distinzione utile (evento / non evento) sta altrove.
  '400': '10.01', // Ricavi → Corrispettivi
  '400.01': '10.01', // Ricavi da vendite bar
  '400.02': '10.01', // Ricavi da vendite caffetteria
  // «Eventi» senza altra qualificazione sta sugli eventi serali; i compleanni e
  // i privati hanno una voce loro (11.02), scelta in chiusura per postazione.
  '400.03': '11.01', // Ricavi da eventi → Ricavi eventi serali

  // ─── Acquisti ───
  '500.01': '20.4.01', // Acquisti materie prime → Beni alimentari e gastronomia (uno-a-molti: 20.4.x)
  '500.02': '20.2.01', // Acquisti bevande → Bibite e soft drink (uno-a-molti: 20.1.x alcolici, 20.2.x analcolici)

  // ─── Personale ───
  '510': '28.4.05', // Costi personale → Altri costi per personale dipendente
  '510.01': '28.1.01', // Stipendi dipendenti → Retribuzioni personale dipendente serale (il v4 separa per turno e mansione)
  '510.02': '28.1.02', // Compensi extra → Retribuzioni personale extra e a chiamata

  // ─── Servizi ───
  '520.01': '23.03', // Pulizie → Servizi di pulizia esterni (se svolte da personale interno: 28.1.05)
  '520.02': '22.01', // Utenze → Energia elettrica (uno-a-molti: 22.01 energia, 22.02 gas, 22.03 acqua, 22.05 rifiuti)
  '520.03': '23.01', // Manutenzioni → Manutenzioni e riparazioni

  // ─── Amministrativi ───
  '530.01': '32.2.01', // Commissioni bancarie → Spese di tenuta conto e servizi bancari
  '530.02': '32.3.01', // Commissioni POS → Commissioni Pagobancomat
}

// ════════════════════════════════════════════════════════════════════════
//  SUGGERIMENTO DI EQUIVALENZA (euristico, da confermare a mano)
// ════════════════════════════════════════════════════════════════════════

const PAROLE_VUOTE = new Set([
  'di', 'del', 'della', 'dei', 'delle', 'dello', 'da', 'dal', 'dalla', 'e', 'ed',
  'a', 'al', 'alla', 'ai', 'alle', 'il', 'lo', 'la', 'i', 'gli', 'le', 'in',
  'con', 'su', 'sui', 'per', 'un', 'una', 'uno', 'o', 'altri', 'altre', 'altro',
  'vari', 'varie', 'generici', 'generico',
])

function parole(testo: string): Set<string> {
  return new Set(
    testo
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length > 2 && !PAROLE_VUOTE.has(p))
  )
}

/** Jaccard sui token del nome, ristretto alle voci dello stesso tipo. */
function suggerisciVoceV4(nome: string, tipo: string): { code: string; nome: string; punteggio: number } | null {
  const a = parole(nome)
  if (a.size === 0) return null

  let migliore: { code: string; nome: string; punteggio: number } | null = null
  for (const voce of PIANO_CONTI_WEISS_V4) {
    if (voce.tipo !== tipo) continue
    const b = parole(voce.nome)
    let comuni = 0
    for (const p of a) if (b.has(p)) comuni++
    if (comuni === 0) continue
    const punteggio = comuni / (a.size + b.size - comuni)
    if (!migliore || punteggio > migliore.punteggio) {
      migliore = { code: voce.code, nome: voce.nome, punteggio }
    }
  }

  return migliore && migliore.punteggio >= 0.34 ? migliore : null
}

// ════════════════════════════════════════════════════════════════════════

type Azione = 'disattivare' | 'conservare' | 'bloccante'

interface Riga {
  code: string
  nome: string
  tipo: string
  isActive: boolean
  systemKey: string | null
  riferimenti: RiepilogoRiferimenti
  azione: Azione
  azioneTesto: string
  equivalente: string
  note: string
}

function pipe(s: string): string {
  return s.replace(/\|/g, '\\|')
}

async function main() {
  stampaIntestazione('Piano dei conti v4 — script 02: report di mappatura', 'SOLA LETTURA')

  const { prisma, chiudi } = creaClient()
  try {
    const conti = await prisma.account.findMany({
      where: { mastroCode: null },
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
      select: { id: true, code: true, name: true, type: true, isActive: true, systemKey: true },
    })

    const vociV4 = await prisma.account.count({ where: { mastroCode: { not: null } } })

    if (conti.length === 0) {
      console.log('Nessun conto non-v4 nel database: niente da mappare.')
      console.log(`(voci del piano v4 già presenti: ${vociV4})`)
      return
    }

    const riferimenti = await contaRiferimenti(
      prisma,
      conti.map((c) => c.id)
    )

    const righe: Riga[] = conti.map((c) => {
      const rif = riferimenti.get(c.id)!
      const patrimoniale = c.type === 'ATTIVO' || c.type === 'PASSIVO'

      let azione: Azione
      let azioneTesto: string
      if (patrimoniale) {
        azione = 'conservare'
        azioneTesto = c.systemKey
          ? `conservare (conto di sistema ${c.systemKey})`
          : 'conservare (patrimoniale, fuori dal perimetro v4)'
      } else if (rif.duri > 0) {
        azione = 'bloccante'
        azioneTesto = 'BLOCCANTE — rimappare le scritture prima di disattivare'
      } else if (c.systemKey) {
        azione = 'bloccante'
        azioneTesto = `BLOCCANTE — porta la systemKey ${c.systemKey}: spostarla prima`
      } else {
        azione = 'disattivare'
        azioneTesto = c.isActive ? 'disattivare' : 'già disattivo, nessuna azione'
      }

      const manuale = EQUIVALENZE_MANUALI[c.code]
      let equivalente: string
      if (manuale) {
        const voce = PIANO_CONTI_WEISS_V4.find((v) => v.code === manuale)
        equivalente = voce ? `${voce.code} — ${voce.nome}` : `${manuale} (⚠️ code non nel piano v4)`
      } else if (patrimoniale) {
        equivalente = '— (il piano v4 copre solo il conto economico)'
      } else {
        const s = suggerisciVoceV4(c.name, c.type)
        equivalente = s ? `${s.code} — ${s.nome} *(suggerito)*` : '— (da decidere)'
      }

      const note: string[] = []
      if (!c.isActive) note.push('già disattivo')
      const bl = rif.dettaglio['budget_lines.account_id']
      if (bl) note.push(bl === 1 ? '1 riga di budget: la migrazione la cancella' : `${bl} righe di budget: la migrazione le cancella`)
      const abm = rif.dettaglio['account_budget_mappings.account_id']
      if (abm) note.push('mappatura budget: la migrazione la cancella')
      const morbidiResidui = Object.entries(rif.dettaglio).filter(
        ([k]) => k !== 'budget_lines.account_id' && k !== 'account_budget_mappings.account_id'
      )
      const morbidiDaRivedere = morbidiResidui.filter(([k]) => {
        const r = RIFERIMENTI.find((x) => x.chiave === k)
        return r && !r.duro
      })
      if (morbidiDaRivedere.length > 0) {
        note.push(
          `resta puntato da ${morbidiDaRivedere.map(([k, v]) => `${k} (${v})`).join(', ')}: rivedere a mano`
        )
      }
      const duri = Object.entries(rif.dettaglio).filter(([k]) => {
        const r = RIFERIMENTI.find((x) => x.chiave === k)
        return r && r.duro
      })
      if (duri.length > 0) {
        note.push(`riferimenti contabili: ${duri.map(([k, v]) => `${k} (${v})`).join(', ')}`)
      }

      return {
        code: c.code,
        nome: c.name,
        tipo: c.type,
        isActive: c.isActive,
        systemKey: c.systemKey,
        riferimenti: rif,
        azione,
        azioneTesto,
        equivalente,
        note: note.join('; ') || '—',
      }
    })

    // ==================== DOCUMENTO ====================
    const out: string[] = []
    const daDisattivare = righe.filter((r) => r.azione === 'disattivare')
    const bloccanti = righe.filter((r) => r.azione === 'bloccante')
    const conservati = righe.filter((r) => r.azione === 'conservare')

    out.push('# Migrazione al piano dei conti WEISS v4 — tabella di mappatura')
    out.push('')
    out.push(`Generato da \`scripts/piano-v4/02-report-mappatura.ts\` il ${new Date().toISOString()}.`)
    out.push('')
    if (bersaglioRemoto()) {
      out.push(
        '> I conteggi qui sotto sono la fotografia del database indicato, presa nel momento indicato. Se fra questa lettura e l\'esecuzione della migrazione qualcuno registra qualcosa, i numeri cambiano: le guardie dello script 03 ricontano comunque tutto prima di scrivere.'
      )
    } else {
      out.push(
        '> ⚠️ **Documento generato su un database LOCALE di prova, non sulla produzione.** Codici, nomi e conteggi dei conti qui sotto sono quelli di quel database: servono a mostrare la forma del report e a provare il ciclo migrazione/rollback, non sono la fotografia della produzione. La tabella definitiva va rigenerata puntando `DATABASE_URL` alla produzione — lo script è di sola lettura — al momento dello STOP che precede l\'esecuzione.'
      )
    }
    out.push('')
    // Mai le coordinate reali di un bersaglio remoto: questo file è tracciato.
    out.push(`- Database letto: \`${descriviDatabasePerDocumento()}\``)
    out.push(`- Conti non-v4 esaminati: **${righe.length}**`)
    out.push(`- Voci del piano v4 già presenti: **${vociV4}** (attese 155 dopo la migrazione)`)
    out.push(`- Da disattivare: **${daDisattivare.length}** · da conservare: **${conservati.length}** · bloccanti: **${bloccanti.length}**`)
    out.push('')
    out.push('## Tabella')
    out.push('')
    out.push(
      '| Code | Nome | Tipo | Rif. duri | Rif. morbidi | Dettaglio riferimenti | Azione proposta | Voce v4 equivalente | Note |'
    )
    out.push('| --- | --- | --- | ---: | ---: | --- | --- | --- | --- |')
    for (const r of righe) {
      out.push(
        `| \`${r.code}\` | ${pipe(r.nome)} | ${r.tipo} | ${r.riferimenti.duri} | ${r.riferimenti.morbidi} | ${pipe(formattaDettaglio(r.riferimenti))} | ${pipe(r.azioneTesto)} | ${pipe(r.equivalente)} | ${pipe(r.note)} |`
      )
    }
    out.push('')
    out.push('## Come leggere le colonne')
    out.push('')
    out.push(
      '**Riferimenti duri** — righe che imputano davvero il conto: disattivarlo falserebbe scritture esistenti. La migrazione si rifiuta di partire se ne trova anche uno solo. Sono:'
    )
    for (const r of RIFERIMENTI.filter((x) => x.duro)) out.push(`- \`${r.chiave}\``)
    out.push('')
    out.push(
      '**Riferimenti morbidi** — preferenze e configurazioni: sopravvivono alla disattivazione del conto (che resta in tabella, solo non selezionabile) ma vanno rivisti a mano, altrimenti puntano a un conto inattivo. Sono:'
    )
    for (const r of RIFERIMENTI.filter((x) => !x.duro)) out.push(`- \`${r.chiave}\``)
    out.push('')
    out.push(
      '**Voce v4 equivalente** — dove marcata *(suggerito)* è un accostamento automatico per somiglianza dei nomi, da confermare. Le corrispondenze approvate si scrivono in `EQUIVALENZE_MANUALI` dentro lo script 02 e da lì finiscono in questa tabella senza il marcatore.'
    )
    out.push('')
    out.push('## Cosa fa poi la migrazione')
    out.push('')
    out.push('`scripts/piano-v4/03-migrate.ts`, in una sola transazione:')
    out.push('')
    out.push('1. inserisce (o aggiorna l\'anagrafica del)le 155 voci del piano v4;')
    out.push('2. assegna `system_key = CORRISPETTIVI` alla voce `10.01`, così le chiusure di cassa nascono già imputate;')
    out.push('3. porta a `is_active = false` i conti legacy RICAVO/COSTO elencati sopra come «disattivare» — non li cancella;')
    out.push('4. cancella le righe di budget e le mappature budget dei conti legacy (disattivabile con `--mantieni-budget`);')
    out.push('5. scrive un audit log riepilogativo.')
    out.push('')
    out.push(
      'Prima di scrivere ricontrolla tutte le premesse: se anche una sola non regge, la transazione non parte e nulla viene toccato.'
    )
    out.push('')
    out.push('## I comandi, in ordine')
    out.push('')
    out.push(
      '> ⚠️ **`DATABASE_URL` va indicata sempre, esplicitamente, davanti a ogni comando.** Gli script caricano il `.env` del progetto quando la variabile non c\'è, e quel `.env` punta alla produzione: lanciare un comando "nudo" dalla radice significa operare sulla produzione senza averlo deciso. Prima di scrivere su un bersaglio non locale lo script chiede di ribattere a mano la sua identità completa — nella forma `utente@nomedb su host:porta`, che lo script stampa a schermo subito sopra la domanda — ma è una rete di sicurezza, non il modo di lavorare.'
    )
    out.push('')
    out.push(
      '> 🔐 **La stringa di connessione non va battuta sulla riga di comando.** Contiene la password di produzione, e tutto ciò che si scrive al prompt finisce in `~/.zsh_history` in chiaro, dove resta. Si legge senza eco, oppure da un file con i permessi stretti.'
    )
    out.push('')
    out.push('```bash')
    out.push('# il bersaglio, una volta sola, senza lasciarne traccia nella history')
    out.push('read -rs "DB_BERSAGLIO?URL di connessione: " && export DB_BERSAGLIO   # zsh')
    out.push('# read -rsp "URL di connessione: " DB_BERSAGLIO && export DB_BERSAGLIO  # bash')
    out.push('')
    out.push('# in alternativa, da un file leggibile solo dal proprietario:')
    out.push('#   umask 077 && $EDITOR ~/.weiss-migrazione   (una riga: postgresql://…)')
    out.push('#   export DB_BERSAGLIO="$(cat ~/.weiss-migrazione)"')
    out.push('')
    out.push('# 1. rigenera questa tabella contro il database che si vuole migrare (sola lettura)')
    out.push('DATABASE_URL="$DB_BERSAGLIO" npx tsx scripts/piano-v4/02-report-mappatura.ts \\')
    out.push('  --out docs/migrazione-piano-conti-v4.md')
    out.push('')
    out.push('# 2. STOP: far approvare la tabella. Poi il dry-run, che salva lo snapshot del rollback')
    out.push('DATABASE_URL="$DB_BERSAGLIO" npx tsx scripts/piano-v4/03-migrate.ts')
    out.push('')
    out.push('# 3. esecuzione vera: se il bersaglio è remoto chiede di ribattere la sua')
    out.push('#    identità completa, "utente@nomedb su host:porta", stampata sopra la domanda')
    out.push('DATABASE_URL="$DB_BERSAGLIO" npx tsx scripts/piano-v4/03-migrate.ts --execute')
    out.push('')
    out.push('# 4. verifica')
    out.push('DATABASE_URL="$DB_BERSAGLIO" npx tsx scripts/piano-v4/verifica.ts')
    out.push('')
    out.push('# 5. solo se serve tornare indietro (lo snapshot lo stampa lo script 03)')
    out.push('DATABASE_URL="$DB_BERSAGLIO" npx tsx scripts/piano-v4/04-rollback.ts \\')
    out.push('  --snapshot scripts/piano-v4/snapshots/<file>.json')
    out.push('DATABASE_URL="$DB_BERSAGLIO" npx tsx scripts/piano-v4/04-rollback.ts \\')
    out.push('  --snapshot scripts/piano-v4/snapshots/<file>.json --execute')
    out.push('```')
    out.push('')
    out.push(
      'Anche esportata, la URL resta nell\'ambiente del processo e chi ha lo stesso utente può leggerla con `ps eww`. È un passo avanti rispetto alla history, che è permanente, non una segregazione: chiusa la sessione, `unset DB_BERSAGLIO`.'
    )
    out.push('')
    out.push(
      'Gli snapshot restano fuori dal repository (sono dati veri) ma vanno conservati: senza lo snapshot il rollback non sa a quale stato tornare. Il rollback rifiuta uno snapshot preso da un bersaglio diverso da quello corrente (`--forza` per i casi legittimi, per esempio la stessa URL scritta in due modi) e rifiuta comunque, senza possibilità di forzatura, uno snapshot i cui conti non esistono in questo database.'
    )
    out.push('')
    out.push('## Da eseguire a gestionale fermo')
    out.push('')
    out.push(
      'La migrazione gira in una transazione `SERIALIZABLE`, quindi una scrittura concorrente non può infilarsi fra il controllo delle premesse e la disattivazione dei conti: al massimo la transazione viene annullata dal database con un errore di serializzazione, e in quel caso si rilancia. Resta comunque preferibile eseguirla con nessuno collegato: se il pooler in uso non accettasse il livello `SERIALIZABLE`, la finestra si riaprirebbe, e a gestionale fermo la questione non si pone.'
    )
    out.push('')

    const documento = out.join('\n')
    console.log(documento)

    const percorso = argomento('out')
    if (percorso) {
      const assoluto = resolve(process.cwd(), percorso)
      mkdirSync(dirname(assoluto), { recursive: true })
      writeFileSync(assoluto, documento + '\n', 'utf8')
      console.log(`\n📄 Scritto in ${assoluto}`)
    }

    if (bloccanti.length > 0) {
      console.log('')
      console.log(`⚠️  ${bloccanti.length} conti bloccano la migrazione: vedi la colonna "Azione proposta".`)
    }
  } finally {
    await chiudi()
  }
}

main().catch((e) => {
  console.error('❌ Errore durante il report di mappatura:', e)
  process.exitCode = 1
})
