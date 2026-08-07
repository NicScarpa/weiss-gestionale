/**
 * Aggregatore del conto economico per centro di costo.
 *
 * Funzione pura: nessun accesso al database, nessun `new Date()`, nessuna
 * dipendenza dal client Prisma generato. Riceve i movimenti del periodo già
 * letti (soft-delete esclusi, registri CASH+BANK) e l'elenco dei centri, e
 * restituisce la tabella pivot voce × centro che il report disegna.
 *
 * L'output è PIATTO a livello di voce: mastro e gruppo viaggiano denormalizzati
 * su ogni riga e l'albero mastro → gruppo → voce lo costruisce il client.
 *
 * Le tre regole che rendono il report leggibile:
 *
 * 1. Le fette vincono sulla testata. Un movimento suddiviso
 *    (`JournalEntryAllocation`) ha un `accountId` di testata che è solo il
 *    "dominante" derivato dalla fetta più grossa: contarlo insieme alle fette
 *    raddoppierebbe l'importo. Con le fette presenti la testata si ignora, e
 *    ogni fetta porta il proprio importo sulla propria voce. Il centro resta
 *    quello del movimento: le fette non ne hanno uno proprio.
 *
 * 2. Niente sparisce. Un movimento senza centro finisce nella colonna
 *    `UNASSIGNED`, uno senza conto nella riga `senzaConto`. Sono le chiusure
 *    di cassa storiche, e nasconderle vorrebbe dire un report che non quadra
 *    con la prima nota.
 *
 * 3. I segni non si correggono. Ricavi e costi hanno formule opposte
 *    (avere − dare / dare − avere), così le voci di rettifica del piano —
 *    resi e sconti su vendite (10.09), resi su acquisti (20.6.01), rimanenze
 *    finali (20.6.03) — vengono fuori negative da sole, senza casi speciali.
 *
 * L'invariante che dà valore a tutto il resto: `margine` più la riga
 * `senzaConto` è uguale al netto avere − dare dei movimenti economici in
 * ingresso. Vale perché ricavi (avere − dare) meno costi (dare − avere) è
 * proprio quella somma: se una fetta si perde per strada, o viene contata due
 * volte, o finisce col segno sbagliato, i due lati non tornano più. I test la
 * verificano sia sul totale sia colonna per colonna, in centesimi interi.
 */

/** Colonna dei movimenti privi di centro di costo. */
export const UNASSIGNED = 'UNASSIGNED'

/** I tipi di conto del piano. Solo i primi due entrano nel conto economico. */
export type TipoConto = 'RICAVO' | 'COSTO' | 'ATTIVO' | 'PASSIVO'

/** I tipi che il conto economico misura. */
export type TipoEconomico = 'RICAVO' | 'COSTO'

/**
 * Importo come arriva da Prisma (`Decimal`), o come numero/stringa nei test.
 *
 * Si accetta la forma strutturale invece di importare il `Decimal` di Prisma:
 * il modulo resta puro e i test si scrivono con numeri normali, ma un
 * `Prisma.Decimal` vero soddisfa il tipo e passa senza conversioni a monte.
 */
export type ImportoDecimale = number | string | { toNumber(): number }

/** La voce del piano dei conti, con mastro e gruppo denormalizzati. */
export interface VoceConto {
  code: string
  name: string
  type: TipoConto
  mastroCode: string | null
  mastroNome: string | null
  gruppoCode: string | null
  gruppoNome: string | null
}

/** Fetta di ripartizione: importo sempre positivo, verso quello del movimento. */
export interface FettaMovimento {
  accountId: string
  account: VoceConto
  importo: ImportoDecimale
}

/** Movimento di prima nota, con la sua eventuale suddivisione in fette. */
export interface MovimentoContoEconomico {
  id: string
  accountId: string | null
  account: VoceConto | null
  costCenter: { code: string } | null
  debitAmount: ImportoDecimale | null
  creditAmount: ImportoDecimale | null
  allocations: FettaMovimento[]
}

/** Riga del report: una voce del piano, con una cella per centro. */
export interface RigaContoEconomico {
  code: string
  name: string
  /** Solo RICAVO o COSTO: i patrimoniali non arrivano fin qui. */
  type: TipoEconomico
  mastroCode: string | null
  mastroNome: string | null
  gruppoCode: string | null
  gruppoNome: string | null
  /** Importi in euro per codice centro, più la chiave `UNASSIGNED`. */
  amounts: Record<string, number>
  /** Somma delle celle della riga, in euro. */
  total: number
}

export interface ContoEconomico {
  /** Righe ordinate per codice voce. Include le voci che nettano a zero. */
  rows: RigaContoEconomico[]
  /**
   * Movimenti con importi ma senza conto: netto avere − dare per centro.
   * Senza un tipo di conto non si può dire se siano ricavo o costo, quindi
   * si usa la stessa convenzione netta del margine (positivo = incasso).
   * Fuori dai totali: sono importi da classificare, non da sommare a occhio.
   */
  senzaConto: Record<string, number>
  totals: {
    /** Somma delle righe RICAVO, in euro. */
    ricavi: number
    /** Somma delle righe COSTO, in euro (positivo = costo sostenuto). */
    costi: number
    /** `ricavi − costi`. */
    margine: number
  }
}

/**
 * Converte un importo in centesimi interi.
 *
 * Tutta l'aggregazione lavora in centesimi. Gli importi sono `Decimal(10,2)`:
 * l'informazione ci sta tutta in un intero, e sommare interi è esatto. Sommare
 * euro in virgola mobile no — `0.1 + 0.2` fa `0.30000000000000004` — e la
 * quadratura del report salterebbe proprio dove serve di più.
 *
 * `Math.round(valore * 100)` è esatto per qualunque importo a due decimali
 * ben sotto i 9e13: l'errore del double resta molti ordini di grandezza sotto
 * il mezzo centesimo, quindi l'arrotondamento cade sempre sull'intero giusto.
 * Fuori da quel dominio — un terzo decimale, che in colonna non può esserci —
 * si arrotonda al centesimo più vicino.
 */
export function inCentesimi(importo: ImportoDecimale | null | undefined): number {
  if (importo === null || importo === undefined) {
    return 0
  }

  const valore = typeof importo === 'object' ? importo.toNumber() : Number(importo)
  return Number.isFinite(valore) ? Math.round(valore * 100) : 0
}

/** Da centesimi interi a euro, un solo punto di conversione in tutto il modulo. */
function inEuro(centesimi: number): number {
  return centesimi / 100
}

/**
 * Importo economico di un contributo, in centesimi.
 * Ricavo: avere − dare. Costo: dare − avere. Un ricavo registrato in dare
 * (un reso) e un costo registrato in avere (le rimanenze finali) diventano
 * negativi da soli, che è esattamente ciò che il piano si aspetta.
 */
function importoEconomico(tipo: TipoEconomico, dare: number, avere: number): number {
  return tipo === 'RICAVO' ? avere - dare : dare - avere
}

/** La stessa voce, ristretta ai tipi che entrano nelle righe del report. */
type VoceEconomica = VoceConto & { type: TipoEconomico }

/** Patrimoniali e giroconti cassa/banca si fermano qui. */
function isEconomica(voce: VoceConto): voce is VoceEconomica {
  return voce.type === 'RICAVO' || voce.type === 'COSTO'
}

interface Accumulatore {
  voce: VoceEconomica
  perColonna: Map<string, number>
}

/**
 * Aggrega i movimenti del periodo nella tabella voce × centro del conto
 * economico.
 *
 * @param movimenti Movimenti già filtrati a monte per periodo, sede e registro.
 * @param centri Centri di costo, nell'ordine in cui il report vuole le colonne.
 *   Un centro assente qui ma presente sui movimenti non viene perso: la sua
 *   colonna si aggiunge in coda.
 */
export function aggregaContoEconomico(
  movimenti: MovimentoContoEconomico[],
  centri: Array<{ code: string }>
): ContoEconomico {
  // Le colonne partono dai centri dati e crescono solo se un movimento porta
  // un centro sconosciuto: la tabella resta rettangolare e non perde importi.
  const colonne: string[] = []
  const registraColonna = (code: string) => {
    if (!colonne.includes(code)) {
      colonne.push(code)
    }
    return code
  }
  centri.forEach((centro) => registraColonna(centro.code))
  registraColonna(UNASSIGNED)

  // Chiave: il codice della voce, che è unico nel piano.
  const perVoce = new Map<string, Accumulatore>()
  const senzaConto = new Map<string, number>()

  const accumula = (voce: VoceEconomica, colonna: string, centesimi: number) => {
    let riga = perVoce.get(voce.code)
    if (!riga) {
      riga = { voce, perColonna: new Map() }
      perVoce.set(voce.code, riga)
    }
    riga.perColonna.set(colonna, (riga.perColonna.get(colonna) ?? 0) + centesimi)
  }

  for (const movimento of movimenti) {
    const colonna = registraColonna(movimento.costCenter?.code ?? UNASSIGNED)
    const dare = inCentesimi(movimento.debitAmount)
    const avere = inCentesimi(movimento.creditAmount)

    if (movimento.allocations.length > 0) {
      // Il verso del movimento: l'importo utile sta tutto su un lato solo e le
      // fette ne sono quote positive. Se per qualche ragione fossero valorizzati
      // entrambi i lati vince dare, come nel calcolo lato scrittura.
      const versoDare = dare !== 0 || avere === 0

      for (const fetta of movimento.allocations) {
        if (!isEconomica(fetta.account)) {
          continue
        }
        const quota = inCentesimi(fetta.importo)
        accumula(
          fetta.account,
          colonna,
          versoDare
            ? importoEconomico(fetta.account.type, quota, 0)
            : importoEconomico(fetta.account.type, 0, quota)
        )
      }
      continue
    }

    if (movimento.account === null) {
      if (dare !== 0 || avere !== 0) {
        senzaConto.set(colonna, (senzaConto.get(colonna) ?? 0) + (avere - dare))
      }
      continue
    }

    if (!isEconomica(movimento.account)) {
      continue
    }
    accumula(
      movimento.account,
      colonna,
      importoEconomico(movimento.account.type, dare, avere)
    )
  }

  // Le colonne sono tutte note solo adesso: le celle si scrivono qui, così
  // ogni riga ha le stesse chiavi e il pivot esce rettangolare.
  const celleInEuro = (perColonna: Map<string, number>): Record<string, number> => {
    const amounts: Record<string, number> = {}
    for (const colonna of colonne) {
      amounts[colonna] = inEuro(perColonna.get(colonna) ?? 0)
    }
    return amounts
  }

  const totaleCent = (perColonna: Map<string, number>): number =>
    [...perColonna.values()].reduce((somma, cella) => somma + cella, 0)

  const righe = [...perVoce.values()]

  const rows: RigaContoEconomico[] = righe
    .map(({ voce, perColonna }) => ({
      code: voce.code,
      name: voce.name,
      type: voce.type,
      mastroCode: voce.mastroCode,
      mastroNome: voce.mastroNome,
      gruppoCode: voce.gruppoCode,
      gruppoNome: voce.gruppoNome,
      amounts: celleInEuro(perColonna),
      total: inEuro(totaleCent(perColonna)),
    }))
    // I codici del piano hanno segmenti di lunghezza fissa ("10.01",
    // "20.6.01"): l'ordine alfabetico è già quello giusto, ed è deterministico
    // ovunque, a differenza di `localeCompare`.
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))

  const totalePerTipo = (tipo: TipoEconomico): number =>
    righe.reduce(
      (somma, riga) => (riga.voce.type === tipo ? somma + totaleCent(riga.perColonna) : somma),
      0
    )

  const ricaviCent = totalePerTipo('RICAVO')
  const costiCent = totalePerTipo('COSTO')

  return {
    rows,
    senzaConto: celleInEuro(senzaConto),
    totals: {
      ricavi: inEuro(ricaviCent),
      costi: inEuro(costiCent),
      margine: inEuro(ricaviCent - costiCent),
    },
  }
}
