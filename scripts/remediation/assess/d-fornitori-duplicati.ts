/**
 * Censimento (d): fornitori duplicati per partita IVA.
 *
 * SOLA LETTURA. Solo SELECT attraverso `SolaLettura`.
 *
 * `Supplier.vatNumber` non è unico. Due schede per lo stesso fornitore
 * spezzano in due la sua storia: le fatture stanno di qua, le scadenze di là, e
 * la stima del ritardo tipico — che si calcola per `supplierId` — lavora su
 * metà campione o non raggiunge nemmeno il minimo di tre scadenze.
 *
 * Criterio per dire che una riga è corrotta
 * -----------------------------------------
 * Due schede con la stessa partita IVA normalizzata sono lo stesso soggetto:
 * la partita IVA identifica univocamente un'impresa, è la definizione stessa
 * del codice. La normalizzazione segue la convenzione già in uso
 * nell'applicazione (via spazi e punteggiatura, via il prefisso `IT`, zeri a
 * sinistra fino a undici cifre), con l'accortezza di non fondere partite IVA
 * di paesi diversi: vedi `lib/piva.ts`.
 *
 * Il censimento non si spinge oltre: chi non ha partita IVA non viene
 * accorpato per assonanza del nome, perché "Bar Centrale" e "Bar Centrale
 * S.r.l." possono essere due clienti diversi e un accorpamento sbagliato è più
 * difficile da disfare di uno mancato.
 *
 * Il superstite proposto è la scheda con più fatture collegate; a parità, la
 * più vecchia. È una proposta, non una decisione: la fusione vera dovrà
 * spostare fatture, scadenze, prodotti e storico prezzi, e quel lavoro non
 * appartiene a un censimento in sola lettura.
 */

import type { SolaLettura } from './lib/db'
import type { Censimento, Esito, Opzioni } from './lib/tipi'
import { intero, presenza, sezione, siNo, tabella, testo, titolo, voci } from './lib/format'
import { pivaNormalizzata } from './lib/piva'

interface SchedaFornitore {
  id: string
  nome: string
  piva_originale: string | null
  attivo: boolean
  citta: string | null
  email: string | null
  ha_codice_fiscale: boolean
  ha_iban: boolean
  giorni_dilazione: number | null
  conto_predefinito_id: string | null
  fatture: number
  fatture_cancellate: number
  scadenze: number
  movimenti: number
  prodotti: number
  storico_prezzi: number
  avvisi_prezzo: number
  creato_il: string
}

interface GruppoFornitori {
  piva_normalizzata: string
  conteggio: number
  righe: SchedaFornitore[]
}

const SQL_DUPLICATI = `
WITH fornitori AS (
  SELECT
    s.id,
    s.name,
    s.vat_number,
    s.created_at,
    s.is_active,
    s.city,
    s.email,
    (s.fiscal_code IS NOT NULL) AS ha_codice_fiscale,
    (s.iban IS NOT NULL)        AS ha_iban,
    s.payment_terms_days,
    s.default_account_id,
    ${pivaNormalizzata('s.vat_number')} AS piva_normalizzata
  FROM suppliers s
),
conteggi AS (
  SELECT
    f.*,
    (SELECT COUNT(*) FROM electronic_invoices ei
       WHERE ei.supplier_id = f.id AND ei.deleted_at IS NULL)     AS fatture,
    (SELECT COUNT(*) FROM electronic_invoices ei
       WHERE ei.supplier_id = f.id AND ei.deleted_at IS NOT NULL) AS fatture_cancellate,
    (SELECT COUNT(*) FROM schedules sc
       WHERE sc.supplier_id = f.id AND sc.deleted_at IS NULL)     AS scadenze,
    (SELECT COUNT(*) FROM (
        SELECT ei.journal_entry_id AS movimento
        FROM electronic_invoices ei
        WHERE ei.supplier_id = f.id AND ei.journal_entry_id IS NOT NULL
        UNION
        SELECT sr.journal_entry_id
        FROM schedule_reconciliations sr
        JOIN schedules sc ON sc.id = sr.schedule_id
        WHERE sc.supplier_id = f.id
     ) collegati)                                                 AS movimenti,
    (SELECT COUNT(*) FROM supplier_product_accounts spa WHERE spa.supplier_id = f.id) AS prodotti,
    (SELECT COUNT(*) FROM price_history ph WHERE ph.supplier_id = f.id)               AS storico_prezzi,
    (SELECT COUNT(*) FROM price_alerts pa WHERE pa.supplier_id = f.id)                AS avvisi_prezzo
  FROM fornitori f
)
SELECT
  c.piva_normalizzata AS piva_normalizzata,
  COUNT(*)::int       AS conteggio,
  json_agg(json_build_object(
    'id', c.id,
    'nome', c.name,
    'piva_originale', c.vat_number,
    'attivo', c.is_active,
    'citta', c.city,
    'email', c.email,
    'ha_codice_fiscale', c.ha_codice_fiscale,
    'ha_iban', c.ha_iban,
    'giorni_dilazione', c.payment_terms_days,
    'conto_predefinito_id', c.default_account_id,
    'fatture', c.fatture,
    'fatture_cancellate', c.fatture_cancellate,
    'scadenze', c.scadenze,
    'movimenti', c.movimenti,
    'prodotti', c.prodotti,
    'storico_prezzi', c.storico_prezzi,
    'avvisi_prezzo', c.avvisi_prezzo,
    'creato_il', to_char(c.created_at, 'YYYY-MM-DD HH24:MI')
  ) ORDER BY c.fatture DESC, c.created_at) AS righe
FROM conteggi c
WHERE c.piva_normalizzata IS NOT NULL
GROUP BY c.piva_normalizzata
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, c.piva_normalizzata
`

const SQL_QUADRO = `
SELECT
  COUNT(*)::int AS totale,
  COUNT(*) FILTER (WHERE ${pivaNormalizzata('s.vat_number')} IS NULL)::int AS senza_partita_iva,
  COUNT(*) FILTER (WHERE s.is_active)::int AS attivi
FROM suppliers s
`

async function esegui(db: SolaLettura, opzioni: Opzioni): Promise<Esito> {
  const gruppi = await db.query<GruppoFornitori>(SQL_DUPLICATI)
  const quadro = await db.query<{ totale: number; senza_partita_iva: number; attivi: number }>(
    SQL_QUADRO
  )

  // Le righe arrivano già ordinate per fatture decrescenti e, a parità, per
  // anzianità: il superstite proposto è quindi la prima di ogni gruppo.
  const proposte = gruppi.map((gruppo) => {
    const [superstite, ...assorbiti] = gruppo.righe
    return {
      piva_normalizzata: gruppo.piva_normalizzata,
      conteggio: gruppo.conteggio,
      superstite,
      assorbiti,
      dati_da_spostare: assorbiti.reduce(
        (totale, scheda) =>
          totale +
          scheda.fatture +
          scheda.fatture_cancellate +
          scheda.scadenze +
          scheda.prodotti +
          scheda.storico_prezzi +
          scheda.avvisi_prezzo,
        0
      ),
      righe: gruppo.righe,
    }
  })

  const testoRapporto: string[] = [
    ...titolo('Censimento (d) — fornitori duplicati per partita IVA'),
    '',
    'Criterio: stessa partita IVA normalizzata, quindi stesso soggetto. Le partite',
    'IVA di paesi diversi non vengono fuse; chi non ha partita IVA non viene',
    'accorpato per somiglianza del nome.',
    '',
    ...voci([
      ['Fornitori in anagrafica', intero(quadro[0]?.totale ?? 0)],
      ['  di cui attivi', intero(quadro[0]?.attivi ?? 0)],
      ['  di cui senza partita IVA (non confrontabili)', intero(quadro[0]?.senza_partita_iva ?? 0)],
      ['Gruppi di duplicati', intero(proposte.length)],
      [
        'Schede da assorbire',
        intero(proposte.reduce((totale, gruppo) => totale + gruppo.assorbiti.length, 0)),
      ],
      [
        'Righe da riagganciare al superstite',
        intero(proposte.reduce((totale, gruppo) => totale + gruppo.dati_da_spostare, 0)),
      ],
    ]),
  ]

  const mostrati = proposte.slice(0, Math.max(opzioni.esempi, proposte.length))
  for (const gruppo of mostrati) {
    testoRapporto.push(
      ...sezione(`Partita IVA ${gruppo.piva_normalizzata} — ${intero(gruppo.conteggio)} schede`),
      ...tabella(
        [
          {
            etichetta: 'Ruolo',
            valore: (r: SchedaFornitore) => (r.id === gruppo.superstite.id ? 'SUPERSTITE' : 'assorbito'),
          },
          { etichetta: 'id', valore: (r) => r.id, massimo: 27 },
          { etichetta: 'Nome', valore: (r) => testo(r.nome), massimo: 28 },
          { etichetta: 'P.IVA scritta', valore: (r) => testo(r.piva_originale) },
          { etichetta: 'Attivo', valore: (r) => siNo(r.attivo) },
          { etichetta: 'Fatture', valore: (r) => intero(r.fatture), allinea: 'dx' },
          { etichetta: 'Scadenze', valore: (r) => intero(r.scadenze), allinea: 'dx' },
          { etichetta: 'Movimenti', valore: (r) => intero(r.movimenti), allinea: 'dx' },
          { etichetta: 'Prodotti', valore: (r) => intero(r.prodotti), allinea: 'dx' },
          { etichetta: 'Prezzi', valore: (r) => intero(r.storico_prezzi), allinea: 'dx' },
          { etichetta: 'IBAN', valore: (r) => presenza(r.ha_iban) },
          { etichetta: 'Creato il', valore: (r) => r.creato_il },
        ],
        gruppo.righe
      ),
      `  Righe da riagganciare al superstite: ${intero(gruppo.dati_da_spostare)}.`,
      ...avvertenzeGruppo(gruppo.righe).map((avvertenza) => `  Attenzione: ${avvertenza}`)
    )
  }

  return {
    testo: testoRapporto,
    anomalie: proposte.length,
    dati: {
      criterio: 'stessa partita IVA normalizzata fra due o più schede fornitore',
      regola_superstite: 'la scheda con più fatture collegate; a parità di fatture, la più vecchia',
      quadro: quadro[0] ?? null,
      gruppi: proposte,
    },
  }
}

/**
 * Segnala le differenze fra le schede che rendono la fusione una decisione e
 * non un travaso: se i dati di pagamento divergono, qualcuno deve dire quale
 * sia quello buono.
 */
function avvertenzeGruppo(righe: SchedaFornitore[]): string[] {
  const avvertenze: string[] = []

  const conIban = righe.filter((riga) => riga.ha_iban).length
  if (conIban > 1) {
    avvertenze.push(
      `${intero(conIban)} schede hanno un IBAN. Sono cifrati e questo censimento non li legge: ` +
        'vanno confrontati a mano prima di scegliere quale conservare.'
    )
  }

  const dilazioni = new Set(
    righe.map((riga) => riga.giorni_dilazione).filter((giorni) => giorni !== null)
  )
  if (dilazioni.size > 1) {
    avvertenze.push(
      `giorni di dilazione discordanti fra le schede (${[...dilazioni].join(', ')}): ` +
        'la scelta cambia le date attese sulle scadenze future.'
    )
  }

  const conti = new Set(
    righe.map((riga) => riga.conto_predefinito_id).filter((conto) => conto !== null)
  )
  if (conti.size > 1) {
    avvertenze.push('le schede puntano a conti predefiniti diversi: le imputazioni future cambierebbero.')
  }

  return avvertenze
}

export const censimentoFornitoriDuplicati: Censimento = {
  lettera: 'd',
  nome: 'd-fornitori-duplicati',
  titolo: 'Fornitori duplicati per partita IVA',
  descrizione:
    'Schede fornitore che rappresentano lo stesso soggetto: spezzano lo storico dei ritardi su cui si basano le stime.',
  esegui,
}
