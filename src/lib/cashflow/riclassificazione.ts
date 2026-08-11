/**
 * Riclassificazione delle voci di conto sul prospetto di cash flow.
 *
 * Fonte: docs/superpowers/specs/2026-08-11-riclassificazione-cash-flow-design.md
 * e docs/cash-flow-riclassificazione.json, generati da
 * scripts/build-cashflow-spec.py. Un test verifica che questo file e il JSON
 * dicano la stessa cosa.
 *
 * Tre livelli: famiglia → sottogruppo → voce di conto. I movimenti si
 * registrano sempre sulla voce; famiglia e sottogruppo sono derivati.
 *
 * Il prospetto legge SOLO la cassa. Le voci che non toccano mai il conto
 * corrente stanno in VOCI_FUORI_CASSA con il motivo: restano nel piano dei
 * conti, pronte per una futura vista di competenza, ma non compaiono qui.
 *
 * La natura la dà la voce, il luogo lo dà il centro di costo: nessun
 * sottogruppo nomina un locale.
 */
import type { BudgetCategoryType } from '@prisma/client'

export type CodiceFamiglia = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I'

/**
 * Un sottogruppo senza voci è **calcolato**: il suo valore non viene da conti
 * ma dall'IVA dei movimenti. Nel gestionale l'importo di un movimento è lordo
 * e l'IVA sta in `vatAmount`, quindi G1 e G2 sono aggregazioni di quel campo e
 * non conti su cui si registra.
 */
export interface Sottogruppo {
  codice: string
  nome: string
  voci: readonly string[]
  calcolato?: 'IVA_ENTRATE' | 'IVA_USCITE'
}

export interface Famiglia {
  codice: CodiceFamiglia
  nome: string
  tipo: BudgetCategoryType
  sottogruppi: readonly Sottogruppo[]
}

/**
 * Una riga memo attraversa più famiglie e **non entra in nessun totale**: se
 * la si modellasse come categoria, il suo importo verrebbe contato due volte.
 */
export interface RigaMemo {
  codice: string
  nome: string
  scopo: string
  /** Somma di famiglie o sottogruppi già presenti nel prospetto. */
  somma?: readonly string[]
  /** Oppure voci proprie, che nel prospetto non compaiono altrove. */
  voci?: readonly string[]
}

export const RICLASSIFICAZIONE_CASH_FLOW: readonly Famiglia[] = [
  {
    codice: 'A',
    nome: 'Incassi operativi',
    tipo: 'REVENUE',
    sottogruppi: [
      { codice: 'A1', nome: 'Corrispettivi', voci: ['10.01', '10.09'] },
      { codice: 'A2', nome: 'Eventi', voci: ['11.01', '11.02'] },
      {
        codice: 'A3',
        nome: 'Altri proventi',
        voci: ['12.01', '12.02', '12.03', '12.04', '12.06', '13.01', '13.02'],
      },
    ],
  },
  {
    codice: 'B',
    nome: 'Costo del venduto',
    tipo: 'COST',
    sottogruppi: [
      {
        codice: 'B1',
        nome: 'Beverage alcolico',
        voci: ['20.1.01', '20.1.02', '20.1.03', '20.1.04', '20.1.05'],
      },
      {
        codice: 'B2',
        nome: 'Beverage analcolico',
        voci: ['20.2.01', '20.2.02', '20.2.03', '20.2.04'],
      },
      {
        codice: 'B3',
        nome: 'Caffetteria',
        voci: ['20.3.01', '20.3.02', '20.3.03', '20.3.04'],
      },
      {
        codice: 'B4',
        nome: 'Food',
        voci: ['20.4.01', '20.4.02', '20.4.03', '20.4.04', '20.4.05'],
      },
      {
        codice: 'B5',
        nome: 'Consumabili di servizio',
        voci: ['20.5.01', '20.5.02', '20.5.03', '20.5.04', '20.5.05'],
      },
      { codice: 'B6', nome: 'Rettifiche su acquisti', voci: ['20.6.01'] },
    ],
  },
  {
    codice: 'C',
    nome: 'Costo del personale',
    tipo: 'COST',
    sottogruppi: [
      {
        codice: 'C1',
        nome: 'Retribuzioni',
        voci: [
          '28.1.01', '28.1.02', '28.1.03', '28.1.04', '28.1.05',
          '28.1.06', '28.1.07', '28.1.08', '28.1.09',
        ],
      },
      { codice: 'C2', nome: 'Oneri sociali', voci: ['28.2.01', '28.2.02', '28.2.03'] },
      { codice: 'C3', nome: 'TFR corrisposto', voci: ['28.3.02'] },
      {
        codice: 'C4',
        nome: 'Altri costi del personale',
        voci: ['28.4.01', '28.4.02', '28.4.03', '28.4.04', '28.4.05'],
      },
      {
        codice: 'C5',
        nome: 'Organi sociali e collaborazioni',
        voci: ['29.01', '29.02', '29.04', '29.05'],
      },
    ],
  },
  {
    codice: 'D',
    nome: 'Costi diretti eventi',
    tipo: 'COST',
    sottogruppi: [
      { codice: 'D1', nome: 'Artisti e service', voci: ['26.01', '26.02'] },
      { codice: 'D2', nome: 'Manodopera evento', voci: ['26.03', '26.05', '26.06'] },
      { codice: 'D3', nome: 'Promozione evento', voci: ['26.04', '26.07', '26.08'] },
      {
        codice: 'D4',
        nome: 'Oneri e allestimenti evento',
        voci: ['26.09', '26.10', '26.11'],
      },
    ],
  },
  {
    codice: 'E',
    nome: 'Costi di struttura',
    tipo: 'COST',
    sottogruppi: [
      { codice: 'E1', nome: 'Immobili e spazi', voci: ['27.01', '27.02', '27.03'] },
      {
        codice: 'E2',
        nome: 'Utenze',
        voci: ['22.01', '22.02', '22.03', '22.04', '22.05', '22.07'],
      },
      {
        codice: 'E3',
        nome: 'Noleggi, leasing e licenze',
        voci: ['27.04', '27.05', '27.06', '27.07', '27.08'],
      },
      {
        codice: 'E4',
        nome: 'Manutenzioni e servizi operativi',
        voci: ['23.01', '23.02', '23.03', '23.05', '23.07'],
      },
      {
        codice: 'E5',
        nome: 'Attrezzatura e allestimenti',
        voci: ['21.01', '21.02', '21.03', '21.04', '21.05', '21.06', '21.07'],
      },
      {
        codice: 'E6',
        nome: 'Servizi professionali e amministrativi',
        voci: [
          '24.01', '24.02', '24.03', '24.04', '24.05',
          '24.06', '24.07', '24.08', '24.09',
        ],
      },
      {
        codice: 'E7',
        nome: 'Marketing e comunicazione',
        voci: [
          '25.01', '25.02', '25.03', '25.04',
          '25.05', '25.06', '25.07', '25.08',
        ],
      },
      {
        codice: 'E8',
        nome: 'Tributi, assicurazioni e oneri diversi',
        voci: [
          '30.01', '30.02', '30.03', '30.04', '30.05', '30.06', '30.07',
          '30.08', '30.09', '30.10', '30.13', '30.14', '30.15',
        ],
      },
    ],
  },
  {
    codice: 'F',
    nome: 'Oneri finanziari',
    tipo: 'COST',
    sottogruppi: [
      {
        codice: 'F1',
        nome: 'Interessi passivi',
        voci: ['32.1.01', '32.1.02', '32.1.03', '32.1.04'],
      },
      {
        codice: 'F2',
        nome: 'Spese e servizi bancari',
        voci: ['32.2.01', '32.2.02', '32.2.03', '32.2.04'],
      },
      {
        // Decisione del committente (11 ago): le commissioni per circuito
        // stanno negli oneri finanziari e non nel costo del venduto, quindi
        // il margine di contribuzione non le assorbe. Il presidio è il KPI
        // "incidenza commissioni sui corrispettivi".
        codice: 'F3',
        nome: 'Commissioni su incassi',
        voci: ['32.3.01', '32.3.02', '32.3.03', '32.3.04', '32.3.05'],
      },
    ],
  },
  {
    codice: 'G',
    nome: 'Fisco e IVA',
    tipo: 'TAX',
    sottogruppi: [
      {
        codice: 'G1',
        nome: 'IVA incassata sui corrispettivi',
        voci: [],
        calcolato: 'IVA_ENTRATE',
      },
      {
        codice: 'G2',
        nome: 'IVA pagata sugli acquisti',
        voci: [],
        calcolato: 'IVA_USCITE',
      },
      { codice: 'G3', nome: 'F24 IVA', voci: ['40.3.01', '40.3.04'] },
      { codice: 'G4', nome: 'Imposte sul reddito', voci: ['40.3.02'] },
      { codice: 'G5', nome: 'Ritenute e contributi', voci: ['40.3.03'] },
    ],
  },
  {
    codice: 'H',
    nome: 'Investimenti',
    tipo: 'INVESTMENT',
    sottogruppi: [
      {
        codice: 'H1',
        nome: 'Acquisto immobilizzazioni',
        voci: ['40.1.01', '40.1.02', '40.1.03'],
      },
      { codice: 'H2', nome: 'Cessione cespiti', voci: ['40.1.04'] },
    ],
  },
  {
    codice: 'I',
    nome: 'Finanziamenti',
    tipo: 'FINANCING',
    sottogruppi: [
      { codice: 'I1', nome: 'Rimborso capitale', voci: ['40.2.01'] },
      { codice: 'I2', nome: 'Nuova finanza', voci: ['40.2.02'] },
      { codice: 'I3', nome: 'Soci', voci: ['40.2.03', '40.2.04'] },
    ],
  },
]

/**
 * Voci che restano nel piano dei conti ma non nel prospetto, perché non
 * toccano mai cassa o banca. Il motivo è parte del dato: serve a chi si chiede
 * perché un numero che vede in bilancio qui non c'è.
 */
export const VOCI_FUORI_CASSA: ReadonlyMap<string, string> = new Map([
  ['12.07', "Plusvalenza contabile; l'incasso della cessione è 40.1.04"],
  ['20.6.02', 'Variazione di magazzino, nessun esborso'],
  ['20.6.03', 'Variazione di magazzino, nessun esborso'],
  ['20.6.04', 'Riclassifica di valore, nessun esborso'],
  ['20.6.05', 'Riclassifica di valore, nessun esborso'],
  ['28.3.01', "Competenza; l'esborso è 28.3.02"],
  ['30.11', "Mancata entrata, non un'uscita"],
  ['30.12', 'Minusvalenza contabile'],
  ['31.01', 'Ammortamento: non tocca il conto'],
  ['31.02', 'Ammortamento: non tocca il conto'],
  ['31.03', 'Ammortamento: non tocca il conto'],
  ['31.04', 'Ammortamento: non tocca il conto'],
  ['31.05', 'Ammortamento: non tocca il conto'],
  ['31.06', 'Ammortamento: non tocca il conto'],
  ['31.07', 'Svalutazione: non tocca il conto'],
  ['33.01', 'Competenza; il versamento è 40.3.02'],
  ['33.02', 'Competenza; il versamento è 40.3.02'],
  ['33.03', 'Competenza; il versamento è 40.3.02'],
])

export const RIGHE_MEMO: readonly RigaMemo[] = [
  {
    codice: 'M1',
    nome: 'Totale manodopera',
    scopo:
      "Percentuale manodopera sugli incassi. Serve perché il lordo del " +
      "personale si ricompone in due pezzi: il netto su 28.1 e le ritenute " +
      'e i contributi su 40.3.03, versati il mese dopo.',
    somma: ['C', 'D2', 'G5'],
  },
  {
    codice: 'M2',
    nome: 'Margine eventi',
    scopo: 'Ricavi eventi meno costi diretti eventi: dice se gli eventi guadagnano.',
    somma: ['A2', 'D'],
  },
  {
    codice: 'M3',
    nome: 'Tesoreria interna',
    scopo:
      'Versamenti e giroconti. Si elidono nel consolidato — se non lo fanno, ' +
      'una gamba è stata registrata e l\'altra no.',
    voci: ['40.4.01', '40.4.02'],
  },
]

const SOTTOGRUPPO_PER_VOCE: ReadonlyMap<string, string> = new Map(
  RICLASSIFICAZIONE_CASH_FLOW.flatMap((famiglia) =>
    famiglia.sottogruppi.flatMap((sottogruppo) =>
      sottogruppo.voci.map((voce) => [voce, sottogruppo.codice] as const)
    )
  )
)

/**
 * Tutte le voci che il prospetto conosce: mappate, fuori cassa o nel memo.
 *
 * È il complemento del controllo C4: quello che non è qui dentro, e viene
 * movimentato, non compare in nessuna riga — e va detto invece di lasciarlo
 * sparire.
 */
export function vociRiconosciute(): ReadonlySet<string> {
  return new Set([
    ...SOTTOGRUPPO_PER_VOCE.keys(),
    ...VOCI_FUORI_CASSA.keys(),
    ...RIGHE_MEMO.flatMap((memo) => memo.voci ?? []),
  ])
}
