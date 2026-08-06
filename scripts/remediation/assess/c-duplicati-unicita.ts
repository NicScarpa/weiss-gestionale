/**
 * Censimento (c): duplicati che impedirebbero i nuovi vincoli di unicità.
 *
 * SOLA LETTURA. Solo SELECT attraverso `SolaLettura`.
 *
 * Gli indici unici in preparazione non possono nascere su una tabella che
 * contiene già righe in conflitto: la loro creazione fallirebbe, e con essa la
 * migrazione. Questo censimento serve a saperlo prima, non durante.
 *
 * Criterio per dire che una riga è corrotta
 * -----------------------------------------
 * Qui il criterio è meccanico e non ammette interpretazioni: due o più righe
 * condividono la chiave che sta per diventare unica. Il giudizio si sposta
 * tutto sulla domanda successiva, cioè se il duplicato si possa eliminare da
 * solo. La regola adottata è:
 *
 *   se al massimo una riga del gruppo ha collegamenti (pagamenti, movimenti,
 *   scadenze generate, righe di dettaglio), il gruppo è risolvibile
 *   automaticamente: si tiene quella collegata, o in mancanza la più vecchia,
 *   e si eliminano le altre;
 *
 *   se due o più righe hanno collegamenti, la scelta è del titolare: eliminare
 *   una delle due significherebbe orfanare dei dati contabili.
 *
 * Perimetro: si guardano le righe vive, perché è su quelle che l'indice unico
 * parziale andrà a mordere. Le righe cancellate logicamente vengono contate a
 * parte, perché un indice unico totale — senza clausola `WHERE deleted_at IS
 * NULL` — fallirebbe anche a causa loro.
 */

import type { SolaLettura } from './lib/db'
import type { Censimento, Esito, Opzioni } from './lib/tipi'
import { intero, sezione, tabella, testo, titolo, voci } from './lib/format'
import { pivaNormalizzata } from './lib/piva'

interface RigaDuplicata {
  id: string
  collegamenti: number
  [chiave: string]: unknown
}

interface GruppoDuplicati {
  chiave: Record<string, unknown>
  conteggio: number
  righe: RigaDuplicata[]
}

interface Controllo {
  nome: string
  tabelle: string[]
  chiave: string
  spiegazione: string
  sql: string
  parametri?: unknown[]
}

const CONTROLLI: Controllo[] = [
  {
    nome: 'riconciliazioni-doppie',
    tabelle: ['schedule_reconciliations'],
    chiave: '(schedule_id, journal_entry_id) fra le riconciliazioni VERIFIED',
    spiegazione:
      'Lo stesso movimento abbinato due volte alla stessa scadenza: la scadenza risulta pagata il doppio.',
    sql: `
WITH base AS (
  SELECT
    sr.id,
    sr.schedule_id,
    sr.journal_entry_id,
    sr.amount,
    sr.source::text AS origine,
    sr.payment_id,
    sr.created_at,
    (CASE WHEN sr.payment_id IS NOT NULL THEN 1 ELSE 0 END)
      + (SELECT COUNT(*) FROM journal_entry_allocations a WHERE a.reconciliation_id = sr.id) AS collegamenti
  FROM schedule_reconciliations sr
  WHERE sr.status = 'VERIFIED'
)
SELECT
  json_build_object('schedule_id', b.schedule_id, 'journal_entry_id', b.journal_entry_id) AS chiave,
  COUNT(*)::int AS conteggio,
  json_agg(json_build_object(
    'id', b.id,
    'importo', b.amount::text,
    'origine', b.origine,
    'pagamento_collegato', (b.payment_id IS NOT NULL),
    'collegamenti', b.collegamenti,
    'creata_il', to_char(b.created_at, 'YYYY-MM-DD HH24:MI')
  ) ORDER BY b.created_at) AS righe
FROM base b
GROUP BY b.schedule_id, b.journal_entry_id
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC
`,
  },
  {
    nome: 'fatture-doppie',
    tabelle: ['electronic_invoices'],
    chiave: '(numero, data, partita IVA normalizzata) fra le fatture elettroniche vive',
    spiegazione:
      'La stessa fattura importata più volte: il costo è contato due volte e possono nascere scadenze doppie.',
    sql: `
WITH base AS (
  SELECT
    ei.id,
    ei.invoice_number,
    ei.invoice_date,
    ei.supplier_vat,
    ei.supplier_name,
    ei.total_amount,
    ei.status::text AS stato,
    ei.venue_id,
    ei.imported_at,
    ${pivaNormalizzata('ei.supplier_vat')} AS piva_normalizzata,
    (CASE WHEN ei.journal_entry_id IS NOT NULL THEN 1 ELSE 0 END)
      + (SELECT COUNT(*) FROM schedules s WHERE s.invoice_id = ei.id AND s.deleted_at IS NULL)
      + (SELECT COUNT(*) FROM invoice_deadlines d WHERE d.invoice_id = ei.id)
      + (SELECT COUNT(*) FROM invoice_line_accounts la WHERE la.invoice_id = ei.id) AS collegamenti
  FROM electronic_invoices ei
  WHERE ei.deleted_at IS NULL
)
SELECT
  json_build_object(
    'numero', b.invoice_number,
    'data', b.invoice_date::text,
    'piva_normalizzata', b.piva_normalizzata
  ) AS chiave,
  COUNT(*)::int AS conteggio,
  json_agg(json_build_object(
    'id', b.id,
    'fornitore', b.supplier_name,
    'piva_originale', b.supplier_vat,
    'importo', b.total_amount::text,
    'stato', b.stato,
    'sede_id', b.venue_id,
    'collegamenti', b.collegamenti,
    'importata_il', to_char(b.imported_at, 'YYYY-MM-DD HH24:MI')
  ) ORDER BY b.imported_at) AS righe
FROM base b
GROUP BY b.invoice_number, b.invoice_date, b.piva_normalizzata
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC
`,
  },
  {
    nome: 'scadenze-ricorrenti-doppie',
    tabelle: ['schedules'],
    chiave: '(recurrence_id, data_scadenza) fra le scadenze vive generate da una ricorrenza',
    spiegazione:
      'La stessa rata della ricorrenza generata due volte: il previsionale conta l\'uscita due volte.',
    sql: `
WITH base AS (
  SELECT
    s.id,
    s.recurrence_id,
    s.data_scadenza,
    s.descrizione,
    s.stato,
    s.importo_totale,
    s.importo_pagato,
    s.created_at,
    (SELECT COUNT(*) FROM schedule_payments sp WHERE sp.schedule_id = s.id)
      + (SELECT COUNT(*) FROM schedule_reconciliations sr WHERE sr.schedule_id = s.id)
      + (CASE WHEN s.importo_pagato > 0 THEN 1 ELSE 0 END) AS collegamenti
  FROM schedules s
  WHERE s.deleted_at IS NULL AND s.recurrence_id IS NOT NULL
)
SELECT
  json_build_object('recurrence_id', b.recurrence_id, 'data_scadenza', b.data_scadenza::text) AS chiave,
  COUNT(*)::int AS conteggio,
  json_agg(json_build_object(
    'id', b.id,
    'descrizione', b.descrizione,
    'stato', b.stato,
    'importo', b.importo_totale::text,
    'pagato', b.importo_pagato::text,
    'collegamenti', b.collegamenti,
    'creata_il', to_char(b.created_at, 'YYYY-MM-DD HH24:MI')
  ) ORDER BY b.created_at) AS righe
FROM base b
GROUP BY b.recurrence_id, b.data_scadenza
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC
`,
  },
  {
    nome: 'chiusure-doppie',
    tabelle: ['daily_closures'],
    chiave: '(venue_id, date) fra le chiusure di cassa vive',
    spiegazione: 'Due chiusure di cassa per la stessa sede e lo stesso giorno: gli incassi sono contati due volte.',
    sql: `
WITH base AS (
  SELECT
    dc.id,
    dc.venue_id,
    dc.date,
    dc.status::text AS stato,
    dc.created_at,
    (SELECT COUNT(*) FROM journal_entries je WHERE je.closure_id = dc.id AND je.deleted_at IS NULL)
      + (SELECT COUNT(*) FROM cash_stations cs WHERE cs.closure_id = dc.id) AS collegamenti
  FROM daily_closures dc
  WHERE dc.deleted_at IS NULL
)
SELECT
  json_build_object('venue_id', b.venue_id, 'data', b.date::text) AS chiave,
  COUNT(*)::int AS conteggio,
  json_agg(json_build_object(
    'id', b.id,
    'stato', b.stato,
    'collegamenti', b.collegamenti,
    'creata_il', to_char(b.created_at, 'YYYY-MM-DD HH24:MI')
  ) ORDER BY b.created_at) AS righe
FROM base b
GROUP BY b.venue_id, b.date
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC
`,
  },
  {
    nome: 'budget-doppi',
    tabelle: ['budgets'],
    chiave: '(venue_id, year) fra i budget vivi',
    spiegazione: 'Due budget per la stessa sede e lo stesso anno: i confronti con il consuntivo diventano ambigui.',
    sql: `
WITH base AS (
  SELECT
    bg.id,
    bg.venue_id,
    bg.year,
    bg.name,
    bg.status::text AS stato,
    bg.created_at,
    (SELECT COUNT(*) FROM budget_lines bl WHERE bl.budget_id = bg.id)
      + (SELECT COUNT(*) FROM budget_alerts ba WHERE ba.budget_id = bg.id) AS collegamenti
  FROM budgets bg
  WHERE bg.deleted_at IS NULL
)
SELECT
  json_build_object('venue_id', b.venue_id, 'anno', b.year) AS chiave,
  COUNT(*)::int AS conteggio,
  json_agg(json_build_object(
    'id', b.id,
    'nome', b.name,
    'stato', b.stato,
    'collegamenti', b.collegamenti,
    'creato_il', to_char(b.created_at, 'YYYY-MM-DD HH24:MI')
  ) ORDER BY b.created_at) AS righe
FROM base b
GROUP BY b.venue_id, b.year
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC
`,
  },
  {
    nome: 'movimenti-banca-doppi-riferimento',
    tabelle: ['bank_transactions'],
    chiave: '(venue_id, bank_reference) fra i movimenti bancari vivi con riferimento valorizzato',
    spiegazione:
      'Il vincolo attuale non copre i riferimenti nulli: qui si controlla che almeno quelli valorizzati siano unici.',
    sql: `
WITH base AS (
  SELECT
    bt.id,
    bt.venue_id,
    bt.bank_reference,
    bt.transaction_date,
    bt.amount,
    bt.description,
    bt.status::text AS stato,
    (CASE WHEN bt.matched_entry_id IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN bt.status <> 'PENDING' THEN 1 ELSE 0 END) AS collegamenti
  FROM bank_transactions bt
  WHERE bt.deleted_at IS NULL AND bt.bank_reference IS NOT NULL
)
SELECT
  json_build_object('venue_id', b.venue_id, 'riferimento', b.bank_reference) AS chiave,
  COUNT(*)::int AS conteggio,
  json_agg(json_build_object(
    'id', b.id,
    'data', b.transaction_date::text,
    'importo', b.amount::text,
    'descrizione', b.description,
    'stato', b.stato,
    'collegamenti', b.collegamenti
  ) ORDER BY b.transaction_date) AS righe
FROM base b
GROUP BY b.venue_id, b.bank_reference
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC
`,
  },
  {
    nome: 'movimenti-banca-doppi-naturale',
    tabelle: ['bank_transactions'],
    chiave: '(venue_id, transaction_date, amount, description) fra i movimenti bancari vivi',
    spiegazione:
      'È la chiave con cui l\'import scarta i duplicati: se qui ci sono gruppi, lo stesso estratto conto è stato caricato due volte aggirando quel controllo.',
    sql: `
WITH base AS (
  SELECT
    bt.id,
    bt.venue_id,
    bt.transaction_date,
    bt.amount,
    bt.description,
    bt.bank_reference,
    bt.status::text AS stato,
    bt.import_batch_id,
    (CASE WHEN bt.matched_entry_id IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN bt.status <> 'PENDING' THEN 1 ELSE 0 END) AS collegamenti
  FROM bank_transactions bt
  WHERE bt.deleted_at IS NULL
)
SELECT
  json_build_object(
    'venue_id', b.venue_id,
    'data', b.transaction_date::text,
    'importo', b.amount::text,
    'descrizione', b.description
  ) AS chiave,
  COUNT(*)::int AS conteggio,
  json_agg(json_build_object(
    'id', b.id,
    'riferimento', b.bank_reference,
    'stato', b.stato,
    'import_batch_id', b.import_batch_id,
    'collegamenti', b.collegamenti
  ) ORDER BY b.id) AS righe
FROM base b
GROUP BY b.venue_id, b.transaction_date, b.amount, b.description
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC
`,
  },
]

/**
 * Righe cancellate logicamente per tabella: un indice unico totale fallirebbe
 * anche per loro, uno parziale con `WHERE deleted_at IS NULL` no. Sapere
 * quante sono decide quale dei due si può creare.
 */
const SQL_CANCELLATE = `
SELECT 'electronic_invoices' AS tabella, COUNT(*)::int AS cancellate FROM electronic_invoices WHERE deleted_at IS NOT NULL
UNION ALL
SELECT 'schedules', COUNT(*)::int FROM schedules WHERE deleted_at IS NOT NULL
UNION ALL
SELECT 'daily_closures', COUNT(*)::int FROM daily_closures WHERE deleted_at IS NOT NULL
UNION ALL
SELECT 'budgets', COUNT(*)::int FROM budgets WHERE deleted_at IS NOT NULL
UNION ALL
SELECT 'bank_transactions', COUNT(*)::int FROM bank_transactions WHERE deleted_at IS NOT NULL
ORDER BY 1
`

/** Vincoli di unicità già presenti: un risultato vuoto può voler dire "già impedito". */
const SQL_VINCOLI = `
SELECT
  i.tablename  AS tabella,
  i.indexname  AS indice,
  i.indexdef   AS definizione
FROM pg_indexes i
WHERE i.schemaname = 'public'
  AND i.tablename = ANY($1::text[])
  AND i.indexdef LIKE '%UNIQUE%'
ORDER BY i.tablename, i.indexname
`

function risolvibileAutomaticamente(gruppo: GruppoDuplicati): boolean {
  return gruppo.righe.filter((riga) => Number(riga.collegamenti) > 0).length <= 1
}

async function esegui(db: SolaLettura, opzioni: Opzioni): Promise<Esito> {
  const tabelle = [...new Set(CONTROLLI.flatMap((controllo) => controllo.tabelle))].sort()
  const vincoli = await db.query<{ tabella: string; indice: string; definizione: string }>(
    SQL_VINCOLI,
    [tabelle]
  )
  const cancellate = await db.query<{ tabella: string; cancellate: number }>(SQL_CANCELLATE)

  const esiti: Array<{
    nome: string
    chiave: string
    spiegazione: string
    gruppi: number
    righe_in_eccesso: number
    automatici: number
    da_decidere: number
    dettaglio: Array<GruppoDuplicati & { risolvibile_automaticamente: boolean }>
  }> = []

  for (const controllo of CONTROLLI) {
    const gruppi = await db.query<GruppoDuplicati>(controllo.sql, controllo.parametri ?? [])
    const dettaglio = gruppi.map((gruppo) => ({
      ...gruppo,
      risolvibile_automaticamente: risolvibileAutomaticamente(gruppo),
    }))
    esiti.push({
      nome: controllo.nome,
      chiave: controllo.chiave,
      spiegazione: controllo.spiegazione,
      gruppi: dettaglio.length,
      righe_in_eccesso: dettaglio.reduce((totale, gruppo) => totale + gruppo.conteggio - 1, 0),
      automatici: dettaglio.filter((gruppo) => gruppo.risolvibile_automaticamente).length,
      da_decidere: dettaglio.filter((gruppo) => !gruppo.risolvibile_automaticamente).length,
      dettaglio,
    })
  }

  const totaleGruppi = esiti.reduce((totale, esito) => totale + esito.gruppi, 0)

  const testoRapporto: string[] = [
    ...titolo('Censimento (c) — duplicati che impedirebbero i nuovi vincoli di unicità'),
    '',
    'Criterio: due o più righe vive condividono la chiave che sta per diventare',
    'unica. Un gruppo è risolvibile da solo quando al massimo una delle righe ha',
    'dati collegati; se ne hanno due o più, eliminarne una lascerebbe orfani dei',
    'dati contabili e la scelta spetta al titolare.',
    '',
    ...voci([
      ['Chiavi controllate', intero(CONTROLLI.length)],
      ['Gruppi di duplicati trovati', intero(totaleGruppi)],
      [
        'Righe da eliminare in totale',
        intero(esiti.reduce((totale, esito) => totale + esito.righe_in_eccesso, 0)),
      ],
    ]),
  ]

  testoRapporto.push(
    ...sezione('Riepilogo per chiave'),
    ...tabella(
      [
        { etichetta: 'Controllo', valore: (r: (typeof esiti)[number]) => r.nome, massimo: 34 },
        { etichetta: 'Gruppi', valore: (r) => intero(r.gruppi), allinea: 'dx' },
        { etichetta: 'Righe in eccesso', valore: (r) => intero(r.righe_in_eccesso), allinea: 'dx' },
        { etichetta: 'Automatici', valore: (r) => intero(r.automatici), allinea: 'dx' },
        { etichetta: 'Da decidere', valore: (r) => intero(r.da_decidere), allinea: 'dx' },
      ],
      esiti
    )
  )

  for (const esito of esiti) {
    if (esito.gruppi === 0) continue
    const mostrati = esito.dettaglio.slice(0, opzioni.esempi)
    testoRapporto.push(
      ...sezione(`${esito.nome} — ${esito.gruppi === 1 ? '1 gruppo' : `${intero(esito.gruppi)} gruppi`}`),
      `  Chiave: ${esito.chiave}`,
      `  ${esito.spiegazione}`,
      ''
    )
    for (const gruppo of mostrati) {
      testoRapporto.push(
        `  Chiave in conflitto: ${descriviChiave(gruppo.chiave)}` +
          `  →  ${gruppo.risolvibile_automaticamente ? 'risolvibile automaticamente' : 'DECISIONE UMANA'}`,
        ...tabella(
          [
            { etichetta: 'id', valore: (r: RigaDuplicata) => String(r.id), massimo: 27 },
            { etichetta: 'Collegamenti', valore: (r) => intero(r.collegamenti), allinea: 'dx' },
            { etichetta: 'Dettaglio', valore: (r) => descriviRiga(r), massimo: 62 },
          ],
          gruppo.righe
        ),
        ''
      )
    }
    if (mostrati.length < esito.gruppi) {
      testoRapporto.push(`  … altri ${intero(esito.gruppi - mostrati.length)} gruppi nel file JSON.`, '')
    }
  }

  testoRapporto.push(
    ...sezione('Vincoli di unicità già presenti sulle tabelle interessate'),
    '  Se una chiave non presenta duplicati può essere perché non ce ne sono, o',
    '  perché un vincolo li impedisce già: questa tabella distingue i due casi.',
    '',
    ...tabella(
      [
        { etichetta: 'Tabella', valore: (r: (typeof vincoli)[number]) => r.tabella },
        { etichetta: 'Indice', valore: (r) => r.indice, massimo: 40 },
        { etichetta: 'Definizione', valore: (r) => r.definizione.replace(/^CREATE /, ''), massimo: 74 },
      ],
      vincoli
    )
  )

  testoRapporto.push(
    ...sezione('Righe cancellate logicamente'),
    '  Un indice unico totale fallirebbe anche a causa di queste; uno parziale con',
    '  la clausola "WHERE deleted_at IS NULL" le ignora.',
    '',
    ...tabella(
      [
        { etichetta: 'Tabella', valore: (r: (typeof cancellate)[number]) => r.tabella },
        { etichetta: 'Righe cancellate', valore: (r) => intero(r.cancellate), allinea: 'dx' },
      ],
      cancellate
    )
  )

  return {
    testo: testoRapporto,
    anomalie: totaleGruppi,
    dati: {
      criterio:
        'GROUP BY sulla chiave che sta per diventare unica, HAVING count(*) > 1, sulle sole righe vive',
      regola_risoluzione:
        'risolvibile automaticamente se al massimo una riga del gruppo ha dati collegati',
      controlli: esiti,
      vincoli_esistenti: vincoli,
      righe_cancellate: cancellate,
    },
  }
}

function descriviChiave(chiave: Record<string, unknown>): string {
  return Object.entries(chiave)
    .map(([nome, valore]) => `${nome}=${valore === null ? '(vuoto)' : testo(String(valore))}`)
    .join(', ')
}

function descriviRiga(riga: RigaDuplicata): string {
  return Object.entries(riga)
    .filter(([nome]) => nome !== 'id' && nome !== 'collegamenti')
    .map(([nome, valore]) => `${nome}=${valore === null ? '—' : testo(String(valore))}`)
    .join(' · ')
}

export const censimentoDuplicatiUnicita: Censimento = {
  lettera: 'c',
  nome: 'c-duplicati-unicita',
  titolo: 'Duplicati che impedirebbero i nuovi vincoli di unicità',
  descrizione:
    'Gruppi di righe che condividono una chiave in procinto di diventare unica: finché esistono, la migrazione degli indici fallisce.',
  esegui,
}
