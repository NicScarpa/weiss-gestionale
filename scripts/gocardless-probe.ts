/**
 * Sonda GoCardless Bank Account Data — Fase 0 (lo spike) della spec
 * `docs/superpowers/specs/2026-08-08-open-banking-gocardless-design.md`.
 *
 * Cosa fa: parla con https://bankaccountdata.gocardless.com e col disco.
 * Cosa NON fa: non apre il database, non importa `src/lib/prisma`, non crea
 * migrazioni, non tocca route né UI. L'unica eccezione è la domanda 6 del
 * referto (copertura delle regole di categorizzazione), che ha bisogno di
 * `categorization_rules` e resta dietro un flag esplicito, in sola lettura.
 *
 * Uso (Node 22 obbligatorio, vedi CLAUDE.md):
 *
 *   nvm use 22 && npx tsx scripts/gocardless-probe.ts --step=institutions
 *   nvm use 22 && npx tsx scripts/gocardless-probe.ts --step=consent
 *   … qui l'SCA in banca, nel browser, a mano …
 *   nvm use 22 && npx tsx scripts/gocardless-probe.ts --step=accounts
 *   nvm use 22 && npx tsx scripts/gocardless-probe.ts --step=fetch
 *   nvm use 22 && npx tsx scripts/gocardless-probe.ts --step=report
 *
 * Perché a passi separati: fra la creazione della requisition e la lettura dei
 * conti c'è un'azione umana nel browser, e i passi precedenti non vanno
 * rifatti. Lo stato (token, istituto scelto, id della requisition, conti
 * collegati) vive in `scripts/gocardless/snapshots/_stato.json`.
 *
 * Perché ogni payload finisce su disco PRIMA di essere letto: il rate limit
 * imposto dalla banca è di 4 chiamate al giorno per conto e per endpoint.
 * Una chiamata rifatta per rileggere un dato che avevamo già costa un giorno
 * di attesa. Ogni analisi successiva lavora sui file, mai sull'API.
 *
 * Segreti: `GOCARDLESS_SECRET_ID` e `GOCARDLESS_SECRET_KEY` si leggono da
 * `.env` e non vengono mai stampati né salvati. Il corpo della chiamata al
 * token viene oscurato prima di finire nello snapshot, e la risposta (che
 * contiene access e refresh token) viene salvata in forma ridotta: i token
 * veri stanno solo in `_stato.json`, creato con permessi 0600.
 *
 * La cartella degli snapshot è in `.gitignore`: contiene IBAN e nomi di
 * controparti reali. Va conservata fuori dal repository, ma va conservata.
 */

import 'dotenv/config'

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { descriviStato } from '../src/lib/gocardless/stati'

// ════════════════════════════════════════════════════════════════════════
//  COSTANTI E PERCORSI
// ════════════════════════════════════════════════════════════════════════

const BASE = 'https://bankaccountdata.gocardless.com/api/v2'

const RADICE = process.cwd()
const DIR_SNAPSHOT = join(RADICE, 'scripts', 'gocardless', 'snapshots')
const FILE_STATO = join(DIR_SNAPSHOT, '_stato.json')
const DIR_DOCS = join(RADICE, 'docs')
const DIR_FIXTURE = join(RADICE, 'src', 'lib', 'gocardless', '__tests__', 'fixtures')

/** Termini con cui si cerca Banca della Marca fra le istituzioni italiane. */
const TERMINI_DEFAULT = ['marca', 'iccrea', 'bcc', 'credito cooperativo', 'cassa rurale']

/** Gli endpoint per conto, quelli soggetti al limite di 4 al giorno. */
const ENDPOINT_CONTO = ['details', 'balances', 'transactions'] as const
type EndpointConto = (typeof ENDPOINT_CONTO)[number]

const PASSI = ['institutions', 'consent', 'accounts', 'fetch', 'report'] as const
type Passo = (typeof PASSI)[number]

// ════════════════════════════════════════════════════════════════════════
//  ARGOMENTI DELLA RIGA DI COMANDO
// ════════════════════════════════════════════════════════════════════════

const FLAG_NOTI = ['tutti', 'forza', 'nuovo-consenso', 'nuovo-token', 'fixtures', 'regole-da-db', 'purga', 'aiuto']
const OPZIONI_NOTE = ['step', 'istituto', 'cerca', 'redirect', 'requisition', 'conto', 'da', 'a', 'regole', 'escludi', 'includi']

function argomento(nome: string): string | undefined {
  const conUguale = process.argv.find((a) => a.startsWith(`--${nome}=`))
  if (conUguale) return conUguale.slice(nome.length + 3)
  const i = process.argv.indexOf(`--${nome}`)
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) {
    return process.argv[i + 1]
  }
  return undefined
}

function flag(nome: string): boolean {
  return process.argv.includes(`--${nome}`)
}

/**
 * Rifiuta gli argomenti che non conosce.
 *
 * `--step=fetc` non deve poter scivolare in un default silenzioso, e `--forz`
 * non deve poter passare per `--forza`: sono proprio i due refusi che
 * costerebbero una chiamata sprecata, cioè un giorno.
 */
function validaArgomenti() {
  const sconosciuti: string[] = []
  const argomenti = process.argv.slice(2)
  for (let i = 0; i < argomenti.length; i++) {
    const token = argomenti[i]
    if (!token.startsWith('--')) {
      sconosciuti.push(token)
      continue
    }
    const nome = token.slice(2).split('=')[0]
    if (OPZIONI_NOTE.includes(nome)) {
      if (!token.includes('=')) i++
      continue
    }
    if (FLAG_NOTI.includes(nome)) continue
    sconosciuti.push(token)
  }
  if (sconosciuti.length > 0) {
    console.error(`❌ Argomenti non riconosciuti: ${sconosciuti.join(' ')}`)
    console.error('')
    stampaAiuto()
    process.exit(1)
  }
}

function stampaAiuto() {
  console.log(`Sonda GoCardless Bank Account Data — Fase 0 dello spike open banking.

  --step=institutions   cerca l'istituto fra le banche italiane
  --step=consent        crea agreement + requisition e stampa il link di consenso
  --step=accounts       legge lo stato della requisition e i conti collegati
  --step=fetch          scarica details/balances/transactions di ogni conto
  --step=report         produce docs/gocardless-referto-<data>.md dai file salvati

Opzioni:
  --cerca=<testo>       termine di ricerca per l'istituto (default: ${TERMINI_DEFAULT.join(', ')})
  --tutti               con institutions: elenca tutte le banche, non solo le candidate
  --istituto=<id>       institution_id scelto a mano per il consenso
  --redirect=<url>      URL di ritorno della requisition (default: APP_URL o localhost)
  --nuovo-consenso      ignora agreement e requisition già in stato e li ricrea
  --nuovo-token         ignora il token in cache e ne chiede uno nuovo
  --requisition=<id>    requisition da interrogare, se diversa da quella in stato
  --escludi=<id|1234>   esclude un conto da fetch e report, per id o per le
                        ultime 4 cifre dell'IBAN (es. un conto personale)
  --includi=<id|1234>   annulla l'esclusione
  --purga               con --escludi: cancella anche i dati gia' scaricati
                        di quel conto
  --conto=<id>          con fetch: scarica un conto solo
  --da=YYYY-MM-DD       con fetch: date_from per le transazioni
  --a=YYYY-MM-DD        con fetch: date_to per le transazioni
  --forza               con fetch: riscarica anche ciò che è già stato preso oggi
                        (⚠️  consuma il limite di 4 chiamate/giorno per conto)
  --regole-da-db        con report: legge categorization_rules in SOLA LETTURA
  --regole=<file.json>  con report: legge le regole da un file invece che dal DB
  --fixtures            con report: scrive anche le fixture anonimizzate in
                        src/lib/gocardless/__tests__/fixtures/
  --aiuto               questo testo
`)
}

// ════════════════════════════════════════════════════════════════════════
//  DISCO: SNAPSHOT E STATO
// ════════════════════════════════════════════════════════════════════════

interface Stato {
  token?: {
    access: string
    accessScade: string
    refresh?: string
    refreshScade?: string
  }
  istituto?: {
    id: string
    nome: string
    transactionTotalDays?: number
    maxAccessValidForDays?: number
  }
  agreementId?: string
  agreementCreato?: string
  requisition?: { id: string; link: string; creata: string; redirect: string }
  conti?: string[]
  /**
   * Conti che il consenso copre ma che non vanno letti né analizzati.
   *
   * La selezione in banca è per consenso, non per conto: se all'SCA si
   * condividono tre conti, l'API li espone tutti e tre. Ma un conto personale
   * dell'amministratore, che sta nello stesso home banking dell'azienda, non
   * deve entrare nel gestionale in nessuna forma — e "non mostrarlo" non
   * basta: non va proprio scaricato. Questa lista è il filtro, e vale prima
   * della chiamata, non dopo.
   */
  esclusi?: string[]
}

function assicuraCartelle() {
  // 0700: la cartella contiene IBAN, nomi di controparti e i token di accesso.
  mkdirSync(DIR_SNAPSHOT, { recursive: true, mode: 0o700 })
}

function leggiStato(): Stato {
  if (!existsSync(FILE_STATO)) return {}
  try {
    return JSON.parse(readFileSync(FILE_STATO, 'utf8')) as Stato
  } catch {
    console.error(`⚠️  ${FILE_STATO} illeggibile: riparto da stato vuoto.`)
    return {}
  }
}

function salvaStato(stato: Stato) {
  assicuraCartelle()
  writeFileSync(FILE_STATO, JSON.stringify(stato, null, 2), { mode: 0o600 })
}

/** `2026-08-12T10-15-33-421Z`: ordinabile per nome, quindi cronologico. */
function marcaTemporale(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function nomeSnapshot(etichetta: string, stato: number): string {
  return `${marcaTemporale()}__${etichetta}__${stato}.json`
}

/** Elenco dei file di snapshot per un'etichetta, dal più vecchio al più recente. */
function snapshotPerEtichetta(etichetta: string, soloOk = true): string[] {
  if (!existsSync(DIR_SNAPSHOT)) return []
  return readdirSync(DIR_SNAPSHOT)
    .filter((f) => f.endsWith('.json') && f.includes(`__${etichetta}__`))
    .filter((f) => !soloOk || /__2\d\d\.json$/.test(f))
    .sort()
    .map((f) => join(DIR_SNAPSHOT, f))
}

function ultimoSnapshot(etichetta: string): Busta | null {
  const file = snapshotPerEtichetta(etichetta).pop()
  if (!file) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Busta
  } catch {
    console.error(`⚠️  Snapshot illeggibile, lo salto: ${file}`)
    return null
  }
}

/**
 * true se per questa etichetta esiste già una risposta buona di oggi (UTC).
 * È la guardia contro le chiamate sprecate: il limite della banca è di 4 al
 * giorno per conto e per endpoint, e una rilettura per distrazione costa un
 * giorno di attesa.
 */
function giaPresoOggi(etichetta: string): string | null {
  const oggi = new Date().toISOString().slice(0, 10)
  const file = snapshotPerEtichetta(etichetta).filter((f) => f.includes(`/${oggi}T`)).pop()
  return file ?? null
}

// ════════════════════════════════════════════════════════════════════════
//  IL CLIENT HTTP
// ════════════════════════════════════════════════════════════════════════

interface Busta {
  richiesta: { metodo: string; url: string; corpo?: unknown }
  risposta: {
    stato: number
    quando: string
    headers: Record<string, string>
    corpo?: unknown
    /** Valorizzato solo quando la risposta non era JSON. */
    grezzo?: string
  }
}

interface Esito {
  ok: boolean
  stato: number
  corpo: any
  file: string
}

/**
 * Ogni chiamata all'API passa da qui, e da nessun'altra parte: è l'unico modo
 * di garantire che il payload finisca su disco PRIMA che qualcuno lo legga.
 *
 * `redigiRisposta` serve al solo endpoint del token, la cui risposta contiene
 * credenziali che non devono depositarsi negli snapshot.
 */
async function chiama(opzioni: {
  metodo: 'GET' | 'POST'
  percorso: string
  corpo?: unknown
  /** Corpo da salvare al posto di quello vero (per non depositare segreti). */
  corpoDaSalvare?: unknown
  token?: string
  etichetta: string
  redigiRisposta?: (corpo: any) => unknown
}): Promise<Esito> {
  assicuraCartelle()

  const url = `${BASE}${opzioni.percorso}`
  const headers: Record<string, string> = { accept: 'application/json' }
  if (opzioni.token) headers.authorization = `Bearer ${opzioni.token}`
  if (opzioni.corpo !== undefined) headers['content-type'] = 'application/json'

  console.log(`→ ${opzioni.metodo} ${opzioni.percorso}`)

  let risposta: Response
  try {
    risposta = await fetch(url, {
      method: opzioni.metodo,
      headers,
      body: opzioni.corpo !== undefined ? JSON.stringify(opzioni.corpo) : undefined,
    })
  } catch (e) {
    // Rete caduta o DNS: nessuna chiamata è stata consumata, ma va detto
    // chiaramente, perché altrimenti sembra un rifiuto dell'API.
    console.error(`❌ Chiamata non partita (rete): ${(e as Error).message}`)
    process.exit(1)
  }

  const testo = await risposta.text()

  let corpo: unknown
  let grezzo: string | undefined
  try {
    corpo = testo.length > 0 ? JSON.parse(testo) : null
  } catch {
    corpo = undefined
    grezzo = testo
  }

  const headersRisposta: Record<string, string> = {}
  risposta.headers.forEach((v, k) => {
    headersRisposta[k] = v
  })

  const busta: Busta = {
    richiesta: {
      metodo: opzioni.metodo,
      url,
      corpo: opzioni.corpoDaSalvare ?? opzioni.corpo,
    },
    risposta: {
      stato: risposta.status,
      quando: new Date().toISOString(),
      headers: headersRisposta,
      corpo: opzioni.redigiRisposta && corpo !== undefined ? opzioni.redigiRisposta(corpo) : corpo,
      grezzo,
    },
  }

  const file = join(DIR_SNAPSHOT, nomeSnapshot(opzioni.etichetta, risposta.status))
  writeFileSync(file, JSON.stringify(busta, null, 2), { mode: 0o600 })
  console.log(`   ${risposta.status} — salvato in ${file.replace(RADICE + '/', '')}`)

  const limiti = Object.entries(headersRisposta).filter(([k]) => /ratelimit/i.test(k))
  if (limiti.length > 0) {
    console.log(`   rate limit: ${limiti.map(([k, v]) => `${k}=${v}`).join('  ')}`)
  }

  if (!risposta.ok) {
    console.error(`   ⚠️  Risposta non riuscita. Corpo:`)
    console.error(indenta(JSON.stringify(corpo ?? grezzo, null, 2) ?? '(vuoto)', '      '))
  }

  return { ok: risposta.ok, stato: risposta.status, corpo, file }
}

function indenta(testo: string, prefisso: string): string {
  return testo
    .split('\n')
    .map((r) => prefisso + r)
    .join('\n')
}

// ════════════════════════════════════════════════════════════════════════
//  TOKEN
// ════════════════════════════════════════════════════════════════════════

/**
 * Restituisce un access token valido, riusando quello in stato finché regge.
 *
 * Il token vale 24 ore e non è soggetto al limite per conto, ma richiederne
 * uno nuovo a ogni passo è comunque rumore inutile su un'API con dei limiti.
 */
async function ottieniToken(stato: Stato): Promise<string> {
  const adesso = Date.now()
  const margine = 5 * 60 * 1000 // non usare un token che scade fra meno di 5'

  if (!flag('nuovo-token') && stato.token && Date.parse(stato.token.accessScade) - margine > adesso) {
    console.log('→ token: riuso quello in cache (ancora valido)')
    return stato.token.access
  }

  if (
    !flag('nuovo-token') &&
    stato.token?.refresh &&
    stato.token.refreshScade &&
    Date.parse(stato.token.refreshScade) - margine > adesso
  ) {
    const esito = await chiama({
      metodo: 'POST',
      percorso: '/token/refresh/',
      corpo: { refresh: stato.token.refresh },
      corpoDaSalvare: { refresh: '(omesso)' },
      etichetta: 'token-refresh',
      redigiRisposta: redigiToken,
    })
    if (esito.ok && esito.corpo?.access) {
      stato.token = {
        access: esito.corpo.access,
        accessScade: fraSecondi(esito.corpo.access_expires),
        refresh: stato.token.refresh,
        refreshScade: stato.token.refreshScade,
      }
      salvaStato(stato)
      return stato.token.access
    }
    console.log('   il refresh non è andato a buon fine: chiedo un token nuovo')
  }

  const secretId = process.env.GOCARDLESS_SECRET_ID
  const secretKey = process.env.GOCARDLESS_SECRET_KEY
  if (!secretId || !secretKey) {
    console.error('❌ GOCARDLESS_SECRET_ID / GOCARDLESS_SECRET_KEY mancanti in .env.')
    console.error('   Vanno lette da lì: lo script non le cerca da nessun altra parte.')
    process.exit(1)
  }

  const esito = await chiama({
    metodo: 'POST',
    percorso: '/token/new/',
    corpo: { secret_id: secretId, secret_key: secretKey },
    corpoDaSalvare: { secret_id: '(omesso)', secret_key: '(omesso)' },
    etichetta: 'token-new',
    redigiRisposta: redigiToken,
  })

  if (!esito.ok || !esito.corpo?.access) {
    console.error('❌ Autenticazione fallita. Le chiavi in .env sono ancora valide?')
    process.exit(1)
  }

  stato.token = {
    access: esito.corpo.access,
    accessScade: fraSecondi(esito.corpo.access_expires),
    refresh: esito.corpo.refresh,
    refreshScade: esito.corpo.refresh_expires ? fraSecondi(esito.corpo.refresh_expires) : undefined,
  }
  salvaStato(stato)
  console.log(`   token ottenuto, scade il ${stato.token.accessScade}`)
  return stato.token.access
}

/** Della risposta del token si conserva la forma, non il contenuto. */
function redigiToken(corpo: any) {
  if (!corpo || typeof corpo !== 'object') return corpo
  const fuori: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(corpo)) {
    fuori[k] =
      typeof v === 'string' && (k === 'access' || k === 'refresh')
        ? `(omesso, ${v.length} caratteri)`
        : v
  }
  return fuori
}

function fraSecondi(secondi: unknown): string {
  const s = typeof secondi === 'number' ? secondi : 3600
  return new Date(Date.now() + s * 1000).toISOString()
}

// ════════════════════════════════════════════════════════════════════════
//  MASCHERAMENTO
// ════════════════════════════════════════════════════════════════════════

/** `IT60X0542811101000000123456` → `IT••••••••••••••••••••3456` */
function mascheraIban(iban: unknown): string {
  if (typeof iban !== 'string' || iban.length < 6) return '(assente)'
  const pulito = iban.replace(/\s+/g, '')
  return `${pulito.slice(0, 2)}${'•'.repeat(Math.max(0, pulito.length - 6))}${pulito.slice(-4)}`
}

/** `MARIO ROSSI SRL` → `M•••• R•••• S••` — resta la forma, sparisce la persona. */
function mascheraNome(nome: unknown): string {
  if (typeof nome !== 'string' || nome.trim() === '') return '(assente)'
  return nome
    .trim()
    .split(/\s+/)
    .map((p) => (p.length <= 1 ? p : p[0] + '•'.repeat(p.length - 1)))
    .join(' ')
}

/**
 * Sigle tutte-maiuscole che non sono nomi di nessuno: vocabolario bancario.
 * Tutto ciò che è maiuscolo e non è qui dentro viene mascherato.
 */
const MAIUSCOLE_INNOCUE = new Set([
  'SEPA', 'SDD', 'CBILL', 'PAGOPA', 'POS', 'IBAN', 'BON', 'ATM', 'CSA', 'ATT',
  'INSTANT', 'CORE', 'DEL', 'ORE', 'EUR', 'IVA', 'CRO', 'TRN', 'RID', 'MAV',
])

/**
 * Ripulisce una causale prima di scriverla in un documento tracciato.
 *
 * La prima versione si appoggiava a `creditorName`/`debtorName` per sapere
 * quali nomi cercare, e con Banca della Marca quei campi non esistono: la
 * lista dei nomi noti restava vuota e la causale passava intatta, stipendi
 * col nome della dipendente compresi. Quindi si ragiona al contrario, per
 * esclusione: **ogni** parola tutta maiuscola di tre lettere o più viene
 * mascherata, tranne le sigle bancarie qui sopra. Si perde in leggibilità e
 * si guadagna che nessun nome può passare per distrazione — e i campioni
 * veri, in chiaro, restano leggibili nella cartella degli snapshot, che il
 * repository non traccia.
 */
function mascheraCausale(testo: string, nomiNoti: Set<string>): string {
  let fuori = testo.replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/gi, (m) => mascheraIban(m))
  for (const nome of nomiNoti) {
    if (nome.length < 4) continue
    fuori = fuori.replace(new RegExp(escapaRegex(nome), 'gi'), mascheraNome(nome))
  }
  fuori = fuori.replace(/[A-ZÀ-ÖØ-Þ]{3,}/g, (m) =>
    MAIUSCOLE_INNOCUE.has(m) ? m : m[0] + '•'.repeat(m.length - 1)
  )
  return fuori.replace(/\b\d{10,}\b/g, (m) => '•'.repeat(m.length))
}

function escapaRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ════════════════════════════════════════════════════════════════════════
//  PASSO 1 — ISTITUZIONI
// ════════════════════════════════════════════════════════════════════════

interface Istituzione {
  id: string
  name: string
  bic?: string
  transaction_total_days?: string | number
  max_access_valid_for_days?: string | number
  countries?: string[]
}

async function passoIstituzioni(stato: Stato) {
  const token = await ottieniToken(stato)
  const esito = await chiama({
    metodo: 'GET',
    percorso: '/institutions/?country=it',
    token,
    etichetta: 'institutions',
  })
  if (!esito.ok) process.exit(1)

  const elenco = (Array.isArray(esito.corpo) ? esito.corpo : []) as Istituzione[]
  console.log('')
  console.log(`Istituzioni italiane esposte da GoCardless: ${elenco.length}`)

  const termini = argomento('cerca')
    ? [argomento('cerca')!.toLowerCase()]
    : TERMINI_DEFAULT

  const candidate = flag('tutti')
    ? elenco
    : elenco.filter((i) => {
        const ago = `${i.name} ${i.id}`.toLowerCase()
        return termini.some((t) => ago.includes(t))
      })

  console.log(
    flag('tutti')
      ? ''
      : `Candidate su [${termini.join(', ')}]: ${candidate.length}\n`
  )
  if (candidate.length === 0) {
    console.log('Nessuna corrispondenza. Prova con --cerca=<altro termine> o --tutti.')
    return
  }

  for (const i of candidate) {
    console.log(`  ${i.name}`)
    console.log(`     id      : ${i.id}`)
    console.log(`     bic     : ${i.bic ?? '(assente)'}`)
    console.log(`     storico : ${i.transaction_total_days ?? '?'} giorni di transazioni`)
    console.log(`     accesso : ${i.max_access_valid_for_days ?? '?'} giorni di validità massima`)
    console.log('')
  }

  console.log('Passo successivo:')
  console.log(
    candidate.length === 1
      ? '  npx tsx scripts/gocardless-probe.ts --step=consent'
      : `  npx tsx scripts/gocardless-probe.ts --step=consent --istituto=<uno degli id qui sopra>`
  )
}

/** Ritrova un'istituzione nello snapshot già salvato, senza richiamare l'API. */
function istituzioneDaSnapshot(): Istituzione[] {
  const busta = ultimoSnapshot('institutions')
  const corpo = busta?.risposta?.corpo
  return Array.isArray(corpo) ? (corpo as Istituzione[]) : []
}

function numero(v: unknown, difetto: number): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : difetto
}

// ════════════════════════════════════════════════════════════════════════
//  PASSO 2 — CONSENSO (agreement + requisition)
// ════════════════════════════════════════════════════════════════════════

async function passoConsenso(stato: Stato) {
  const elenco = istituzioneDaSnapshot()
  const idRichiesto = argomento('istituto')

  let istituto: Istituzione | undefined
  if (idRichiesto) {
    istituto = elenco.find((i) => i.id === idRichiesto) ?? { id: idRichiesto, name: '(non nello snapshot)' }
  } else if (stato.istituto && !flag('nuovo-consenso')) {
    istituto = elenco.find((i) => i.id === stato.istituto!.id) ?? {
      id: stato.istituto.id,
      name: stato.istituto.nome,
      transaction_total_days: stato.istituto.transactionTotalDays,
      max_access_valid_for_days: stato.istituto.maxAccessValidForDays,
    }
  } else {
    const termini = argomento('cerca') ? [argomento('cerca')!.toLowerCase()] : ['marca']
    const candidate = elenco.filter((i) =>
      termini.some((t) => `${i.name} ${i.id}`.toLowerCase().includes(t))
    )
    if (candidate.length === 1) {
      istituto = candidate[0]
    } else {
      console.error(
        candidate.length === 0
          ? `❌ Nessuna istituzione trovata su [${termini.join(', ')}] nello snapshot.`
          : `❌ ${candidate.length} istituzioni corrispondono a [${termini.join(', ')}]: scegline una.`
      )
      for (const c of candidate) console.error(`   ${c.id}  —  ${c.name}`)
      console.error('')
      console.error('   Lancia prima --step=institutions, poi ripeti con --istituto=<id>.')
      process.exit(1)
    }
  }

  // Si chiede sempre il massimo che l'istituto dichiara, per entrambi.
  // Sull'accesso la spec ipotizzava 90 giorni, ma le BCC su hub ICCREA ne
  // concedono 180: sono tre mesi in meno di SCA da rifare in banca, e il
  // consenso si può sempre revocare prima. I due tetti (730 e 180) sono
  // solo reti di sicurezza contro un valore assurdo dichiarato dall'API.
  const maxStorico = Math.min(numero(istituto!.transaction_total_days, 90), 730)
  const accessoGiorni = Math.min(numero(istituto!.max_access_valid_for_days, 90), 180)

  console.log('')
  console.log(`Istituto  : ${istituto!.name}`)
  console.log(`            ${istituto!.id}`)
  console.log(`Storico   : chiedo ${maxStorico} giorni (il massimo che l'istituto dichiara)`)
  console.log(`Accesso   : chiedo ${accessoGiorni} giorni di validità`)
  console.log('')

  const token = await ottieniToken(stato)

  // ── Agreement ────────────────────────────────────────────────────────
  let agreementId = flag('nuovo-consenso') ? undefined : stato.agreementId
  if (agreementId) {
    console.log(`→ agreement: riuso quello già creato (${agreementId})`)
  } else {
    const esito = await chiama({
      metodo: 'POST',
      percorso: '/agreements/enduser/',
      token,
      corpo: {
        institution_id: istituto!.id,
        max_historical_days: maxStorico,
        access_valid_for_days: accessoGiorni,
        access_scope: ['balances', 'details', 'transactions'],
      },
      etichetta: 'agreement',
    })
    if (!esito.ok) {
      console.error('')
      console.error("❌ L'agreement non è stato creato. Cause tipiche:")
      console.error(
        `   • max_historical_days (${maxStorico}) oltre a quanto l'istituto consente — rilancia dopo`
      )
      console.error('     --step=institutions, che rilegge i valori veri')
      console.error("   • institution_id sbagliato")
      process.exit(1)
    }
    agreementId = esito.corpo.id
    stato.agreementId = agreementId
    stato.agreementCreato = new Date().toISOString()
    console.log(
      `   agreement ${agreementId} — storico concesso: ${esito.corpo.max_historical_days} giorni, ` +
        `accesso: ${esito.corpo.access_valid_for_days} giorni`
    )
  }

  stato.istituto = {
    id: istituto!.id,
    nome: istituto!.name,
    transactionTotalDays: numero(istituto!.transaction_total_days, undefined as unknown as number),
    maxAccessValidForDays: numero(istituto!.max_access_valid_for_days, undefined as unknown as number),
  }
  salvaStato(stato)

  // ── Requisition ──────────────────────────────────────────────────────
  if (stato.requisition && !flag('nuovo-consenso')) {
    console.log('')
    console.log('⚠️  Esiste già una requisition creata il ' + stato.requisition.creata + '.')
    console.log('   Se l\'SCA non è ancora stata fatta, riusa questo link:')
    stampaLink(stato.requisition.link)
    console.log('   Per crearne una nuova: --step=consent --nuovo-consenso')
    return
  }

  const redirect =
    argomento('redirect') ??
    process.env.GOCARDLESS_REDIRECT_URI ??
    (process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, '')}/api/gocardless/callback` : undefined) ??
    'http://localhost:3000/api/gocardless/callback'

  console.log(`→ redirect della requisition: ${redirect}`)

  const esito = await chiama({
    metodo: 'POST',
    percorso: '/requisitions/',
    token,
    corpo: {
      institution_id: istituto!.id,
      agreement: agreementId,
      redirect,
      reference: `sonda-weiss-${Date.now()}`,
      user_language: 'IT',
    },
    etichetta: 'requisition-create',
  })

  if (!esito.ok) {
    console.error('')
    console.error('❌ La requisition non è stata creata.')
    if (JSON.stringify(esito.corpo ?? '').toLowerCase().includes('redirect')) {
      console.error(`   GoCardless ha contestato il redirect (${redirect}).`)
      console.error('   Rilancia con un URL che accetta, per esempio quello di produzione:')
      console.error(
        '     npx tsx scripts/gocardless-probe.ts --step=consent --redirect=https://<dominio-railway>/api/gocardless/callback'
      )
      console.error("   In fase di sonda il redirect non deve gestire nulla: l'id della")
      console.error('   requisition ce l\'abbiamo già ed è salvato in _stato.json.')
    }
    process.exit(1)
  }

  stato.requisition = {
    id: esito.corpo.id,
    link: esito.corpo.link,
    creata: new Date().toISOString(),
    redirect,
  }
  salvaStato(stato)

  console.log('')
  const d = descriviStato(esito.corpo.status)
  console.log(`requisition ${esito.corpo.id} — stato ${esito.corpo.status} (${d.nome} — ${d.spiegazione})`)
  stampaLink(esito.corpo.link)
  console.log('Adesso tocca a te:')
  console.log('  1. apri il link nel browser')
  console.log('  2. autenticati in banca (SCA) e seleziona i conti da condividere')
  console.log('  3. poi: npx tsx scripts/gocardless-probe.ts --step=accounts')
  console.log('')
}

function stampaLink(link: string) {
  console.log('')
  console.log('═'.repeat(78))
  console.log('  LINK DI CONSENSO — da aprire nel browser')
  console.log('═'.repeat(78))
  console.log('')
  console.log(`  ${link}`)
  console.log('')
  console.log('═'.repeat(78))
  console.log('')
}

// ════════════════════════════════════════════════════════════════════════
//  PASSO 3 — CONTI COLLEGATI
// ════════════════════════════════════════════════════════════════════════

async function passoConti(stato: Stato) {
  const id = argomento('requisition') ?? stato.requisition?.id
  if (!id) {
    console.error('❌ Nessuna requisition da interrogare.')
    console.error('   Lancia prima --step=consent, oppure passa --requisition=<id>.')
    process.exit(1)
  }

  const token = await ottieniToken(stato)
  const esito = await chiama({
    metodo: 'GET',
    percorso: `/requisitions/${id}/`,
    token,
    etichetta: 'requisition-read',
  })
  if (!esito.ok) process.exit(1)

  const statoReq = esito.corpo?.status as string
  console.log('')
  const d = descriviStato(statoReq)
  console.log(`Stato requisition: ${statoReq} — ${d.nome} — ${d.spiegazione}`)

  const conti = Array.isArray(esito.corpo?.accounts) ? (esito.corpo.accounts as string[]) : []
  if (statoReq !== 'LN') {
    console.log('')
    console.log("L'SCA non risulta completata. Il link è ancora questo:")
    if (stato.requisition?.link) stampaLink(stato.requisition.link)
    return
  }

  stato.conti = conti
  salvaStato(stato)

  console.log(`Conti collegati: ${conti.length}`)
  for (const c of conti) console.log(`  ${c}`)
  console.log('')
  console.log('Passo successivo: npx tsx scripts/gocardless-probe.ts --step=fetch')
}

// ════════════════════════════════════════════════════════════════════════
//  SELEZIONE DEI CONTI
// ════════════════════════════════════════════════════════════════════════

/** L'IBAN di un conto dal suo snapshot `details`, se è già stato scaricato. */
function ibanDiConto(conto: string): string | undefined {
  const corpo = ultimoSnapshot(`account-${conto}-details`)?.risposta?.corpo as
    | { account?: { iban?: string } }
    | undefined
  return corpo?.account?.iban
}

/** I conti su cui si lavora davvero: quelli collegati, meno gli esclusi. */
function contiAttivi(stato: Stato): string[] {
  const esclusi = new Set(stato.esclusi ?? [])
  return (stato.conti ?? []).filter((c) => !esclusi.has(c))
}

/**
 * Traduce ciò che l'utente scrive nell'id del conto: l'id intero, un suo
 * prefisso, o le ultime quattro cifre dell'IBAN — che è l'unico modo umano di
 * dire "quello", visto che gli id sono UUID e l'IBAN intero non si scrive a
 * mano in un terminale.
 */
function risolviConto(stato: Stato, indizio: string): string | null {
  const conti = stato.conti ?? []
  const esatto = conti.find((c) => c === indizio)
  if (esatto) return esatto
  const perPrefisso = conti.filter((c) => c.startsWith(indizio))
  if (perPrefisso.length === 1) return perPrefisso[0]
  const perIban = conti.filter((c) => {
    const iban = ibanDiConto(c)
    return typeof iban === 'string' && iban.endsWith(indizio)
  })
  if (perIban.length === 1) return perIban[0]
  return null
}

/** Cancella dal disco tutto ciò che è stato scaricato per un conto. */
function purgaConto(conto: string): number {
  if (!existsSync(DIR_SNAPSHOT)) return 0
  let n = 0
  for (const f of readdirSync(DIR_SNAPSHOT)) {
    if (!f.includes(`__account-${conto}-`)) continue
    unlinkSync(join(DIR_SNAPSHOT, f))
    n++
  }
  return n
}

/**
 * Applica `--escludi` / `--includi`. Torna true se ha fatto qualcosa.
 *
 * L'esclusione è deliberatamente *prima* di ogni chiamata: un conto escluso
 * non viene letto, non solo non viene mostrato. Su un conto personale la
 * differenza non è di stile — è la differenza fra non trattare un dato e
 * trattarlo e poi nasconderlo.
 */
function applicaSelezione(stato: Stato): boolean {
  const daEscludere = argomento('escludi')
  const daIncludere = argomento('includi')
  if (!daEscludere && !daIncludere) return false

  const indizio = (daEscludere ?? daIncludere)!
  const conto = risolviConto(stato, indizio)
  if (!conto) {
    console.error(`❌ Nessun conto corrisponde a "${indizio}".`)
    console.error('   Ammessi: l\'id intero, un suo prefisso, o le ultime 4 cifre dell\'IBAN.')
    console.error('   I conti collegati sono:')
    for (const c of stato.conti ?? []) {
      const iban = ibanDiConto(c)
      console.error(`     ${c}  ${iban ? mascheraIban(iban) : '(dettagli non scaricati)'}`)
    }
    process.exit(1)
  }

  const esclusi = new Set(stato.esclusi ?? [])
  if (daEscludere) {
    esclusi.add(conto)
    stato.esclusi = [...esclusi]
    salvaStato(stato)
    console.log(`Conto ${conto} ESCLUSO: non verrà più letto né analizzato.`)
    if (flag('purga')) {
      const n = purgaConto(conto)
      console.log(`   cancellati ${n} file già scaricati per questo conto.`)
      console.log('   ⚠️  Rilancia --step=report: i referti attuali contengono ancora i suoi movimenti.')
    } else {
      const rimasti = snapshotPerEtichetta(`account-${conto}-transactions`).length
      if (rimasti > 0) {
        console.log(`   ⚠️  Restano ${rimasti} scarichi già sul disco per questo conto.`)
        console.log('       Per cancellarli: ripeti il comando aggiungendo --purga')
      }
    }
  } else {
    esclusi.delete(conto)
    stato.esclusi = [...esclusi]
    salvaStato(stato)
    console.log(`Conto ${conto} di nuovo incluso.`)
  }

  const attivi = contiAttivi(stato)
  console.log(`Conti attivi: ${attivi.length} su ${(stato.conti ?? []).length}`)
  return true
}

// ════════════════════════════════════════════════════════════════════════
//  PASSO 4 — SCARICO DEI DATI
// ════════════════════════════════════════════════════════════════════════

async function passoScarico(stato: Stato) {
  const unSolo = argomento('conto')
  if (unSolo && (stato.esclusi ?? []).includes(unSolo)) {
    console.error(`❌ Il conto ${unSolo} è escluso: non lo leggo.`)
    console.error('   Per riammetterlo: --includi=' + unSolo)
    process.exit(1)
  }
  const conti = unSolo ? [unSolo] : contiAttivi(stato)
  if (conti.length === 0) {
    console.error('❌ Nessun conto da leggere. Lancia prima --step=accounts.')
    process.exit(1)
  }
  const esclusi = (stato.esclusi ?? []).length
  if (esclusi > 0) console.log(`(${esclusi} conto/i escluso/i: non verranno letti)`)

  const token = await ottieniToken(stato)
  const da = argomento('da')
  const a = argomento('a')

  console.log('')
  console.log(`Conti da leggere: ${conti.length}`)
  console.log('Limite della banca: 4 chiamate al giorno per conto e per endpoint.')
  console.log('Ciò che è già stato preso oggi viene saltato (--forza per insistere).')
  console.log('')

  for (const conto of conti) {
    console.log(`── conto ${conto}`)
    for (const endpoint of ENDPOINT_CONTO) {
      const etichetta = `account-${conto}-${endpoint}`
      const giaFatto = giaPresoOggi(etichetta)
      if (giaFatto && !flag('forza')) {
        console.log(`   ${endpoint}: già scaricato oggi, salto (${giaFatto.replace(RADICE + '/', '')})`)
        continue
      }

      let percorso = `/accounts/${conto}/${endpoint}/`
      if (endpoint === 'transactions') {
        const q: string[] = []
        if (da) q.push(`date_from=${encodeURIComponent(da)}`)
        if (a) q.push(`date_to=${encodeURIComponent(a)}`)
        if (q.length > 0) percorso += `?${q.join('&')}`
      }

      const esito = await chiama({ metodo: 'GET', percorso, token, etichetta })
      if (!esito.ok) {
        if (esito.stato === 429) {
          console.error('   ⚠️  429: limite giornaliero esaurito per questo conto/endpoint.')
          console.error('       Si riprende domani. I file già salvati restano validi.')
        }
        continue
      }
      console.log(`   ${endpoint}: ${riassumi(endpoint, esito.corpo)}`)
    }
    console.log('')
  }

  console.log('Passo successivo: npx tsx scripts/gocardless-probe.ts --step=report')
}

function riassumi(endpoint: EndpointConto, corpo: any): string {
  if (endpoint === 'details') {
    const c = corpo?.account ?? {}
    return `IBAN ${mascheraIban(c.iban)}, intestatario ${mascheraNome(c.ownerName)}, valuta ${c.currency ?? '?'}`
  }
  if (endpoint === 'balances') {
    const b = Array.isArray(corpo?.balances) ? corpo.balances : []
    return b
      .map((x: any) => `${x.balanceType}=${x.balanceAmount?.amount} ${x.balanceAmount?.currency}`)
      .join('  ') || '(nessun saldo)'
  }
  const booked = corpo?.transactions?.booked?.length ?? 0
  const pending = corpo?.transactions?.pending?.length ?? 0
  return `${booked} movimenti contabilizzati, ${pending} in sospeso`
}

// ════════════════════════════════════════════════════════════════════════
//  PASSO 5 — IL REFERTO
// ════════════════════════════════════════════════════════════════════════

interface Movimento {
  transactionId?: string
  internalTransactionId?: string
  bookingDate?: string
  valueDate?: string
  transactionAmount?: { amount?: string; currency?: string }
  creditorName?: string
  debtorName?: string
  creditorAccount?: { iban?: string }
  debtorAccount?: { iban?: string }
  remittanceInformationUnstructured?: string
  remittanceInformationUnstructuredArray?: string[]
  remittanceInformationStructured?: string
  additionalInformation?: string
  proprietaryBankTransactionCode?: string
  bankTransactionCode?: string
  endToEndId?: string
  entryReference?: string
}

interface Regola {
  name: string
  direction: 'INFLOW' | 'OUTFLOW'
  keywords: string[]
  priority?: number
}

function causale(m: Movimento): string {
  return (
    m.remittanceInformationUnstructured ??
    (Array.isArray(m.remittanceInformationUnstructuredArray)
      ? m.remittanceInformationUnstructuredArray.join(' ')
      : '') ??
    ''
  ).trim()
}

function importo(m: Movimento): number {
  return parseFloat(m.transactionAmount?.amount ?? '0') || 0
}

function controparte(m: Movimento): string {
  return (importo(m) >= 0 ? m.debtorName : m.creditorName) ?? m.creditorName ?? m.debtorName ?? ''
}

async function passoReferto(stato: Stato) {
  const conti = contiAttivi(stato)
  if (conti.length === 0) {
    console.error('❌ Nessun conto attivo: non ci sono dati da analizzare.')
    console.error('   Servono almeno --step=accounts e --step=fetch (e nessun conto escluso).')
    process.exit(1)
  }

  const regole = await caricaRegole()
  const righe: string[] = []
  const oggi = new Date().toISOString().slice(0, 10)

  const dettagli = new Map<string, any>()
  const saldi = new Map<string, any>()
  const movimenti = new Map<string, Movimento[]>()
  const precedenti = new Map<string, Movimento[]>()

  for (const c of conti) {
    dettagli.set(c, ultimoSnapshot(`account-${c}-details`)?.risposta?.corpo)
    saldi.set(c, ultimoSnapshot(`account-${c}-balances`)?.risposta?.corpo)

    const snapMov = snapshotPerEtichetta(`account-${c}-transactions`)
    const leggi = (f: string): Movimento[] => {
      try {
        const b = JSON.parse(readFileSync(f, 'utf8')) as Busta
        const t: any = b.risposta?.corpo
        return [...(t?.transactions?.booked ?? []), ...(t?.transactions?.pending ?? [])]
      } catch {
        return []
      }
    }
    if (snapMov.length > 0) movimenti.set(c, leggi(snapMov[snapMov.length - 1]))
    if (snapMov.length > 1) precedenti.set(c, leggi(snapMov[snapMov.length - 2]))
  }

  const tutti = [...movimenti.values()].flat()

  // I nomi visti servono a ripulire le causali che finiscono nel documento.
  const nomiNoti = new Set<string>()
  for (const m of tutti) {
    if (m.creditorName) nomiNoti.add(m.creditorName)
    if (m.debtorName) nomiNoti.add(m.debtorName)
  }
  for (const c of conti) {
    const nome = dettagli.get(c)?.account?.ownerName
    if (nome) nomiNoti.add(nome)
  }

  righe.push(`# Referto sonda GoCardless — ${oggi}`)
  righe.push('')
  righe.push(
    'Prodotto da `scripts/gocardless-probe.ts --step=report` sui payload salvati in ' +
      '`scripts/gocardless/snapshots/` (fuori dal repository). IBAN e nomi sono mascherati ' +
      "con un'euristica: **rileggi il documento prima di committarlo.**"
  )
  righe.push('')

  // ── 1 ────────────────────────────────────────────────────────────────
  righe.push('## 1. Istituto, storico, durata dell\'accesso')
  righe.push('')
  const agr: any = ultimoSnapshot('agreement')?.risposta?.corpo
  righe.push(`- \`institution_id\`: \`${stato.istituto?.id ?? '?'}\` — ${stato.istituto?.nome ?? '?'}`)
  righe.push(`- storico dichiarato dall'istituto: ${stato.istituto?.transactionTotalDays ?? '?'} giorni`)
  righe.push(`- storico concesso nell'agreement: ${agr?.max_historical_days ?? '?'} giorni`)
  righe.push(`- accesso valido per: ${agr?.access_valid_for_days ?? '?'} giorni`)
  righe.push(`- scope: ${(agr?.access_scope ?? []).join(', ') || '?'}`)
  righe.push('')

  // ── 2 ────────────────────────────────────────────────────────────────
  righe.push('## 2. Conti trovati')
  righe.push('')
  righe.push(`Conti analizzati: **${conti.length}**`)
  const nEsclusi = (stato.esclusi ?? []).length
  if (nEsclusi > 0) {
    righe.push('')
    righe.push(
      `> ${nEsclusi} conto/i coperto/i dal consenso è escluso dall'analisi e non viene letto ` +
        '(`--escludi`). Il consenso in banca si dà per home banking, non per conto: la selezione ' +
        'di ciò che entra nel gestionale è una decisione nostra, e va presa prima della chiamata.'
    )
  }
  righe.push('')
  righe.push('| conto | IBAN (mascherato) | ultime 4 | intestatario | valuta | saldo |')
  righe.push('|---|---|---|---|---|---|')
  for (const c of conti) {
    const d = dettagli.get(c)?.account ?? {}
    const b = saldi.get(c)?.balances ?? []
    const saldo = b
      .map((x: any) => `${x.balanceType}: ${x.balanceAmount?.amount} ${x.balanceAmount?.currency}`)
      .join('<br>')
    const iban: string = d.iban ?? ''
    righe.push(
      `| \`${c.slice(0, 8)}…\` | ${mascheraIban(d.iban)} | ${iban.slice(-4) || '?'} | ` +
        `${mascheraNome(d.ownerName)} | ${d.currency ?? '?'} | ${saldo || '(non scaricato)'} |`
    )
  }
  righe.push('')
  righe.push(
    "> Il confronto con i `BankAccount` già a sistema si fa a occhio sulle ultime 4 cifre: " +
      "gli IBAN a database sono cifrati e l'abbinamento vero, in Fase 2, passerà da `ibanHash`."
  )
  righe.push('')

  // ── 3 ────────────────────────────────────────────────────────────────
  righe.push('## 3. `transactionId`: presenza, unicità, stabilità')
  righe.push('')
  righe.push(`- movimenti analizzati: **${tutti.length}** su ${conti.length} conti`)

  // La domanda vera non è "l'id c'è?" ma "l'id è una chiave?", e su più conti
  // dello stesso istituto le due cose non coincidono affatto.
  let globalmenteUnico = true
  const riepilogoChiavi: { campo: string; dentro: number; suPiuConti: number }[] = []
  for (const campo of ['transactionId', 'internalTransactionId'] as const) {
    const valorizzati = tutti.filter((m) => typeof m[campo] === 'string' && m[campo] !== '')
    let dentro = 0
    const contiPerChiave = new Map<string, Set<string>>()
    for (const c of conti) {
      const valori = (movimenti.get(c) ?? []).map((m) => m[campo]).filter(Boolean) as string[]
      dentro += valori.length - new Set(valori).size
      for (const k of valori) {
        if (!contiPerChiave.has(k)) contiPerChiave.set(k, new Set())
        contiPerChiave.get(k)!.add(c)
      }
    }
    const suPiuConti = [...contiPerChiave.values()].filter((s) => s.size > 1).length
    if (suPiuConti > 0) globalmenteUnico = false
    riepilogoChiavi.push({ campo, dentro, suPiuConti })
    righe.push('')
    righe.push(`**\`${campo}\`** — valorizzato nel ${percentuale(valorizzati.length, tutti.length)} dei movimenti`)
    righe.push(
      `- duplicati **dentro** lo stesso conto: ${dentro}` +
        (dentro === 0 ? ' → è una chiave, per conto' : ' → ⚠️ **non è una chiave nemmeno per conto**')
    )
    righe.push(
      `- valori che ricompaiono **su più conti**: ${suPiuConti}` +
        (suPiuConti === 0 ? '' : ' → ⚠️ **non è unico globalmente**')
    )
  }
  righe.push('')
  if (!globalmenteUnico) {
    righe.push(
      '> **Conseguenza sul modello dati.** Gli id sono unici per conto ma non fra conti: ' +
        'due movimenti diversi su due conti diversi portano lo stesso valore. Il vincolo di ' +
        'unicità oggi a database è `@@unique([venueId, bankReference])` ' +
        '(`prisma/schema.prisma:1749`), che **non ha il conto dentro**: usando l\'id di ' +
        'GoCardless come `bankReference`, il secondo dei due movimenti verrebbe scartato come ' +
        'duplicato. `BankTransaction.bankAccountId` non è "il primo campo da aggiungere" come ' +
        'diceva la spec: è la condizione perché la deduplica sia corretta. La chiave giusta è ' +
        '`(bankAccountId, transactionId)`.'
    )
    righe.push('')
  }
  let confronti = 0
  for (const c of conti) {
    const prima = precedenti.get(c)
    const dopo = movimenti.get(c)
    if (!prima || !dopo || prima.length === 0) continue
    confronti++
    const idPrima = new Set(prima.map((m) => m.transactionId).filter(Boolean))
    const idDopo = new Set(dopo.map((m) => m.transactionId).filter(Boolean))
    const spariti = [...idPrima].filter((id) => !idDopo.has(id as string))
    righe.push(
      `- conto \`${c.slice(0, 8)}…\`: ${idPrima.size} id nello scarico precedente, ` +
        `${spariti.length} non ricompaiono in quello nuovo` +
        (spariti.length === 0 ? ' → **id stabili**' : ' → ⚠️ **id instabili, la deduplica non può basarsi su questo**')
    )
  }
  if (confronti === 0) {
    righe.push(
      '- stabilità **non verificabile**: serve un secondo `--step=fetch` a distanza di tempo, ' +
        'poi si rilancia questo referto.'
    )
  }
  righe.push('')

  // ── 4 ────────────────────────────────────────────────────────────────
  righe.push('## 4. Ricchezza di `remittanceInformationUnstructured`')
  righe.push('')
  const causali = tutti.map(causale)
  const conCausale = causali.filter((s) => s.length > 0)
  const lunghezze = conCausale.map((s) => s.length).sort((x, y) => x - y)
  const conFattura = conCausale.filter((s) => /\b(fatt|ft\.?|fattura|n\.?\s?\d{2,})/i.test(s))
  const conCifre = conCausale.filter((s) => /\d{3,}/.test(s))
  righe.push(`- valorizzata in **${percentuale(conCausale.length, tutti.length)}** dei movimenti`)
  righe.push(
    `- lunghezza: minima ${lunghezze[0] ?? 0}, mediana ${lunghezze[Math.floor(lunghezze.length / 2)] ?? 0}, ` +
      `massima ${lunghezze[lunghezze.length - 1] ?? 0} caratteri`
  )
  righe.push(`- contiene un riferimento a fattura: **${percentuale(conFattura.length, conCausale.length)}**`)
  righe.push(`- contiene sequenze numeriche (3+ cifre): **${percentuale(conCifre.length, conCausale.length)}**`)
  righe.push('')
  righe.push('Campione (mascherato — le maiuscole sono nomi di persone e di fornitori):')
  righe.push('')
  for (const s of campione(conCausale, 12)) {
    righe.push(`- \`${mascheraCausale(s, nomiNoti).slice(0, 140)}\``)
  }
  righe.push('')

  // I campioni in chiaro servono per davvero (è da lì che si capisce se la
  // categorizzazione può funzionare), ma non possono stare in un file che il
  // repository traccia: restano accanto agli altri dati veri.
  const fileCampioni = join(DIR_SNAPSHOT, '_campioni-causali.txt')
  writeFileSync(
    fileCampioni,
    ['# Causali in chiaro — NON versionare, contiene nomi reali', '', ...conCausale].join('\n'),
    { mode: 0o600 }
  )
  righe.push(
    `> Le ${conCausale.length} causali **in chiaro** stanno in ` +
      '`scripts/gocardless/snapshots/_campioni-causali.txt`, fuori dal repository: è lì che si ' +
      'legge davvero se la categorizzazione automatica può funzionare.'
  )
  righe.push('')

  // ── 5 ────────────────────────────────────────────────────────────────
  righe.push('## 5. `creditorName` / `debtorName`')
  righe.push('')
  const entrate = tutti.filter((m) => importo(m) >= 0)
  const uscite = tutti.filter((m) => importo(m) < 0)
  const pieno = (v?: string) => typeof v === 'string' && v.trim() !== ''
  righe.push(
    `- entrate (${entrate.length}): \`debtorName\` valorizzato in **${percentuale(entrate.filter((m) => pieno(m.debtorName)).length, entrate.length)}**`
  )
  righe.push(
    `- uscite (${uscite.length}): \`creditorName\` valorizzato in **${percentuale(uscite.filter((m) => pieno(m.creditorName)).length, uscite.length)}**`
  )
  righe.push(
    `- controparte disponibile (uno dei due campi): **${percentuale(tutti.filter((m) => controparte(m) !== '').length, tutti.length)}**`
  )
  righe.push(
    `- IBAN della controparte presente: **${percentuale(tutti.filter((m) => m.creditorAccount?.iban || m.debtorAccount?.iban).length, tutti.length)}**`
  )
  righe.push('')

  // Non basta dire "il campo è vuoto": va detto se il campo esiste. Un campo
  // assente in tutti i movimenti significa che la banca non lo manda proprio,
  // e non c'è configurazione o pazienza che lo faccia comparire.
  const presenza = new Map<string, number>()
  for (const m of tutti) {
    for (const k of Object.keys(m)) presenza.set(k, (presenza.get(k) ?? 0) + 1)
  }
  righe.push('Campi che la banca manda davvero, su tutti i movimenti scaricati:')
  righe.push('')
  righe.push('| campo | presente in |')
  righe.push('|---|---|')
  for (const [k, n] of [...presenza.entries()].sort((a, b) => b[1] - a[1])) {
    righe.push(`| \`${k}\` | ${percentuale(n, tutti.length)} |`)
  }
  righe.push('')
  const conAsterisco = causali.filter((s) => s.includes('*'))
  righe.push(
    `Dove sta allora la controparte: dentro la causale, dopo un \`*\` che compare in ` +
      `**${percentuale(conAsterisco.length, tutti.length)}** dei movimenti e separa l'etichetta ` +
      "dell'operazione dal resto. Non è a colonna fissa, ma è un separatore: è da lì che un " +
      'estrattore dovrà tirare fuori il nome, non da un campo strutturato che non arriverà mai.'
  )
  righe.push('')

  // ── 6 ────────────────────────────────────────────────────────────────
  righe.push('## 6. Copertura delle regole di categorizzazione esistenti')
  righe.push('')
  if (!regole) {
    righe.push(
      '**Non calcolata**: mancano le regole. Rilancia con `--regole-da-db` (sola lettura su ' +
        '`categorization_rules`) oppure con `--regole=<file.json>`, dove il file è un array di ' +
        '`{ "name", "direction", "keywords" }`.'
    )
  } else {
    righe.push(
      `Regole attive considerate: **${regole.length}**. Il confronto replica ` +
        '`src/app/api/prima-nota/recategorize/route.ts:82-86`: match se una keyword è contenuta ' +
        'nel testo (case-insensitive) e la direzione coincide.'
    )
    righe.push('')
    const soloCausale = tutti.filter((m) => regolaChePrende(m, regole, false) !== null)
    const conControparte = tutti.filter((m) => regolaChePrende(m, regole, true) !== null)
    righe.push(
      `- match **sulla sola causale** (comportamento di oggi): **${percentuale(soloCausale.length, tutti.length)}** ` +
        `(${soloCausale.length}/${tutti.length})`
    )
    righe.push(
      `- match **estendendo alla controparte** (proposta della Fase 4): ` +
        `**${percentuale(conControparte.length, tutti.length)}** (${conControparte.length}/${tutti.length})`
    )
    righe.push(
      `- guadagno dell'estensione: **+${conControparte.length - soloCausale.length}** movimenti`
    )
    righe.push('')
    const perRegola = new Map<string, number>()
    for (const m of tutti) {
      const r = regolaChePrende(m, regole, true)
      if (r) perRegola.set(r.name, (perRegola.get(r.name) ?? 0) + 1)
    }
    if (perRegola.size > 0) {
      righe.push('| regola | movimenti intercettati |')
      righe.push('|---|---|')
      for (const [nome, n] of [...perRegola.entries()].sort((a, b) => b[1] - a[1])) {
        righe.push(`| ${nome} | ${n} |`)
      }
      righe.push('')
    }
    const scoperti = tutti.filter((m) => regolaChePrende(m, regole, true) === null)
    if (scoperti.length > 0) {
      righe.push('Campione di movimenti che **nessuna regola prende** (mascherato):')
      righe.push('')
      for (const m of campione(scoperti, 10)) {
        righe.push(
          `- ${importo(m).toFixed(2)} — \`${mascheraCausale(causale(m), nomiNoti).slice(0, 100)}\`` +
            ` — controparte ${mascheraNome(controparte(m))}`
        )
      }
      righe.push('')
    }
  }

  // ── 7 ────────────────────────────────────────────────────────────────
  righe.push('## 7. `bookingDate` contro `valueDate`')
  righe.push('')
  const conEntrambe = tutti.filter((m) => m.bookingDate && m.valueDate)
  const diverse = conEntrambe.filter((m) => m.bookingDate !== m.valueDate)
  righe.push(`- \`bookingDate\` presente: **${percentuale(tutti.filter((m) => m.bookingDate).length, tutti.length)}**`)
  righe.push(`- \`valueDate\` presente: **${percentuale(tutti.filter((m) => m.valueDate).length, tutti.length)}**`)
  righe.push(`- le due date differiscono in **${percentuale(diverse.length, conEntrambe.length)}** dei casi`)
  if (diverse.length > 0) {
    const scarti = diverse.map((m) => giorniFra(m.bookingDate!, m.valueDate!))
    const conteggio = new Map<number, number>()
    for (const s of scarti) conteggio.set(s, (conteggio.get(s) ?? 0) + 1)
    righe.push(
      `- scarto (valueDate − bookingDate) in giorni: ` +
        [...conteggio.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([g, n]) => `${g > 0 ? '+' : ''}${g}: ${n}`)
          .join(', ')
    )
  }
  righe.push('')
  righe.push(
    '`BankTransaction` ha già due colonne: `transaction_date` (la data che la prima nota usa) e ' +
      '`value_date`. La mappatura naturale è `bookingDate → transaction_date`, ' +
      '`valueDate → value_date`.'
  )
  righe.push('')

  // ── 8: fuori dalle sette domande, ma è il segnale più forte del referto ──
  righe.push('## 8. `proprietaryBankTransactionCode` — la sorpresa')
  righe.push('')
  const codici = new Map<string, { n: number; esempio: string }>()
  for (const m of tutti) {
    const k = m.proprietaryBankTransactionCode
    if (!k) continue
    if (!codici.has(k)) codici.set(k, { n: 0, esempio: causale(m).slice(0, 34) })
    codici.get(k)!.n++
  }
  if (codici.size === 0) {
    righe.push('La banca non manda codici proprietari: non c\'è niente da sfruttare qui.')
  } else {
    righe.push(
      `La banca classifica **ogni** movimento con un proprio codice: ${codici.size} codici ` +
        `distinti su ${tutti.length} movimenti, presenti nel ` +
        `${percentuale(tutti.filter((m) => m.proprietaryBankTransactionCode).length, tutti.length)} dei casi. ` +
        'Non è testo libero da indovinare con le keyword: è una tassonomia stabile, che la banca ' +
        'assegna a monte.'
    )
    righe.push('')
    righe.push('| codice | movimenti | tipo di operazione (dall\'etichetta) |')
    righe.push('|---|---|---|')
    for (const [k, v] of [...codici.entries()].sort((a, b) => b[1].n - a[1].n)) {
      righe.push(`| \`${k}\` | ${v.n} | ${mascheraCausale(v.esempio, nomiNoti)} |`)
    }
    righe.push('')
    righe.push(
      '> Vale la pena rileggere la Fase 4 alla luce di questa tabella. La spec puntava a ' +
        'estendere il match delle keyword al nome della controparte; qui la controparte non ' +
        "arriva, ma arriva qualcosa di meglio per l'imputazione contabile: commissioni, imposte, " +
        'stipendi, rate di mutuo, incassi POS e versamenti di contante hanno ciascuno un codice ' +
        "proprio. Una mappa `codice → conto` copre a colpo sicuro la parte di movimenti che le " +
        'keyword prendono per approssimazione, e lascia al testo libero solo bonifici e SDD, ' +
        'dove il fornitore va davvero riconosciuto.'
    )
    righe.push('')
  }

  // ── I due referti ────────────────────────────────────────────────────
  //
  // Il repository è PUBBLICO (github.com/NicScarpa/weiss-gestionale). La spec
  // dava per scontato che un referto "anonimizzato" potesse stare in `docs/`,
  // ma con un repo pubblico l'asticella è un'altra: saldi dei conti, ultime
  // quattro cifre degli IBAN e iniziali su un movimento di stipendio non
  // devono uscire, e mascherare del testo libero è una difesa per esclusione,
  // che sbaglia appena la banca cambia formato.
  //
  // Quindi due documenti, e il secondo non è il primo mascherato: è costruito
  // per inclusione, riga per riga, e riceve solo numeri e prosa mia. Nessuna
  // stringa proveniente dalla banca lo attraversa.
  const completo = join(DIR_SNAPSHOT, `referto-${oggi}.md`)
  writeFileSync(completo, righe.join('\n'), { mode: 0o600 })
  console.log('')
  console.log(`Referto completo  → ${completo.replace(RADICE + '/', '')} (non versionato)`)

  const pubblico = refertoPubblico({
    oggi,
    stato,
    agr,
    conti,
    esclusi: (stato.esclusi ?? []).length,
    valute: [...new Set(conti.map((c) => dettagli.get(c)?.account?.currency).filter(Boolean))] as string[],
    totale: tutti.length,
    riepilogoChiavi,
    globalmenteUnico,
    confronti,
    conCausale: conCausale.length,
    lunghezze,
    conFattura: conFattura.length,
    conCifre: conCifre.length,
    entrate: entrate.length,
    entrateConNome: entrate.filter((m) => pieno(m.debtorName)).length,
    uscite: uscite.length,
    usciteConNome: uscite.filter((m) => pieno(m.creditorName)).length,
    campi: [...presenza.entries()],
    conAsterisco: conAsterisco.length,
    conEntrambe: conEntrambe.length,
    diverse: diverse.length,
    codici,
    movimentiPerCodice: raggruppaPerCodice(tutti),
    regole: regole ? regole.length : null,
  })
  const percorso = join(DIR_DOCS, `gocardless-referto-${oggi}.md`)
  mkdirSync(DIR_DOCS, { recursive: true })
  writeFileSync(percorso, pubblico.join('\n'))
  console.log(`Referto pubblico  → ${percorso.replace(RADICE + '/', '')} (versionabile)`)

  if (flag('fixtures')) scriviFixture(conti, dettagli, saldi, movimenti, nomiNoti)
}

/** Le causali raggruppate per codice della banca: servono al prefisso comune. */
function raggruppaPerCodice(movimenti: Movimento[]): Map<string, string[]> {
  const mappa = new Map<string, string[]>()
  for (const m of movimenti) {
    const k = m.proprietaryBankTransactionCode
    if (!k) continue
    if (!mappa.has(k)) mappa.set(k, [])
    mappa.get(k)!.push(causale(m))
  }
  return mappa
}

/**
 * Il prefisso comune a tutte le causali di uno stesso codice.
 *
 * Serve a dare un'etichetta leggibile ai codici della banca in un documento
 * pubblicabile, senza copiarci dentro la causale di un movimento vero:
 * l'etichetta dell'operazione è fissa per codice, la controparte cambia a ogni
 * movimento, quindi ciò che sopravvive all'intersezione di molte causali è per
 * costruzione la parte che non appartiene a nessuno in particolare. Sotto le
 * tre occorrenze non ci si fida e non si scrive niente.
 */
function prefissoComune(causali: string[]): string | null {
  if (causali.length < 3) return null
  let prefisso = causali[0]
  for (const s of causali.slice(1)) {
    let i = 0
    while (i < prefisso.length && i < s.length && prefisso[i] === s[i]) i++
    prefisso = prefisso.slice(0, i)
    if (prefisso.length === 0) return null
  }
  const tagliato = prefisso.split('*')[0].trim().slice(0, 40)
  return tagliato.length >= 6 ? tagliato : null
}

/**
 * Il referto versionabile.
 *
 * Costruito per inclusione: riceve conteggi, percentuali e nomi di campo, e
 * non vede mai una causale, un IBAN, un saldo o un nome. Se un domani la banca
 * comincia a mandare un campo nuovo pieno di dati personali, questo documento
 * non se ne accorge — che è esattamente ciò che si vuole da un file che
 * finisce su GitHub.
 */
function refertoPubblico(d: {
  oggi: string
  stato: Stato
  agr: any
  conti: string[]
  esclusi: number
  valute: string[]
  totale: number
  riepilogoChiavi: { campo: string; dentro: number; suPiuConti: number }[]
  globalmenteUnico: boolean
  confronti: number
  conCausale: number
  lunghezze: number[]
  conFattura: number
  conCifre: number
  entrate: number
  entrateConNome: number
  uscite: number
  usciteConNome: number
  campi: [string, number][]
  conAsterisco: number
  conEntrambe: number
  diverse: number
  codici: Map<string, { n: number; esempio: string }>
  movimentiPerCodice: Map<string, string[]>
  regole: number | null
}): string[] {
  const r: string[] = []
  const pc = (parte: number, tot: number) => percentuale(parte, tot)

  r.push(`# Referto sonda GoCardless — ${d.oggi}`)
  r.push('')
  r.push(
    'Fase 0 (spike) della spec `docs/superpowers/specs/2026-08-08-open-banking-gocardless-design.md`, ' +
      `su ${d.totale} movimenti reali di ${d.conti.length} conti.`
  )
  r.push('')
  r.push(
    '> **Questo è il referto pubblicabile.** Il repository è pubblico, quindi qui ci sono solo ' +
      'aggregati: nessun IBAN, nessun saldo, nessuna causale, nessuna controparte. Il referto ' +
      `completo, con i campioni in chiaro, è in \`scripts/gocardless/snapshots/referto-${d.oggi}.md\`, ` +
      'che il repository non traccia.'
  )
  r.push('')

  r.push('## 1. Istituto, storico, durata dell\'accesso')
  r.push('')
  r.push(`- \`institution_id\`: \`${d.stato.istituto?.id ?? '?'}\``)
  r.push(`- storico dichiarato dall'istituto: **${d.stato.istituto?.transactionTotalDays ?? '?'} giorni**`)
  r.push(`- storico concesso nell'agreement: ${d.agr?.max_historical_days ?? '?'} giorni`)
  r.push(`- accesso valido per: **${d.agr?.access_valid_for_days ?? '?'} giorni**`)
  r.push(`- scope: ${(d.agr?.access_scope ?? []).join(', ') || '?'}`)
  r.push('')
  r.push(
    'Due ipotesi della spec cadono qui. Non esiste un `institution_id` unico per l\'hub ICCREA: ' +
      'ogni BCC ha il proprio. E lo storico è di 90 giorni, non i 24 mesi che la spec dava per ' +
      'acquisiti — la data di taglio per conto serve ancora, ma il rischio di duplicare la prima ' +
      "nota copre un trimestre, non due anni. In compenso l'accesso dura 180 giorni: l'SCA si " +
      'rifà due volte l\'anno, e il banner di rinnovo va tarato su questo.'
  )
  r.push('')

  r.push('## 2. Conti')
  r.push('')
  r.push(`- conti analizzati: **${d.conti.length}**`)
  if (d.esclusi > 0) r.push(`- conti coperti dal consenso ma **esclusi**: ${d.esclusi}`)
  r.push(`- valute: ${d.valute.join(', ') || '?'}`)
  r.push(`- movimenti analizzati: **${d.totale}**`)
  r.push('')
  r.push(
    'La decisione presa a tavolino — un consenso solo copre tutti i conti dello stesso istituto — ' +
      'regge sul campo, ma ha un rovescio che la spec non aveva previsto: **il consenso si dà per ' +
      "home banking, non per conto**. Se nello stesso home banking convivono i conti dell'azienda e " +
      "un conto personale dell'amministratore, l'API li espone tutti. Quale conto entra nel " +
      'gestionale è quindi una scelta da fare **prima** della chiamata, non un filtro da applicare ' +
      'alla visualizzazione: su un conto personale la differenza fra non trattare un dato e ' +
      'trattarlo per poi nasconderlo non è di forma.'
  )
  r.push('')

  r.push('## 3. Chiavi: `transactionId` e `internalTransactionId`')
  r.push('')
  r.push('| campo | duplicati dentro un conto | valori ripetuti su più conti |')
  r.push('|---|---|---|')
  for (const k of d.riepilogoChiavi) {
    r.push(
      `| \`${k.campo}\` | ${k.dentro} | ${k.suPiuConti}${k.suPiuConti > 0 ? ' ⚠️' : ''} |`
    )
  }
  r.push('')
  if (!d.globalmenteUnico) {
    r.push(
      '**È il risultato che pesa di più su questa fase.** Entrambi gli id sono una chiave dentro ' +
        'il singolo conto e nessuno dei due lo è fra conti diversi: il formato è un contatore per ' +
        'giorno e per conto, quindi due movimenti senza alcun rapporto fra loro portano lo stesso ' +
        'valore. Il vincolo a database è oggi `@@unique([venueId, bankReference])` ' +
        '(`prisma/schema.prisma:1749`) e **non contiene il conto**: usando l\'id di GoCardless come ' +
        '`bankReference`, il secondo dei due movimenti sparirebbe come duplicato. ' +
        '`BankTransaction.bankAccountId` non è un miglioramento del modello, è la condizione perché ' +
        'la deduplicazione sia corretta; la chiave giusta è `(bankAccountId, transactionId)`.'
    )
  }
  r.push('')
  r.push(
    d.confronti === 0
      ? '- stabilità degli id nel tempo: **non ancora verificabile**, serve un secondo scarico a distanza'
      : `- stabilità degli id verificata su ${d.confronti} conti con due scarichi successivi`
  )
  r.push('')

  r.push('## 4. Causali')
  r.push('')
  r.push(`- \`remittanceInformationUnstructured\` valorizzata: **${pc(d.conCausale, d.totale)}**`)
  r.push(
    `- lunghezza: minima ${d.lunghezze[0] ?? 0}, mediana ${d.lunghezze[Math.floor(d.lunghezze.length / 2)] ?? 0}, ` +
      `massima ${d.lunghezze[d.lunghezze.length - 1] ?? 0} caratteri`
  )
  r.push(`- contiene un riferimento a fattura: **${pc(d.conFattura, d.conCausale)}**`)
  r.push(`- contiene sequenze di 3+ cifre: **${pc(d.conCifre, d.conCausale)}**`)
  r.push('')
  r.push(
    "La causale c'è sempre ed è lunga: il timore della spec, che arrivasse troncata o generica, " +
      "non si avvera. Quello che è troncato è l'etichetta iniziale del tipo di operazione, non il " +
      'resto.'
  )
  r.push('')

  r.push('## 5. Controparte: non arriva')
  r.push('')
  r.push(`- entrate (${d.entrate}): \`debtorName\` valorizzato in **${pc(d.entrateConNome, d.entrate)}**`)
  r.push(`- uscite (${d.uscite}): \`creditorName\` valorizzato in **${pc(d.usciteConNome, d.uscite)}**`)
  r.push('')
  r.push('Campi che la banca manda davvero — l\'elenco completo:')
  r.push('')
  r.push('| campo | presente in |')
  r.push('|---|---|')
  for (const [k, n] of [...d.campi].sort((a, b) => b[1] - a[1])) {
    r.push(`| \`${k}\` | ${pc(n, d.totale)} |`)
  }
  r.push('')
  r.push(
    'Nove campi, e `creditorName`, `debtorName`, `creditorAccount`, `debtorAccount` non sono fra ' +
      "questi: non sono vuoti, **non esistono proprio**. La Fase 4 della spec — estendere il match " +
      'delle regole al nome della controparte — non è rinviabile, è impraticabile così com\'è ' +
      `scritta. Il nome sta dentro la causale, dopo un \`*\` che compare nel **${pc(d.conAsterisco, d.totale)}** ` +
      'dei movimenti e separa l\'etichetta dell\'operazione dal resto: va estratto da lì.'
  )
  r.push('')

  r.push('## 6. Copertura delle regole di categorizzazione')
  r.push('')
  r.push(
    d.regole === null
      ? '**Non calcolata**: richiede la lettura di `categorization_rules`, fuori dal perimetro dello ' +
          'spike. Si ottiene con `--step=report --regole-da-db` (una `SELECT`, nessuna scrittura).'
      : `Calcolata su ${d.regole} regole attive. Numeri nel referto completo.`
  )
  r.push('')

  r.push('## 7. `bookingDate` contro `valueDate`')
  r.push('')
  r.push(`- entrambe presenti nel **${pc(d.conEntrambe, d.totale)}** dei movimenti`)
  r.push(`- differiscono nel **${pc(d.diverse, d.conEntrambe)}** dei casi`)
  r.push('')
  r.push(
    'Mappatura senza sorprese: `bookingDate → transaction_date` (la data che la prima nota usa già) ' +
      'e `valueDate → value_date`. Le due colonne esistono entrambe.'
  )
  r.push('')

  r.push('## 8. `proprietaryBankTransactionCode`: il segnale che non ci aspettavamo')
  r.push('')
  if (d.codici.size > 0) {
    r.push(
      `La banca classifica ogni movimento con un codice proprio: **${d.codici.size} codici distinti** ` +
        `sul 100% dei movimenti. Non è testo libero da indovinare, è una tassonomia che la banca ` +
        'assegna a monte.'
    )
    r.push('')
    r.push('| codice | movimenti | tipo di operazione |')
    r.push('|---|---|---|')
    for (const [k, v] of [...d.codici.entries()].sort((a, b) => b[1].n - a[1].n)) {
      const etichetta = prefissoComune(d.movimentiPerCodice.get(k) ?? [])
      r.push(`| \`${k}\` | ${v.n} | ${etichetta ? mascheraCausale(etichetta, new Set()) : '—'} |`)
    }
    r.push('')
    r.push(
      "> L'etichetta è il prefisso comune a tutte le causali dello stesso codice, calcolato solo " +
        'dai codici con almeno tre movimenti: è la parte fissa dell\'operazione, non la causale di ' +
        'un movimento vero.'
    )
    r.push('')
    r.push(
      'Vale la pena rileggere la Fase 4 alla luce di questa tabella. La controparte non arriva, ma ' +
        "arriva qualcosa che per l'imputazione contabile è più solido: commissioni, imposte, " +
        'stipendi, rate di mutuo, incassi POS, versamenti di contante e giroconti hanno ciascuno il ' +
        'proprio codice. Una mappa `codice → conto` prende con certezza la fetta che le keyword oggi ' +
        'prendono per approssimazione, e lascia al riconoscimento testuale solo bonifici e SDD, dove ' +
        'il fornitore va davvero identificato.'
    )
  } else {
    r.push('La banca non manda codici proprietari.')
  }
  r.push('')

  r.push('---')
  r.push('')
  r.push('Prodotto da `scripts/gocardless-probe.ts --step=report`. Nessuna scrittura sul database.')
  return r
}

function percentuale(parte: number, totale: number): string {
  if (totale === 0) return 'n/d'
  return `${((parte / totale) * 100).toFixed(1)}%`
}

function giorniFra(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
}

/** Un campione sparso, non i primi n: i primi sono tutti dello stesso giorno. */
function campione<T>(elenco: T[], quanti: number): T[] {
  if (elenco.length <= quanti) return elenco
  const passo = Math.floor(elenco.length / quanti)
  const fuori: T[] = []
  for (let i = 0; i < elenco.length && fuori.length < quanti; i += passo) fuori.push(elenco[i])
  return fuori
}

/**
 * La prima regola che intercetta il movimento, o null.
 * `conControparte` distingue il comportamento di oggi (solo descrizione) da
 * quello proposto per la Fase 4 (descrizione + nome della controparte).
 */
function regolaChePrende(m: Movimento, regole: Regola[], conControparte: boolean): Regola | null {
  const testo = (causale(m) + (conControparte ? ' ' + controparte(m) : '')).toLowerCase()
  const entrata = importo(m) >= 0
  for (const r of regole) {
    if (r.keywords.length === 0) continue
    if (!r.keywords.some((k) => testo.includes(k.toLowerCase()))) continue
    if (r.direction === 'INFLOW' && !entrata) continue
    if (r.direction === 'OUTFLOW' && entrata) continue
    return r
  }
  return null
}

/**
 * Le regole per la domanda 6, da file o — solo se richiesto esplicitamente —
 * dal database, in sola lettura. Il perimetro dello spike è "non toccare il
 * database": qui non si scrive nulla e non si passa dal client applicativo,
 * ma resta una scelta che va fatta a mano.
 */
async function caricaRegole(): Promise<Regola[] | null> {
  const daFile = argomento('regole') ?? join(DIR_SNAPSHOT, 'regole-categorizzazione.json')
  if (existsSync(daFile)) {
    try {
      const j = JSON.parse(readFileSync(daFile, 'utf8'))
      const arr = Array.isArray(j) ? j : j.regole
      if (Array.isArray(arr)) {
        console.log(`→ regole di categorizzazione lette da ${daFile.replace(RADICE + '/', '')}`)
        return arr as Regola[]
      }
    } catch {
      console.error(`⚠️  ${daFile} non è un JSON valido: ignorato.`)
    }
  }

  if (!flag('regole-da-db')) return null

  if (!process.env.DATABASE_URL) {
    console.error('⚠️  --regole-da-db richiesto ma DATABASE_URL non è impostata: salto la domanda 6.')
    return null
  }
  const { Pool } = await import('pg')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const host = new URL(process.env.DATABASE_URL).hostname
    console.log(`→ regole di categorizzazione: SELECT in sola lettura su ${host}`)
    const res = await pool.query(
      'SELECT name, direction, keywords FROM categorization_rules WHERE is_active = true ORDER BY priority ASC'
    )
    return res.rows.map((r: any) => ({
      name: r.name,
      direction: r.direction,
      keywords: Array.isArray(r.keywords) ? r.keywords : [],
    }))
  } catch (e) {
    console.error(`⚠️  Lettura delle regole fallita (${(e as Error).message}): salto la domanda 6.`)
    return null
  } finally {
    await pool.end()
  }
}

// ════════════════════════════════════════════════════════════════════════
//  FIXTURE ANONIMIZZATE (spec 0.5) — solo su richiesta esplicita
// ════════════════════════════════════════════════════════════════════════

const CHIAVI_DA_MASCHERARE_IBAN = new Set(['iban', 'bban', 'msisdn', 'maskedPan', 'pan'])
const CHIAVI_DA_MASCHERARE_NOME = new Set([
  'ownerName',
  'creditorName',
  'debtorName',
  'name',
  'displayName',
  'ownerAddressUnstructured',
])

function anonimizza(valore: unknown, nomiNoti: Set<string>, chiave?: string): unknown {
  if (Array.isArray(valore)) return valore.map((v) => anonimizza(v, nomiNoti))
  if (valore && typeof valore === 'object') {
    const fuori: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(valore as Record<string, unknown>)) {
      fuori[k] = anonimizza(v, nomiNoti, k)
    }
    return fuori
  }
  if (typeof valore !== 'string') return valore
  if (chiave && CHIAVI_DA_MASCHERARE_IBAN.has(chiave)) return mascheraIban(valore)
  if (chiave && CHIAVI_DA_MASCHERARE_NOME.has(chiave)) return mascheraNome(valore)
  if (chiave === 'resourceId') return '(mascherato)'
  return mascheraCausale(valore, nomiNoti)
}

function scriviFixture(
  conti: string[],
  dettagli: Map<string, any>,
  saldi: Map<string, any>,
  movimenti: Map<string, Movimento[]>,
  nomiNoti: Set<string>
) {
  mkdirSync(DIR_FIXTURE, { recursive: true })
  conti.forEach((c, i) => {
    const suffisso = `conto-${i + 1}`
    const scrivi = (nome: string, dato: unknown) => {
      if (dato === undefined || dato === null) return
      const f = join(DIR_FIXTURE, `${suffisso}-${nome}.json`)
      writeFileSync(f, JSON.stringify(anonimizza(dato, nomiNoti), null, 2))
      console.log(`   fixture: ${f.replace(RADICE + '/', '')}`)
    }
    scrivi('details', dettagli.get(c))
    scrivi('balances', saldi.get(c))
    const mov = movimenti.get(c)
    if (mov) scrivi('transactions', { transactions: { booked: mov.slice(0, 50), pending: [] } })
  })
  console.log('')
  console.log('⚠️  Le fixture sono TRACCIATE dal repository: rileggile prima di committarle.')
}

// ════════════════════════════════════════════════════════════════════════
//  MAIN
// ════════════════════════════════════════════════════════════════════════

async function main() {
  if (!existsSync(join(RADICE, 'package.json'))) {
    console.error('❌ Lanciami dalla radice del progetto: leggo .env e scrivo percorsi relativi.')
    process.exit(1)
  }

  validaArgomenti()

  if (flag('aiuto') || process.argv.length <= 2) {
    stampaAiuto()
    return
  }

  const stato = leggiStato()

  // La selezione dei conti si applica da sola, senza bisogno di uno step:
  // è una modifica allo stato, non una chiamata all'API.
  if (applicaSelezione(stato) && !argomento('step')) return

  const passo = argomento('step') as Passo | undefined
  if (!passo || !PASSI.includes(passo)) {
    console.error(`❌ --step mancante o sconosciuto. Ammessi: ${PASSI.join(', ')}`)
    process.exit(1)
  }

  console.log('')
  console.log('═'.repeat(78))
  console.log(`  Sonda GoCardless — passo: ${passo}`)
  console.log(`  Snapshot in ${DIR_SNAPSHOT.replace(RADICE + '/', '')}`)
  console.log('═'.repeat(78))
  console.log('')

  switch (passo) {
    case 'institutions':
      await passoIstituzioni(stato)
      break
    case 'consent':
      await passoConsenso(stato)
      break
    case 'accounts':
      await passoConti(stato)
      break
    case 'fetch':
      await passoScarico(stato)
      break
    case 'report':
      await passoReferto(stato)
      break
  }
}

main().catch((e) => {
  console.error('❌ Errore inatteso:', e)
  process.exitCode = 1
})
