/**
 * Censimento (b): scadenze con una data di pagamento che nessuno ha pagato.
 *
 * SOLA LETTURA. Solo SELECT attraverso `SolaLettura`.
 *
 * L'origine del guasto è `src/app/api/scadenzario/[id]/stato/route.ts`, che
 * quando una scadenza viene marcata SCADUTA le scrive `dataPagamento = oggi`
 * pur non essendo stata pagata. Il pagamento vero, se arriva dopo, non
 * corregge il dato: la stessa route scrive `dataPagamento` solo quando è
 * ancora nullo.
 *
 * Perché il danno non si ferma allo scadenzario
 * ---------------------------------------------
 * `src/lib/scadenzario/stima-data-attesa.ts` stima il ritardo tipico di un
 * fornitore come mediana di `dataPagamento − dataScadenza` sulle sue scadenze
 * passive in stato `pagata` degli ultimi 365 giorni. Una scadenza marcata
 * SCADUTA e poi pagata davvero entra in quel calcolo con la data finta del
 * giorno in cui fu marcata, non con quella del pagamento. Il censimento
 * quantifica lo scostamento: per ogni fornitore mostra la stima che il sistema
 * userebbe oggi e quella che userebbe con le date rimesse a posto.
 *
 * Criterio per dire che una riga è corrotta
 * -----------------------------------------
 * Il discrimine è l'esistenza di un pagamento vero a sostegno della data.
 * Una scadenza ha "evidenza di pagamento" se ha almeno una riga in
 * `schedule_payments`, oppure almeno una riconciliazione VERIFIED, oppure
 * `importo_pagato` maggiore di zero. Da qui le categorie:
 *
 *   certa                  stato aperta/scaduta, data di pagamento valorizzata,
 *                          nessuna evidenza: la data non può che essere finta;
 *   da_verificare          stato aperta/scaduta con evidenza parziale: la data
 *                          potrebbe riferirsi a un acconto reale;
 *   sospetta               stato parzialmente_pagata con data valorizzata: lo
 *                          stato dice "non ancora saldata", la data dice "pagata";
 *   pagata_senza_evidenza  stato pagata ma nessun pagamento registrato: la data
 *                          non poggia su nulla, ed entra nella stima dei ritardi;
 *   pagata_incoerente      stato pagata con pagamenti registrati, ma la data
 *                          non coincide con quella dell'ultimo pagamento vero.
 *
 * Le ultime due categorie vanno oltre la lettera dell'incarico, che chiedeva
 * gli stati aperta/scaduta e parzialmente_pagata: sono però le uniche che
 * inquinano davvero la stima dei ritardi, perché la stima legge soltanto le
 * scadenze in stato `pagata`. Ometterle avrebbe risposto alla domanda
 * lasciando fuori la ragione per cui è stata posta.
 */

import type { SolaLettura } from './lib/db'
import type { Censimento, Esito, Opzioni } from './lib/tipi'
import { data, euro, intero, pluraleRighe, sezione, siNo, tabella, testo, titolo, voci } from './lib/format'

/** Soglie della stima, allineate a src/lib/scadenzario/stima-data-attesa.ts. */
const STIMA_MIN_CAMPIONE = 3
const STIMA_SOGLIA_GIORNI = 2
const STIMA_FINESTRA_GIORNI = 365

type Categoria =
  | 'certa'
  | 'da_verificare'
  | 'sospetta'
  | 'pagata_senza_evidenza'
  | 'pagata_incoerente'
  | 'coerente'
  | 'altro'

const DESCRIZIONE_CATEGORIA: Record<Categoria, string> = {
  certa: 'Aperta o scaduta, nessun pagamento a sostegno: data certamente fittizia',
  da_verificare: 'Aperta o scaduta, ma con pagamenti parziali registrati',
  sospetta: 'Parzialmente pagata con data di pagamento valorizzata',
  pagata_senza_evidenza: 'Marcata pagata senza alcun pagamento registrato',
  pagata_incoerente: 'Marcata pagata, ma la data non è quella del pagamento vero',
  coerente: 'Data di pagamento confermata dai pagamenti registrati',
  altro: 'Altri stati (annullata) con data di pagamento valorizzata',
}

/** Categorie che rappresentano un dato da correggere. */
const CATEGORIE_ANOMALE: Categoria[] = [
  'certa',
  'da_verificare',
  'sospetta',
  'pagata_senza_evidenza',
  'pagata_incoerente',
]

/** Categorie che falsano la stima del ritardo tipico del fornitore. */
const CATEGORIE_CHE_INQUINANO_LA_STIMA: Categoria[] = ['pagata_senza_evidenza', 'pagata_incoerente']

interface RigaScadenza {
  scadenza_id: string
  sede_id: string
  tipo: string
  stato: string
  descrizione: string
  importo_totale: string
  importo_pagato: string
  data_scadenza: string
  data_pagamento: string
  giorni_ritardo: number
  giorni_ritardo_reale: number | null
  numero_documento: string | null
  controparte_nome: string | null
  supplier_id: string | null
  fornitore: string | null
  cancellata: boolean
  data_pagamento_uguale_ultima_modifica: boolean
  pagamenti_registrati: number
  pagamenti_totale: string
  ultimo_pagamento: string | null
  riconciliazioni: number
  riconciliato_totale: string
  ultima_riconciliazione: string | null
  nella_finestra_stima: boolean
}

const SQL_SCADENZE = `
WITH pagamenti AS (
  SELECT sp.schedule_id,
         COUNT(*)               AS numero,
         SUM(sp.importo)        AS totale,
         MAX(sp.data_pagamento) AS ultima
  FROM schedule_payments sp
  GROUP BY sp.schedule_id
),
riconciliazioni AS (
  SELECT sr.schedule_id,
         COUNT(*)       AS numero,
         SUM(sr.amount) AS totale,
         MAX(je.date)   AS ultima
  FROM schedule_reconciliations sr
  JOIN journal_entries je ON je.id = sr.journal_entry_id
  WHERE sr.status = 'VERIFIED'
  GROUP BY sr.schedule_id
)
SELECT
  s.id                                                     AS scadenza_id,
  s.venue_id                                               AS sede_id,
  s.tipo                                                   AS tipo,
  s.stato                                                  AS stato,
  s.descrizione                                            AS descrizione,
  s.importo_totale::text                                   AS importo_totale,
  s.importo_pagato::text                                   AS importo_pagato,
  s.data_scadenza::text                                    AS data_scadenza,
  s.data_pagamento::text                                   AS data_pagamento,
  (s.data_pagamento - s.data_scadenza)                     AS giorni_ritardo,
  (COALESCE(pg.ultima, rc.ultima) - s.data_scadenza)       AS giorni_ritardo_reale,
  s.numero_documento                                       AS numero_documento,
  s.controparte_nome                                       AS controparte_nome,
  s.supplier_id                                            AS supplier_id,
  f.name                                                   AS fornitore,
  (s.deleted_at IS NOT NULL)                               AS cancellata,
  (s.data_pagamento
     = (s.updated_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Rome')::date) AS data_pagamento_uguale_ultima_modifica,
  COALESCE(pg.numero, 0)                                   AS pagamenti_registrati,
  COALESCE(pg.totale, 0)::text                             AS pagamenti_totale,
  pg.ultima::text                                          AS ultimo_pagamento,
  COALESCE(rc.numero, 0)                                   AS riconciliazioni,
  COALESCE(rc.totale, 0)::text                             AS riconciliato_totale,
  rc.ultima::text                                          AS ultima_riconciliazione,
  (s.data_pagamento >= CURRENT_DATE - $1::int)             AS nella_finestra_stima
FROM schedules s
LEFT JOIN pagamenti pg ON pg.schedule_id = s.id
LEFT JOIN riconciliazioni rc ON rc.schedule_id = s.id
LEFT JOIN suppliers f ON f.id = s.supplier_id
WHERE s.data_pagamento IS NOT NULL
ORDER BY s.data_scadenza DESC, s.id
`

/**
 * L'unica prova che data un pagamento è il documento che lo registra: una riga
 * in `schedule_payments` o una riconciliazione VERIFIED, entrambe con una data
 * propria. `importo_pagato` non conta come prova: è un campo derivato, scritto
 * dagli stessi flussi che hanno prodotto il guasto, e una scadenza marcata
 * "pagata" a mano lo valorizza senza che sia mai transitato un euro.
 */
function haEvidenzaDocumentata(riga: RigaScadenza): boolean {
  return riga.pagamenti_registrati > 0 || riga.riconciliazioni > 0
}

function classifica(riga: RigaScadenza): Categoria {
  const evidenza = haEvidenzaDocumentata(riga)

  if (riga.stato === 'scaduta' || riga.stato === 'aperta') {
    // Un importo pagato dichiarato, anche senza documento, basta a non dire
    // "certamente finta": qualcosa potrebbe essere stato incassato davvero.
    return evidenza || Number(riga.importo_pagato) > 0 ? 'da_verificare' : 'certa'
  }
  if (riga.stato === 'parzialmente_pagata') {
    return 'sospetta'
  }
  if (riga.stato === 'pagata') {
    if (!evidenza) return 'pagata_senza_evidenza'
    const riferimento = riga.ultimo_pagamento ?? riga.ultima_riconciliazione
    if (riferimento && riferimento !== riga.data_pagamento) return 'pagata_incoerente'
    return 'coerente'
  }
  return 'altro'
}

/** Mediana con le stesse regole di calcolaRitardoTipico(). */
function ritardoTipico(ritardi: number[]): number | null {
  if (ritardi.length < STIMA_MIN_CAMPIONE) return null
  const ordinati = [...ritardi].sort((primo, secondo) => primo - secondo)
  const mezzo = Math.floor(ordinati.length / 2)
  const mediana =
    ordinati.length % 2 === 0 ? (ordinati[mezzo - 1] + ordinati[mezzo]) / 2 : ordinati[mezzo]
  const giorni = Math.round(mediana)
  return Math.abs(giorni) < STIMA_SOGLIA_GIORNI ? null : giorni
}

function stima(valore: number | null): string {
  if (valore === null) return 'nessuna'
  return `${valore > 0 ? '+' : ''}${intero(valore)} gg`
}

async function esegui(db: SolaLettura, opzioni: Opzioni): Promise<Esito> {
  const scadenze = await db.query<RigaScadenza>(SQL_SCADENZE, [STIMA_FINESTRA_GIORNI])
  const classificate = scadenze.map((riga) => ({
    ...riga,
    categoria: classifica(riga),
    // Importo dichiarato pagato senza un solo documento che lo registri: è la
    // spia che anche importo_pagato è stato scritto a mano.
    importo_pagato_senza_riscontro:
      Number(riga.importo_pagato) > 0 && !haEvidenzaDocumentata(riga),
  }))

  const anomale = classificate.filter((riga) => CATEGORIE_ANOMALE.includes(riga.categoria))

  const testoRapporto: string[] = [
    ...titolo('Censimento (b) — scadenze con una data di pagamento mai avvenuto'),
    '',
    'Criterio: una data di pagamento è credibile solo se poggia su un pagamento',
    'registrato — una riga in schedule_payments, una riconciliazione VERIFIED o un',
    'importo pagato maggiore di zero. Dove quella prova manca, o contraddice la',
    'data, la riga finisce qui sotto.',
  ]

  const conteggi = (Object.keys(DESCRIZIONE_CATEGORIA) as Categoria[])
    .map((categoria) => ({
      categoria,
      descrizione: DESCRIZIONE_CATEGORIA[categoria],
      righe: classificate.filter((riga) => riga.categoria === categoria).length,
      cancellate: classificate.filter((riga) => riga.categoria === categoria && riga.cancellata).length,
    }))
    .filter((riga) => riga.righe > 0)

  testoRapporto.push(
    ...sezione('Quadro generale'),
    ...voci([
      ['Scadenze con data di pagamento valorizzata', pluraleRighe(scadenze.length)],
      ['Di queste, da correggere', pluraleRighe(anomale.length)],
      ['  cancellate logicamente', intero(anomale.filter((riga) => riga.cancellata).length)],
      [
        'Con un importo pagato che nessun documento registra',
        intero(classificate.filter((riga) => riga.importo_pagato_senza_riscontro).length),
      ],
    ]),
    '',
    ...tabella(
      [
        { etichetta: 'Categoria', valore: (r: (typeof conteggi)[number]) => r.categoria },
        { etichetta: 'Righe', valore: (r) => intero(r.righe), allinea: 'dx' },
        { etichetta: 'Cancellate', valore: (r) => intero(r.cancellate), allinea: 'dx' },
        { etichetta: 'Significato', valore: (r) => r.descrizione, massimo: 62 },
      ],
      conteggi
    )
  )

  for (const categoria of CATEGORIE_ANOMALE) {
    const righe = classificate.filter((riga) => riga.categoria === categoria)
    if (righe.length === 0) continue
    const mostrate = categoria === 'certa' || categoria === 'sospetta' ? righe : righe.slice(0, opzioni.esempi)
    testoRapporto.push(
      ...sezione(
        `${categoria} — ${pluraleRighe(righe.length)}` +
          (mostrate.length < righe.length ? ` (mostrate le prime ${intero(mostrate.length)})` : '')
      ),
      `  ${DESCRIZIONE_CATEGORIA[categoria]}.`,
      '',
      ...tabella(colonneScadenza(), mostrate)
    )
  }

  // Fornitori coinvolti: è la loro storia dei ritardi ad essere stata sporcata.
  const perFornitore = raggruppaPerFornitore(anomale)
  testoRapporto.push(
    ...sezione('Fornitori coinvolti'),
    '  Ogni riga qui sotto è un fornitore la cui storia dei pagamenti contiene',
    '  date non veritiere. Le due colonne finali contano le scadenze che entrano',
    '  davvero nel calcolo del ritardo tipico.',
    '',
    ...tabella(
      [
        { etichetta: 'Fornitore', valore: (r: (typeof perFornitore)[number]) => testo(r.fornitore), massimo: 32 },
        { etichetta: 'Collegato', valore: (r) => siNo(r.supplier_id !== null) },
        { etichetta: 'Righe da correggere', valore: (r) => intero(r.righe), allinea: 'dx' },
        { etichetta: 'Certe', valore: (r) => intero(r.certe), allinea: 'dx' },
        { etichetta: 'Sospette', valore: (r) => intero(r.sospette), allinea: 'dx' },
        { etichetta: 'Inquinano la stima', valore: (r) => intero(r.inquinano_stima), allinea: 'dx' },
      ],
      perFornitore
    )
  )

  const stime = confrontoStime(classificate)
  testoRapporto.push(
    ...sezione('Effetto sulla stima del ritardo tipico'),
    '  "Stima attuale" è il numero di giorni che il sistema usa oggi per prevedere',
    '  quando uscirà la cassa; "stima ripulita" è quello che userebbe con le date',
    '  rimesse a posto. La stima si applica solo con almeno',
    `  ${STIMA_MIN_CAMPIONE} scadenze pagate negli ultimi ${STIMA_FINESTRA_GIORNI} giorni e uno scostamento di almeno ${STIMA_SOGLIA_GIORNI} giorni.`,
    '',
    ...tabella(
      [
        { etichetta: 'Fornitore', valore: (r: (typeof stime)[number]) => testo(r.fornitore), massimo: 32 },
        { etichetta: 'Campione', valore: (r) => intero(r.campione), allinea: 'dx' },
        { etichetta: 'Righe inquinate', valore: (r) => intero(r.inquinate), allinea: 'dx' },
        { etichetta: 'Stima attuale', valore: (r) => stima(r.stima_attuale), allinea: 'dx' },
        { etichetta: 'Stima ripulita', valore: (r) => stima(r.stima_ripulita), allinea: 'dx' },
      ],
      stime
    )
  )

  return {
    testo: testoRapporto,
    anomalie: anomale.length,
    dati: {
      criterio:
        'data_pagamento valorizzata senza un pagamento registrato che la sostenga, oppure in contrasto con esso',
      soglie_stima: {
        minimo_campione: STIMA_MIN_CAMPIONE,
        soglia_giorni: STIMA_SOGLIA_GIORNI,
        finestra_giorni: STIMA_FINESTRA_GIORNI,
      },
      conteggi,
      per_categoria: Object.fromEntries(
        CATEGORIE_ANOMALE.map((categoria) => [
          categoria,
          classificate.filter((riga) => riga.categoria === categoria),
        ])
      ),
      fornitori_coinvolti: perFornitore,
      confronto_stime: stime,
    },
  }
}

function raggruppaPerFornitore<T extends { supplier_id: string | null; fornitore: string | null; controparte_nome: string | null; categoria: Categoria }>(
  righe: T[]
) {
  const gruppi = new Map<
    string,
    {
      supplier_id: string | null
      fornitore: string
      righe: number
      certe: number
      sospette: number
      inquinano_stima: number
    }
  >()

  for (const riga of righe) {
    const chiave = riga.supplier_id ?? `nome:${riga.controparte_nome ?? '(senza controparte)'}`
    const gruppo = gruppi.get(chiave) ?? {
      supplier_id: riga.supplier_id,
      fornitore: riga.fornitore ?? riga.controparte_nome ?? '(senza controparte)',
      righe: 0,
      certe: 0,
      sospette: 0,
      inquinano_stima: 0,
    }
    gruppo.righe += 1
    if (riga.categoria === 'certa') gruppo.certe += 1
    if (riga.categoria === 'sospetta') gruppo.sospette += 1
    if (CATEGORIE_CHE_INQUINANO_LA_STIMA.includes(riga.categoria)) gruppo.inquinano_stima += 1
    gruppi.set(chiave, gruppo)
  }

  return [...gruppi.values()].sort((primo, secondo) => secondo.righe - primo.righe)
}

/**
 * Ricostruisce, fornitore per fornitore e sede per sede, la stima che il
 * sistema produce oggi e quella che produrrebbe con le date corrette: le righe
 * incoerenti rientrano con la data del pagamento vero, quelle senza alcuna
 * prova di pagamento escono dal campione.
 */
function confrontoStime(righe: Array<RigaScadenza & { categoria: Categoria }>) {
  const candidate = righe.filter(
    (riga) =>
      riga.tipo === 'passiva' &&
      riga.stato === 'pagata' &&
      !riga.cancellata &&
      riga.supplier_id !== null &&
      riga.nella_finestra_stima
  )

  const gruppi = new Map<string, Array<RigaScadenza & { categoria: Categoria }>>()
  for (const riga of candidate) {
    const chiave = `${riga.sede_id}|${riga.supplier_id}`
    gruppi.set(chiave, [...(gruppi.get(chiave) ?? []), riga])
  }

  return [...gruppi.entries()]
    .map(([chiave, righeGruppo]) => {
      const attuale = ritardoTipico(righeGruppo.map((riga) => riga.giorni_ritardo))
      const ripulite = righeGruppo
        .filter((riga) => riga.categoria !== 'pagata_senza_evidenza')
        .map((riga) => (riga.categoria === 'pagata_incoerente' ? riga.giorni_ritardo_reale : riga.giorni_ritardo))
        .filter((giorni): giorni is number => giorni !== null)
      return {
        sede_id: chiave.split('|')[0],
        supplier_id: righeGruppo[0].supplier_id,
        fornitore: righeGruppo[0].fornitore,
        campione: righeGruppo.length,
        inquinate: righeGruppo.filter((riga) =>
          CATEGORIE_CHE_INQUINANO_LA_STIMA.includes(riga.categoria)
        ).length,
        stima_attuale: attuale,
        stima_ripulita: ritardoTipico(ripulite),
      }
    })
    .filter((riga) => riga.inquinate > 0 || riga.stima_attuale !== riga.stima_ripulita)
    .sort((primo, secondo) => secondo.inquinate - primo.inquinate)
}

function colonneScadenza() {
  type R = RigaScadenza & { categoria: Categoria; importo_pagato_senza_riscontro: boolean }
  return [
    { etichetta: 'Scadenza', valore: (r: R) => data(r.data_scadenza) },
    { etichetta: 'Data pagam.', valore: (r: R) => data(r.data_pagamento) },
    { etichetta: 'Gg', valore: (r: R) => intero(r.giorni_ritardo), allinea: 'dx' as const },
    { etichetta: 'Stato', valore: (r: R) => r.stato },
    { etichetta: 'Importo', valore: (r: R) => euro(r.importo_totale), allinea: 'dx' as const },
    { etichetta: 'Pagato', valore: (r: R) => euro(r.importo_pagato), allinea: 'dx' as const },
    { etichetta: 'Fornitore', valore: (r: R) => testo(r.fornitore ?? r.controparte_nome), massimo: 24 },
    { etichetta: 'Descrizione', valore: (r: R) => testo(r.descrizione), massimo: 28 },
    { etichetta: 'Pag.', valore: (r: R) => intero(r.pagamenti_registrati), allinea: 'dx' as const },
    { etichetta: 'Ric.', valore: (r: R) => intero(r.riconciliazioni), allinea: 'dx' as const },
    { etichetta: 'Pagato senza doc.', valore: (r: R) => siNo(r.importo_pagato_senza_riscontro) },
    { etichetta: 'Canc.', valore: (r: R) => siNo(r.cancellata) },
  ]
}

export const censimentoScadenzeDataPagamento: Censimento = {
  lettera: 'b',
  nome: 'b-scadenze-data-pagamento',
  titolo: 'Scadenze con data di pagamento fittizia',
  descrizione:
    'Scadenze la cui data di pagamento non è sostenuta da alcun pagamento reale, e che falsano la stima del ritardo dei fornitori.',
  esegui,
}
