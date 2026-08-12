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
 *    `UNASSIGNED`, uno senza conto in `senzaContoNetto` (che non è una riga
 *    come le altre: ha la convenzione di segno opposta, vedi il suo commento).
 *    Sono le chiusure di cassa storiche, e nasconderle vorrebbe dire un report
 *    che non quadra con la prima nota.
 *
 * 3. I segni non si correggono. Ricavi e costi hanno formule opposte
 *    (avere − dare / dare − avere), così le voci di rettifica del piano —
 *    resi e sconti su vendite (10.09), resi su acquisti (20.6.01), rimanenze
 *    finali (20.6.03) — vengono fuori negative da sole, senza casi speciali.
 *
 * L'invariante che dà valore a tutto il resto: `margine` più `senzaContoNetto`
 * è uguale al netto avere − dare dei movimenti economici in ingresso. Vale
 * perché ricavi (avere − dare) meno costi (dare − avere) è proprio quella
 * somma: se una fetta si perde per strada, o viene contata due volte, o
 * finisce col segno sbagliato, i due lati non tornano più. I test la
 * verificano sia sul totale sia colonna per colonna, in centesimi interi.
 */

/** Colonna dei movimenti privi di centro di costo. */
export const UNASSIGNED = 'UNASSIGNED'

/** I tipi di conto del piano. Solo i primi due entrano nel conto economico. */
export type TipoConto = 'RICAVO' | 'COSTO' | 'ATTIVO' | 'PASSIVO' | 'PATRIMONIALE'

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
  /** L'id del conto: finisce sulla riga, per il drill-down verso la prima nota. */
  id: string
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
  /** Id del conto aggregato: serve a filtrare la prima nota dal drill-down. */
  accountId: string
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

/** Il terzetto in fondo a una colonna del report, in euro. */
export interface TotaliContoEconomico {
  /** Somma delle righe RICAVO. */
  ricavi: number
  /** Somma delle righe COSTO (positivo = costo sostenuto). */
  costi: number
  /**
   * `ricavi − costi`, sui soli movimenti **classificati**: `senzaContoNetto`
   * non ci entra, perché senza il tipo di conto non si può dire se quegli
   * importi siano ricavi o costi. È il numero che l'utente legge come
   * "risultato del periodo", ed è anche il motivo per cui può non quadrare
   * con la banca: se `senzaContoNetto` non è a zero, la differenza è lì.
   */
  margine: number
}

export interface ContoEconomico {
  /** Righe ordinate per codice voce. Include le voci che nettano a zero. */
  rows: RigaContoEconomico[]
  /**
   * Movimenti con importi ma senza conto, per centro. Ha le stesse chiavi di
   * `riga.amounts` ma **la convenzione di segno opposta**: qui è un netto
   * avere − dare (positivo = incasso, negativo = uscita), mentre nelle righe
   * un costo è positivo. Non è una riga della tabella e non va incolonnata
   * sotto le altre senza cambiarle segno: senza un tipo di conto non si può
   * dire se quegli importi siano ricavi o costi, e il netto è l'unica formula
   * applicabile — nonché l'unica che fa quadrare `margine + senzaContoNetto`
   * col netto della prima nota. Da qui il nome.
   */
  senzaContoNetto: Record<string, number>
  /** Totali di tutto il periodo, tutti i centri insieme. */
  totals: TotaliContoEconomico
  /**
   * Gli stessi totali per singola colonna (codice centro o `UNASSIGNED`),
   * già sommati in centesimi: il report li mostra in fondo a ogni colonna e
   * non deve risommare le celle in virgola mobile per ottenerli.
   */
  totalsPerColonna: Record<string, TotaliContoEconomico>
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

/**
 * Ordina i codici del piano segmento per segmento, confrontando come numeri i
 * segmenti che lo sono. L'ordine alfabetico oggi darebbe lo stesso risultato,
 * ma solo finché i segmenti restano di lunghezza fissa: il primo mastro che
 * arriva a dieci gruppi metterebbe '20.10.01' prima di '20.2.01'. Segmenti non
 * numerici (i codici legacy) ricadono sul confronto alfabetico, e il codice
 * più corto viene prima di uno che lo estende. Deterministico ovunque, a
 * differenza di `localeCompare`.
 */
function confrontaCodici(a: string, b: string): number {
  const segmentiA = a.split('.')
  const segmentiB = b.split('.')

  for (let i = 0; i < Math.max(segmentiA.length, segmentiB.length); i++) {
    const segA = segmentiA[i]
    const segB = segmentiB[i]
    if (segA === undefined) return -1
    if (segB === undefined) return 1
    if (segA === segB) continue

    const numA = Number(segA)
    const numB = Number(segB)
    if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) {
      return numA - numB
    }
    return segA < segB ? -1 : 1
  }

  return 0
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
  const senzaContoNetto = new Map<string, number>()

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
      // fette ne sono quote positive, quindi il segno glielo dà il movimento.
      // Si guarda al lato VALORIZZATO, non a quale campo è non-null: un dare a
      // zero con l'avere pieno è un movimento in avere. Con entrambi i lati a
      // zero il verso è convenzionalmente dare — ma lì nessuna fetta dovrebbe
      // esistere (la somma delle fette non può superare l'importo utile), e se
      // ce ne fosse una sarebbe dato corrotto, non un flusso reale.
      const versoDare = dare !== 0 || avere === 0
      let coperto = 0

      for (const fetta of movimento.allocations) {
        const quota = inCentesimi(fetta.importo)
        // Si conta anche la fetta su un conto non economico: quel denaro è
        // comunque uscito dalla testata, e ignorarlo qui lo farebbe ricomparire
        // nel residuo.
        coperto += quota
        if (!isEconomica(fetta.account)) continue
        accumula(
          fetta.account,
          colonna,
          versoDare
            ? importoEconomico(fetta.account.type, quota, 0)
            : importoEconomico(fetta.account.type, 0, quota)
        )
      }

      // Il residuo di testata. Fino al 12 ago 2026 questo blocco faceva
      // `continue` e il residuo spariva: un bonifico da 2.000 che saldava una
      // fattura da 1.222 mostrava 1.222 qui e 2.000 nel prospetto di cash
      // flow. La suddivisione totale non è garantita — è obbligatoria sul
      // DOCUMENTO, non sul movimento, che può contenere anche un acconto — e
      // la semantica giusta è quella di saldi.ts: la testata tiene il resto.
      const residuo = (versoDare ? dare : avere) - coperto
      if (residuo > 0 && movimento.account !== null && isEconomica(movimento.account)) {
        accumula(
          movimento.account,
          colonna,
          versoDare
            ? importoEconomico(movimento.account.type, residuo, 0)
            : importoEconomico(movimento.account.type, 0, residuo)
        )
      }
      continue
    }

    if (movimento.account === null) {
      // Netto avere − dare: senza un tipo di conto le due formule economiche
      // non si possono applicare. Un movimento a zero contribuisce zero, e la
      // colonna è già stata registrata: nessuna guardia da aggiungere.
      senzaContoNetto.set(colonna, (senzaContoNetto.get(colonna) ?? 0) + (avere - dare))
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
      accountId: voce.id,
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
    .sort((a, b) => confrontaCodici(a.code, b.code))

  // Ricavi e costi per colonna, sempre in centesimi: il report li mostra in
  // fondo a ogni centro, e il totale generale è la somma delle colonne — mai
  // una risomma delle celle in euro.
  const ricaviCentPerColonna = new Map<string, number>()
  const costiCentPerColonna = new Map<string, number>()
  for (const { voce, perColonna } of righe) {
    const destinazione =
      voce.type === 'RICAVO' ? ricaviCentPerColonna : costiCentPerColonna
    for (const [colonna, centesimi] of perColonna) {
      destinazione.set(colonna, (destinazione.get(colonna) ?? 0) + centesimi)
    }
  }

  const totalsPerColonna: Record<string, TotaliContoEconomico> = {}
  let ricaviCent = 0
  let costiCent = 0
  for (const colonna of colonne) {
    const ricavi = ricaviCentPerColonna.get(colonna) ?? 0
    const costi = costiCentPerColonna.get(colonna) ?? 0
    ricaviCent += ricavi
    costiCent += costi
    totalsPerColonna[colonna] = {
      ricavi: inEuro(ricavi),
      costi: inEuro(costi),
      margine: inEuro(ricavi - costi),
    }
  }

  return {
    rows,
    senzaContoNetto: celleInEuro(senzaContoNetto),
    totals: {
      ricavi: inEuro(ricaviCent),
      costi: inEuro(costiCent),
      margine: inEuro(ricaviCent - costiCent),
    },
    totalsPerColonna,
  }
}
