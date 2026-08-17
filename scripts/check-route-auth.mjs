#!/usr/bin/env node
/**
 * Censimento dell'autorizzazione sulle route API.
 *
 * L'audit di agosto 2026 ha trovato la stessa falla ripetuta: gli helper di
 * autorizzazione esistevano, erano scritti bene ed erano usati in una route su
 * duecento, mentre tutte le altre riscrivevano a mano `const session = await
 * auth()` e il controllo di ruolo, quando c'era, in forme sempre diverse. Un
 * controllo copiato duecento volte non si può verificare a occhio: questo
 * script lo conta.
 *
 * Per ogni metodo HTTP esportato da una route classifica il guard in uso:
 *
 *   withAuth   il guard centralizzato di src/lib/api-utils.ts
 *   inline     `auth()` / `getServerSession()` riscritto a mano nel corpo
 *   assente    nessun controllo di alcun tipo
 *   pubblica   esente per scelta (elenco in src/middleware.ts)
 *
 * Senza argomenti è solo un rapporto e non fa fallire nulla.
 *
 * Con `--ratchet` esce 1 se il numero da convertire **sale** sopra la baseline
 * qui sotto: è la forma che gira in CI oggi. Con `--strict` esce 1 se ne resta
 * anche uno solo: è la meta, e diventerà la forma in CI quando la baseline
 * arriverà a zero.
 *
 * PERCHÉ UN CRICCHETTO E NON DIRETTAMENTE --strict
 * Aspettare la conversione di tutti per accendere il gate ha un costo che si
 * misura: il documento d'audit ne contava 255, e senza nulla che lo impedisse
 * sono diventati 260 mentre la conversione era «in corso». Il cricchetto ferma
 * la crescita subito — chi aggiunge una route deve usare withAuth — e lascia
 * che la conversione proceda a lotti invece che in un big bang.
 *
 * COME AGGIORNARE LA BASELINE
 * Solo verso il basso, come per audit-ratchet.mjs. Dopo aver convertito degli
 * handler, esegui `node scripts/check-route-auth.mjs` e riporta il numero.
 * Alzarla per far passare la CI vanifica il cricchetto: se il tuo commit la
 * supera, la route nuova va scritta con withAuth, non tollerata.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const API_DIR = join(ROOT, 'src', 'app', 'api')
const MIDDLEWARE = join(ROOT, 'src', 'middleware.ts')

const METODI_HTTP = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

/**
 * Percorsi esenti dall'autenticazione, letti da src/middleware.ts invece che
 * ricopiati: due elenchi che divergono in silenzio sarebbero peggio di nessun
 * elenco. Comprendono NextAuth, il recupero password, il completamento invito e
 * i cron chiamati da fuori, che si difendono con CRON_SECRET.
 */
function percorsiPubblici() {
  const sorgente = readFileSync(MIDDLEWARE, 'utf8')
  const blocco = sorgente.match(/const PUBLIC_PREFIXES\s*=\s*\[([\s\S]*?)\]/)

  if (!blocco) {
    throw new Error(
      "PUBLIC_PREFIXES non trovato in src/middleware.ts: l'elenco delle route " +
        'pubbliche è cambiato di forma e questo script va aggiornato.'
    )
  }

  // I commenti vanno tolti prima di cercare le stringhe: dentro l'array ce n'è
  // uno che contiene un apostrofo («nell'header Authorization»), e per la regex
  // quell'apostrofo aprirebbe una stringa, facendo sparire dall'elenco proprio
  // le route dei cron che seguono.
  const senzaCommenti = blocco[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  return [...senzaCommenti.matchAll(/['"]([^'"]+)['"]/g)]
    .map((m) => m[1])
    .filter((p) => p.startsWith('/api/'))
}

function fileDelleRoute(dir) {
  const trovati = []

  for (const voce of readdirSync(dir)) {
    const percorso = join(dir, voce)
    if (statSync(percorso).isDirectory()) {
      trovati.push(...fileDelleRoute(percorso))
    } else if (voce === 'route.ts' || voce === 'route.tsx') {
      trovati.push(percorso)
    }
  }

  return trovati
}

/** src/app/api/chiusure/[id]/pdf/route.ts → /api/chiusure/[id]/pdf */
function percorsoApi(file) {
  const relativo = relative(join(ROOT, 'src', 'app'), file)
  return (
    '/' +
    relativo
      .split(sep)
      .slice(0, -1)
      // I gruppi di rotta (dashboard) non compaiono nell'URL
      .filter((segmento) => !segmento.startsWith('('))
      .join('/')
  )
}

/**
 * Ritaglia il corpo di ciascun metodo esportato usando come confine l'export
 * successivo. Non è un parser TypeScript, ma per la domanda che poniamo — quale
 * guard compare in questo handler — un confine di export è sufficiente e non
 * richiede di trascinarsi dietro un albero sintattico.
 */
function handlerEsportati(sorgente) {
  const trovati = []
  const regex = new RegExp(
    `export\\s+(?:async\\s+function|const|function)\\s+(${METODI_HTTP.join('|')})\\b`,
    'g'
  )

  for (const corrispondenza of sorgente.matchAll(regex)) {
    trovati.push({ metodo: corrispondenza[1], inizio: corrispondenza.index })
  }

  // Anche `export { handlers.GET as GET }` e simili riesportazioni
  for (const corrispondenza of sorgente.matchAll(
    new RegExp(`export\\s*\\{[^}]*\\b(${METODI_HTTP.join('|')})\\b[^}]*\\}`, 'g')
  )) {
    for (const metodo of METODI_HTTP) {
      if (corrispondenza[0].includes(metodo)) {
        trovati.push({ metodo, inizio: corrispondenza.index })
      }
    }
  }

  trovati.sort((a, b) => a.inizio - b.inizio)

  return trovati.map((handler, i) => ({
    metodo: handler.metodo,
    inizio: handler.inizio,
    corpo: sorgente.slice(handler.inizio, trovati[i + 1]?.inizio ?? sorgente.length),
  }))
}

function contieneAuth(testo) {
  return (
    /\b(auth|getServerSession)\s*\(\s*\)/.test(testo) ||
    /\brequire(Auth|Role|VenueAccess)\s*\(/.test(testo)
  )
}

function contieneSegretoCron(testo) {
  return /CRON_SECRET/.test(testo)
}

/**
 * Diverse route non chiamano `auth()` nell'handler ma in una funzione dichiarata
 * in cima al file (spesso si chiama `guard`). Senza riconoscerle risulterebbero
 * prive di qualsiasi controllo, che è l'errore opposto a quello che cerchiamo.
 *
 * Vale anche per i cron: `POST /api/saldi/riporto-anno/cron` verifica
 * `CRON_SECRET` dentro `verificaSegretoCron()`, dichiarata nel preambolo, e
 * veniva riportata come «nessun controllo di accesso» pur essendo protetta
 * esattamente come gli altri due cron. Uno strumento di sicurezza che accusa
 * il codice sano manda a caccia di fantasmi e, alla lunga, insegna a non
 * credergli.
 */
function helperDiAutorizzazione(preambolo) {
  const definizioni = []
  const regex = /(?:async\s+)?function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\(/g

  for (const corrispondenza of preambolo.matchAll(regex)) {
    definizioni.push({
      nome: corrispondenza[1] ?? corrispondenza[2],
      inizio: corrispondenza.index,
    })
  }

  const corpoDi = (definizione, i) =>
    preambolo.slice(definizione.inizio, definizioni[i + 1]?.inizio ?? preambolo.length)

  const locali = definizioni
    .filter((definizione, i) => contieneAuth(corpoDi(definizione, i)))
    .map((definizione) => definizione.nome)

  const localiCron = definizioni
    .filter((definizione, i) => contieneSegretoCron(corpoDi(definizione, i)))
    .map((definizione) => definizione.nome)

  // Alcune route condividono il guard con la route padre importandolo
  // (`import { guardAdminManager } from '../route'`). Il nome è l'unico indizio
  // che abbiamo senza seguire gli import: ci accontentiamo, perché il costo di
  // un falso positivo qui è dichiarare protetto ciò che lo è davvero.
  const importati = [...preambolo.matchAll(/import\s*\{([^}]+)\}\s*from/g)]
    .flatMap((corrispondenza) => corrispondenza[1].split(','))
    .map((nome) => nome.trim().split(/\s+as\s+/).pop().trim())
    .filter((nome) => /guard|^require|auth/i.test(nome))

  return { auth: [...locali, ...importati], cron: localiCron }
}

const chiama = (corpo, nome) => new RegExp(`\\b${nome}\\s*\\(`).test(corpo)

function classifica(corpo, helper) {
  if (/\bwithAuth\s*[<(]/.test(corpo)) return 'withAuth'
  if (contieneAuth(corpo)) return 'inline'
  if (helper.auth.some((nome) => chiama(corpo, nome))) return 'inline'
  // I cron sono chiamati da fuori, senza cookie: si difendono con un segreto
  // condiviso invece che con la sessione. Il segreto può essere verificato nel
  // corpo o in un helper del preambolo: entrambe le forme sono in uso.
  if (contieneSegretoCron(corpo)) return 'cron'
  if (helper.cron.some((nome) => chiama(corpo, nome))) return 'cron'
  return 'assente'
}

function analizza() {
  const pubblici = percorsiPubblici()
  const risultati = []

  for (const file of fileDelleRoute(API_DIR).sort()) {
    const percorso = percorsoApi(file)
    const sorgente = readFileSync(file, 'utf8')
    const pubblica = pubblici.some((p) => percorso === p || percorso.startsWith(p + '/'))

    const handlers = handlerEsportati(sorgente)
    const helper = helperDiAutorizzazione(sorgente.slice(0, handlers[0]?.inizio ?? sorgente.length))

    const classificati = handlers.map((handler) => ({
      percorso,
      file: relative(ROOT, file),
      metodo: handler.metodo,
      corpo: handler.corpo,
      guard: pubblica ? 'pubblica' : classifica(handler.corpo, helper),
    }))

    // Alcuni metodi sono alias di un altro dello stesso file (`PATCH` che
    // richiama `PUT`): ereditano il guard di chi fa il lavoro.
    for (const handler of classificati) {
      if (handler.guard !== 'assente') continue

      const delegato = classificati.find(
        (altro) =>
          altro.metodo !== handler.metodo &&
          new RegExp(`\\b${altro.metodo}\\s*\\(`).test(handler.corpo)
      )
      if (delegato) handler.guard = delegato.guard
    }

    risultati.push(...classificati.map(({ corpo: _corpo, ...resto }) => resto))
  }

  return risultati
}

function stampa(risultati) {
  const perGuard = (nome) => risultati.filter((r) => r.guard === nome)
  const withAuthN = perGuard('withAuth')
  const inline = perGuard('inline')
  const assenti = perGuard('assente')
  const pubbliche = perGuard('pubblica')
  const cron = perGuard('cron')

  const routeUniche = new Set(risultati.map((r) => r.percorso)).size

  console.log('\nAutorizzazione delle route API\n')
  console.log(`  route            ${routeUniche}`)
  console.log(`  handler          ${risultati.length}\n`)
  console.log(`  withAuth         ${withAuthN.length}`)
  console.log(`  auth() inline    ${inline.length}`)
  console.log(`  nessun controllo ${assenti.length}`)
  console.log(`  pubbliche        ${pubbliche.length}`)
  console.log(`  cron (CRON_SECRET) ${cron.length}`)

  if (assenti.length > 0) {
    console.log('\nHandler senza alcun controllo di accesso:')
    for (const r of assenti) {
      console.log(`  ${r.metodo.padEnd(6)} ${r.percorso}`)
    }
  }

  const daConvertire = inline.length + assenti.length
  console.log(
    `\n${withAuthN.length} handler su ${withAuthN.length + daConvertire} usano il guard ` +
      `centralizzato; ne restano ${daConvertire} da convertire.\n`
  )

  return daConvertire
}

/**
 * Handler ancora da convertire tollerati. Solo verso il basso: vedi l'intestazione.
 */
const BASELINE = 248

const risultati = analizza()
const daConvertire = stampa(risultati)

// `--elenco` serve a lavorare a lotti: raggruppa per file gli handler da
// convertire, così un lotto può essere «tutte le route di questo dominio».
if (process.argv.includes('--elenco')) {
  const perFile = new Map()
  for (const r of risultati) {
    if (r.guard !== 'inline' && r.guard !== 'assente') continue
    perFile.set(r.file, [...(perFile.get(r.file) ?? []), r.metodo])
  }

  console.log(`Da convertire, ${perFile.size} file:\n`)
  for (const [file, metodi] of [...perFile].sort()) {
    console.log(`  ${metodi.join(',').padEnd(22)} ${file}`)
  }
  console.log()
}

if (process.argv.includes('--strict') && daConvertire > 0) {
  console.error(
    `Modalità strict: ${daConvertire} handler non passano da withAuth.\n` +
      'Convertili con withAuth(handler, { roles, venueScoped }) — vedi src/lib/api-utils.ts.\n'
  )
  process.exit(1)
}

if (process.argv.includes('--ratchet')) {
  if (daConvertire > BASELINE) {
    console.error(
      `Cricchetto: ${daConvertire} handler da convertire, la baseline è ${BASELINE}.\n` +
        `Ne sono comparsi ${daConvertire - BASELINE} di nuovi senza withAuth.\n` +
        'Scrivi la route con withAuth(handler, { roles, venueScoped }) — vedi src/lib/api-utils.ts.\n' +
        'Alzare la baseline NON è la soluzione: vanifica il cricchetto.\n'
    )
    process.exit(1)
  }

  if (daConvertire < BASELINE) {
    console.log(
      `Cricchetto: ${BASELINE - daConvertire} handler in meno della baseline.\n` +
        `Abbassa BASELINE a ${daConvertire} in scripts/check-route-auth.mjs.\n`
    )
  } else {
    console.log(`Cricchetto: ${daConvertire} da convertire, pari alla baseline.\n`)
  }
}
