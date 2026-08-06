/**
 * Censimento (a): movimenti generati dai pagamenti con il segno invertito.
 *
 * SOLA LETTURA. Questo file esegue esclusivamente SELECT attraverso
 * `SolaLettura`, che gira su una connessione che il server stesso rifiuta di
 * far scrivere. Nessuna INSERT, UPDATE, DELETE, nessuna DDL.
 *
 * L'origine del guasto è `src/app/api/pagamenti/[id]/esegui/route.ts`, che
 * registra ogni pagamento eseguito come `debitAmount` sul registro BANK. La
 * convenzione del progetto è `saldo = apertura + dare − avere`
 * (`src/lib/prima-nota-utils.ts`), quindi ogni pagamento così registrato ha
 * alzato il saldo della banca invece di abbassarlo.
 *
 * Criterio per dire che una riga è corrotta
 * ------------------------------------------
 * `journal_entries.payment_id` valorizzato e `debit_amount` non nullo.
 * Il primo dei due è di per sé quasi conclusivo: in tutto il codice esiste un
 * solo punto che scrive `paymentId` su un movimento, ed è proprio la route
 * difettosa. Ogni movimento collegato a un pagamento è quindi nato da lì.
 *
 * Resta però una domanda che il codice non può risolvere: il committente
 * avverte che i `Payment` non sono necessariamente sempre uscite. Il segno
 * giusto dipende dalla natura dell'operazione, non dalla sua registrazione.
 * Per questo il censimento non decide: ripartisce per `tipo`, mostra
 * beneficiario e causale in chiaro e lascia la scelta al titolare, marcando
 * come "auto-correggibili" soltanto i casi in cui l'uscita è fuori discussione
 * (BONIFICO e F24, con l'importo del movimento identico a quello del
 * pagamento) e come "da decidere a mano" tutto il resto, riga per riga.
 */

import type { SolaLettura } from './lib/db'
import type { Censimento, Esito, Opzioni } from './lib/tipi'
import { data, euro, intero, pluraleRighe, sezione, siNo, tabella, testo, titolo, voci } from './lib/format'

const CRITERIO =
  'journal_entries.payment_id valorizzato e debit_amount non nullo: il movimento del pagamento ' +
  'è stato registrato in DARE (entrata) invece che in AVERE (uscita).'

interface RigaMovimento {
  movimento_id: string
  sede_id: string
  sede: string | null
  data_movimento: string
  registro: string
  importo_dare: string
  importo_avere: string | null
  descrizione: string
  movimento_cancellato: boolean
  pagamento_id: string
  pagamento_tipo: string
  pagamento_stato: string
  pagamento_importo: string
  beneficiario: string
  causale: string | null
  data_esecuzione: string
  pagamento_cancellato: boolean
  iban_presente: boolean
  auto_correggibile: boolean
}

interface RigaSaldo {
  sede_id: string
  sede: string
  apertura: string
  totale_dare: string
  totale_avere: string
  saldo_attuale: string
  dare_da_invertire_certo: string
  dare_da_invertire_totale: string
}

interface RigaContesto {
  tipo: string
  stato: string
  pagamenti: string
  cancellati: string
  senza_movimento: string
  importo_totale: string
}

const SQL_MOVIMENTI = `
SELECT
  je.id                                                            AS movimento_id,
  je.venue_id                                                      AS sede_id,
  v.name                                                           AS sede,
  je.date::text                                                    AS data_movimento,
  je.register_type::text                                           AS registro,
  je.debit_amount::text                                            AS importo_dare,
  je.credit_amount::text                                           AS importo_avere,
  je.description                                                   AS descrizione,
  (je.deleted_at IS NOT NULL)                                      AS movimento_cancellato,
  p.id                                                             AS pagamento_id,
  p.tipo::text                                                     AS pagamento_tipo,
  p.stato::text                                                    AS pagamento_stato,
  p.importo::text                                                  AS pagamento_importo,
  p.beneficiario_nome                                              AS beneficiario,
  p.causale                                                        AS causale,
  p.data_esecuzione::text                                          AS data_esecuzione,
  (p.deleted_at IS NOT NULL)                                       AS pagamento_cancellato,
  (p.beneficiario_iban IS NOT NULL)                                AS iban_presente,
  (p.tipo IN ('BONIFICO', 'F24') AND je.debit_amount = p.importo)  AS auto_correggibile
FROM journal_entries je
JOIN payments p ON p.id = je.payment_id
LEFT JOIN venues v ON v.id = je.venue_id
WHERE je.debit_amount IS NOT NULL
ORDER BY je.date DESC, je.id
`

/**
 * Il saldo è calcolato come lo calcola l'applicazione in
 * `src/app/api/prima-nota/saldi/route.ts`: apertura dell'anno in corso più
 * dare meno avere, sui soli movimenti non cancellati logicamente.
 */
const SQL_SALDI = `
SELECT
  v.id                                                                   AS sede_id,
  v.name                                                                 AS sede,
  COALESCE(ib.bank_balance, 0)::text                                     AS apertura,
  COALESCE(SUM(je.debit_amount), 0)::text                                AS totale_dare,
  COALESCE(SUM(je.credit_amount), 0)::text                               AS totale_avere,
  (COALESCE(ib.bank_balance, 0)
     + COALESCE(SUM(je.debit_amount), 0)
     - COALESCE(SUM(je.credit_amount), 0))::text                         AS saldo_attuale,
  COALESCE(SUM(je.debit_amount) FILTER (
    WHERE p.id IS NOT NULL
      AND p.tipo IN ('BONIFICO', 'F24')
      AND je.debit_amount = p.importo
  ), 0)::text                                                            AS dare_da_invertire_certo,
  COALESCE(SUM(je.debit_amount) FILTER (WHERE p.id IS NOT NULL), 0)::text AS dare_da_invertire_totale
FROM venues v
LEFT JOIN initial_balances ib
  ON ib.venue_id = v.id AND ib.year = EXTRACT(YEAR FROM CURRENT_DATE)
LEFT JOIN journal_entries je
  ON je.venue_id = v.id AND je.register_type = 'BANK' AND je.deleted_at IS NULL
LEFT JOIN payments p ON p.id = je.payment_id
GROUP BY v.id, v.name, ib.bank_balance
ORDER BY v.name
`

const SQL_CONTESTO = `
SELECT
  p.tipo::text                                                  AS tipo,
  p.stato::text                                                 AS stato,
  COUNT(*)::text                                                AS pagamenti,
  COUNT(*) FILTER (WHERE p.deleted_at IS NOT NULL)::text        AS cancellati,
  COUNT(*) FILTER (WHERE p.journal_entry_id IS NULL)::text      AS senza_movimento,
  COALESCE(SUM(p.importo), 0)::text                             AS importo_totale
FROM payments p
GROUP BY p.tipo, p.stato
ORDER BY p.tipo, p.stato
`

function somma(righe: RigaMovimento[]): number {
  return righe.reduce((totale, riga) => totale + Number(riga.importo_dare), 0)
}

async function esegui(db: SolaLettura, opzioni: Opzioni): Promise<Esito> {
  const movimenti = await db.query<RigaMovimento>(SQL_MOVIMENTI)
  const saldi = await db.query<RigaSaldo>(SQL_SALDI)
  const contesto = await db.query<RigaContesto>(SQL_CONTESTO)

  const vivi = movimenti.filter((riga) => !riga.movimento_cancellato)
  const cancellati = movimenti.filter((riga) => riga.movimento_cancellato)
  const autoCorreggibili = vivi.filter((riga) => riga.auto_correggibile)
  const daDecidere = vivi.filter((riga) => !riga.auto_correggibile)

  const testoRapporto: string[] = [
    ...titolo('Censimento (a) — movimenti da pagamento con il segno invertito'),
    '',
    `Criterio: ${CRITERIO}`,
    '',
    'Ogni riga qui elencata ha alzato il saldo della banca invece di abbassarlo,',
    'sempre che il pagamento fosse davvero un\'uscita: è questo il punto su cui',
    'il censimento non decide da solo.',
  ]

  testoRapporto.push(
    ...sezione('Quadro generale'),
    ...voci([
      ['Movimenti segnalati', pluraleRighe(movimenti.length)],
      ['  di cui su movimenti cancellati logicamente', `${intero(cancellati.length)} (non incidono sul saldo)`],
      ['  di cui su pagamenti cancellati logicamente', intero(vivi.filter((r) => r.pagamento_cancellato).length)],
      ['Auto-correggibili (BONIFICO o F24, importo identico)', `${intero(autoCorreggibili.length)} — ${euro(somma(autoCorreggibili))}`],
      ['Da decidere a mano', `${intero(daDecidere.length)} — ${euro(somma(daDecidere))}`],
    ])
  )

  // Ripartizione per tipo: è il taglio che serve al titolare per capire quali
  // di questi pagamenti fossero davvero uscite.
  const tipi = [...new Set(movimenti.map((riga) => riga.pagamento_tipo))].sort()
  const perTipo = tipi.map((tipo) => {
    const delTipo = movimenti.filter((riga) => riga.pagamento_tipo === tipo)
    const viviDelTipo = delTipo.filter((riga) => !riga.movimento_cancellato)
    return {
      tipo,
      movimenti: delTipo.length,
      somma: somma(delTipo),
      auto_correggibili: viviDelTipo.filter((riga) => riga.auto_correggibile).length,
      da_decidere: viviDelTipo.filter((riga) => !riga.auto_correggibile).length,
    }
  })

  testoRapporto.push(
    ...sezione('Ripartizione per tipo di pagamento'),
    ...tabella(
      [
        { etichetta: 'Tipo', valore: (r: (typeof perTipo)[number]) => r.tipo },
        { etichetta: 'Movimenti', valore: (r) => intero(r.movimenti), allinea: 'dx' },
        { etichetta: 'Somma registrata in dare', valore: (r) => euro(r.somma), allinea: 'dx' },
        { etichetta: 'Auto-corr.', valore: (r) => intero(r.auto_correggibili), allinea: 'dx' },
        { etichetta: 'Da decidere', valore: (r) => intero(r.da_decidere), allinea: 'dx' },
      ],
      perTipo
    )
  )

  for (const tipo of tipi) {
    const delTipo = movimenti.filter((riga) => riga.pagamento_tipo === tipo)
    const esempi = delTipo.slice(0, opzioni.esempi)
    testoRapporto.push(
      ...sezione(`Esempi — ${tipo} (${intero(esempi.length)} di ${intero(delTipo.length)})`),
      ...tabella(colonneMovimento(), esempi)
    )
  }

  testoRapporto.push(
    ...sezione(`Da decidere a mano — elenco completo (${pluraleRighe(daDecidere.length)})`),
    '  Sono i movimenti su cui la correzione automatica non è lecita: il tipo di',
    '  pagamento non garantisce che si tratti di un\'uscita, oppure l\'importo del',
    '  movimento non coincide con quello del pagamento.',
    '',
    ...tabella(colonneMovimento(), daDecidere)
  )

  const impatto = saldi.map((riga) => {
    const saldoAttuale = Number(riga.saldo_attuale)
    const certo = Number(riga.dare_da_invertire_certo)
    const totale = Number(riga.dare_da_invertire_totale)
    return {
      sede_id: riga.sede_id,
      sede: riga.sede,
      apertura: riga.apertura,
      saldo_attuale: saldoAttuale,
      correzione_certa: certo,
      saldo_dopo_correzione_certa: saldoAttuale - 2 * certo,
      correzione_massima: totale,
      saldo_dopo_correzione_massima: saldoAttuale - 2 * totale,
    }
  })

  testoRapporto.push(
    ...sezione('Impatto sul saldo della banca'),
    '  Invertire una riga da dare ad avere sposta il saldo di due volte il suo',
    '  importo: una per togliere l\'entrata che non c\'era, una per registrare',
    '  l\'uscita che c\'era. La colonna "certa" considera i soli auto-correggibili,',
    '  la colonna "massima" considera anche tutte le righe da decidere a mano.',
    '',
    ...tabella(
      [
        { etichetta: 'Sede', valore: (r: (typeof impatto)[number]) => testo(r.sede), massimo: 22 },
        { etichetta: 'Saldo attuale', valore: (r) => euro(r.saldo_attuale), allinea: 'dx' },
        { etichetta: 'Correzione certa', valore: (r) => euro(r.correzione_certa), allinea: 'dx' },
        { etichetta: 'Saldo dopo', valore: (r) => euro(r.saldo_dopo_correzione_certa), allinea: 'dx' },
        { etichetta: 'Correzione massima', valore: (r) => euro(r.correzione_massima), allinea: 'dx' },
        { etichetta: 'Saldo dopo', valore: (r) => euro(r.saldo_dopo_correzione_massima), allinea: 'dx' },
      ],
      impatto
    )
  )

  testoRapporto.push(
    ...sezione('Contesto — tutti i pagamenti per tipo e stato'),
    '  Serve a capire quanta parte dei pagamenti sia effettivamente finita in',
    '  prima nota: la colonna "senza movimento" conta quelli che non vi sono mai',
    '  arrivati, e che quindi non compaiono nel censimento qui sopra.',
    '',
    ...tabella(
      [
        { etichetta: 'Tipo', valore: (r: RigaContesto) => r.tipo },
        { etichetta: 'Stato', valore: (r) => r.stato },
        { etichetta: 'Pagamenti', valore: (r) => intero(r.pagamenti), allinea: 'dx' },
        { etichetta: 'Cancellati', valore: (r) => intero(r.cancellati), allinea: 'dx' },
        { etichetta: 'Senza movimento', valore: (r) => intero(r.senza_movimento), allinea: 'dx' },
        { etichetta: 'Importo', valore: (r) => euro(r.importo_totale), allinea: 'dx' },
      ],
      contesto
    )
  )

  return {
    testo: testoRapporto,
    anomalie: movimenti.length,
    dati: {
      criterio: CRITERIO,
      totali: {
        segnalati: movimenti.length,
        su_movimenti_cancellati: cancellati.length,
        auto_correggibili: autoCorreggibili.length,
        da_decidere: daDecidere.length,
        somma_auto_correggibili: somma(autoCorreggibili).toFixed(2),
        somma_da_decidere: somma(daDecidere).toFixed(2),
      },
      per_tipo: perTipo.map((riga) => ({ ...riga, somma: riga.somma.toFixed(2) })),
      auto_correggibili: autoCorreggibili,
      da_decidere: daDecidere,
      su_movimenti_cancellati: cancellati,
      impatto_saldo: impatto,
      contesto_pagamenti: contesto,
    },
  }
}

function colonneMovimento() {
  return [
    { etichetta: 'Data', valore: (r: RigaMovimento) => data(r.data_movimento) },
    { etichetta: 'Importo', valore: (r: RigaMovimento) => euro(r.importo_dare), allinea: 'dx' as const },
    { etichetta: 'Beneficiario', valore: (r: RigaMovimento) => testo(r.beneficiario), massimo: 26 },
    { etichetta: 'Causale', valore: (r: RigaMovimento) => testo(r.causale), massimo: 24 },
    { etichetta: 'Descrizione movimento', valore: (r: RigaMovimento) => testo(r.descrizione), massimo: 34 },
    { etichetta: 'Stato pag.', valore: (r: RigaMovimento) => r.pagamento_stato },
    { etichetta: 'Canc.', valore: (r: RigaMovimento) => siNo(r.movimento_cancellato) },
    { etichetta: 'Auto', valore: (r: RigaMovimento) => siNo(r.auto_correggibile) },
  ]
}

export const censimentoMovimentiPagamento: Censimento = {
  lettera: 'a',
  nome: 'a-movimenti-pagamento',
  titolo: 'Movimenti da pagamento con il segno invertito',
  descrizione:
    'Movimenti di prima nota collegati a un pagamento e registrati in dare: hanno alzato il saldo della banca invece di abbassarlo.',
  esegui,
}
