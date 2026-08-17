import { Prisma } from '@prisma/client'
import { encrypt, decrypt, isEncrypted, lookupHash } from './encryption'

/**
 * Map of model names to their sensitive fields that require encryption.
 * Fields: IBAN, codice fiscale, VAT number, salary-related fields.
 */
const SENSITIVE_FIELDS: Record<string, string[]> = {
  BankAccount: ['iban'],
  Supplier: ['fiscalCode', 'iban'],
  Customer: ['codiceFiscale', 'iban'],
  User: ['fiscalCode', 'vatNumber'],
  Schedule: ['controparteIban'],
  Payment: ['beneficiarioIban'],
  InvoiceDeadline: ['iban'],
}

/**
 * Campi cifrati che hanno una colonna hash deterministica affiancata
 * (HMAC-SHA256) per permettere ricerche di uguaglianza: la cifratura
 * AES-GCM con IV casuale rende il ciphertext non ricercabile.
 */
const HASH_FIELDS: Record<string, Record<string, string>> = {
  Supplier: { fiscalCode: 'fiscalCodeHash' },
  Customer: { codiceFiscale: 'codiceFiscaleHash' },
  BankAccount: { iban: 'ibanHash' },
}

/**
 * Mappa nome-relazione → modello, per decifrare anche i record annidati
 * restituiti dagli `include`. Copre le relazioni dei modelli sensibili.
 */
const RELATION_MODEL: Record<string, string> = {
  supplier: 'Supplier',
  suppliers: 'Supplier',
  bankAccount: 'BankAccount',
  bankAccounts: 'BankAccount',
  customer: 'Customer',
  customers: 'Customer',
  user: 'User',
  users: 'User',
  createdBy: 'User',
  updatedBy: 'User',
  employee: 'User',
  approvedBy: 'User',
  schedule: 'Schedule',
  schedules: 'Schedule',
  payment: 'Payment',
  payments: 'Payment',
  invoiceDeadline: 'InvoiceDeadline',
  invoiceDeadlines: 'InvoiceDeadline',
}

function encryptFields(model: string, data: Record<string, unknown> | undefined): void {
  if (!data) return
  const fields = SENSITIVE_FIELDS[model]
  if (!fields) return

  const hashMap = HASH_FIELDS[model]

  for (const field of fields) {
    const value = data[field]
    if (typeof value === 'string' && value.length > 0) {
      // Hash di lookup calcolato sul valore in chiaro, prima della cifratura
      if (hashMap?.[field] && !isEncrypted(value)) {
        data[hashMap[field]] = lookupHash(value)
      }
      if (!isEncrypted(value)) {
        data[field] = encrypt(value)
      }
    } else if (value === null && hashMap?.[field]) {
      // Campo azzerato → azzera anche l'hash
      data[hashMap[field]] = null
    }
  }
}

function decryptFields(model: string, record: Record<string, unknown> | null | undefined): void {
  if (!record) return
  const fields = SENSITIVE_FIELDS[model]
  if (!fields) return

  for (const field of fields) {
    const value = record[field]
    if (typeof value === 'string' && value.length > 0 && isEncrypted(value)) {
      try {
        record[field] = decrypt(value)
      } catch {
        // If decryption fails, leave value as-is (may be plaintext during migration)
      }
    }
  }
}

const MAX_DEPTH = 4

/**
 * Decifra il record del modello principale E le relazioni incluse
 * (annidate fino a MAX_DEPTH livelli), riconosciute per nome campo.
 */
function deepDecrypt(model: string | null, result: unknown, depth = 0): void {
  if (!result || depth > MAX_DEPTH) return

  if (Array.isArray(result)) {
    for (const item of result) deepDecrypt(model, item, depth)
    return
  }

  if (typeof result !== 'object') return
  const record = result as Record<string, unknown>

  if (model && SENSITIVE_FIELDS[model]) {
    decryptFields(model, record)
  }

  for (const [key, value] of Object.entries(record)) {
    if (value && typeof value === 'object') {
      const relModel = RELATION_MODEL[key] ?? null
      deepDecrypt(relModel, value, depth + 1)
    }
  }
}

function decryptResult(model: string, result: unknown): void {
  deepDecrypt(model, result)
}

/**
 * Le operazioni che confrontano il campo con un *valore*. Sul cifrato non
 * trovano mai niente: due scritture dello stesso dato danno due testi cifrati
 * diversi (AES-GCM con IV casuale).
 *
 * `not` è nell'elenco ma vale solo con un valore accanto: `{ not: null }` è un
 * test di presenza, e quello sul cifrato funziona benissimo — il testo cifrato
 * è comunque non nullo. «Dammi i fornitori che hanno la partita IVA» è una
 * domanda legittima, e bocciarla romperebbe codice corretto.
 */
const CONFRONTI_CON_VALORE = [
  'equals',
  'not',
  'in',
  'notIn',
  'contains',
  'startsWith',
  'endsWith',
  'search',
  'lt',
  'lte',
  'gt',
  'gte',
] as const

/** Involucri di Prisma che introducono un filtro su un modello collegato. */
const INVOLUCRI_RELAZIONE = ['is', 'isNot', 'some', 'every', 'none'] as const

/**
 * I nomi di relazione che portano a un modello con campi cifrati: cercare la
 * fattura «del fornitore con quel codice fiscale» è lo stesso difetto un passo
 * più in là. Si calcola una volta sola, all'avvio, e serve a non scendere
 * dentro relazioni che non possono contenere il problema.
 */
const RELAZIONI_SENSIBILI = new Set(
  Object.entries(RELATION_MODEL)
    .filter(([, modello]) => SENSITIVE_FIELDS[modello])
    .map(([relazione]) => relazione)
)

/** Un valore che non sia `null`: `{ equals: null }` e `null` sono presenza, non ricerca. */
function eUnValore(valore: unknown): boolean {
  if (valore === null || valore === undefined) return false
  if (Array.isArray(valore)) return valore.some((v) => v !== null && v !== undefined)
  return true
}

/** Il filtro su questo campo confronta con un valore, o si limita a chiedere se c'è? */
function cercaUnValore(filtro: unknown): boolean {
  if (filtro === null || filtro === undefined) return false
  if (typeof filtro !== 'object') return true // forma breve: { campo: 'ABC' }
  if (Array.isArray(filtro)) return eUnValore(filtro)

  const oggetto = filtro as Record<string, unknown>
  return CONFRONTI_CON_VALORE.some((op) => op in oggetto && eUnValore(oggetto[op]))
}

/** Tutte le chiavi che compaiono nell'albero del where, a qualsiasi profondità. */
function chiaviPresenti(nodo: unknown, raccolte = new Set<string>()): Set<string> {
  if (!nodo || typeof nodo !== 'object') return raccolte
  if (Array.isArray(nodo)) {
    for (const voce of nodo) chiaviPresenti(voce, raccolte)
    return raccolte
  }
  for (const [chiave, valore] of Object.entries(nodo as Record<string, unknown>)) {
    raccolte.add(chiave)
    chiaviPresenti(valore, raccolte)
  }
  return raccolte
}

function messaggioDiErrore(model: string, campo: string, hash: string | undefined): string {
  if (hash) {
    return (
      `Ricerca su ${model}.${campo}, che è cifrato: il confronto con un valore non ` +
      `troverà mai niente e restituirà un elenco vuoto senza errori. Usa la colonna ` +
      `${hash} con lookupHash(valore) da src/lib/encryption.ts. ` +
      `Il test di presenza ({ not: null }) invece va bene e non passa di qui.`
    )
  }
  return (
    `Ricerca su ${model}.${campo}, che è cifrato e non ha una colonna hash affiancata: ` +
    `il confronto con un valore non troverà mai niente e restituirà un elenco vuoto ` +
    `senza errori. Per cercare su questo campo serve una migrazione che aggiunga ` +
    `${campo}Hash (vedi Supplier.fiscalCodeHash) e il backfill dei record esistenti. ` +
    `Il test di presenza ({ not: null }) invece va bene e non passa di qui.`
  )
}

/**
 * Ferma le ricerche che confrontano un campo cifrato con un valore.
 *
 * Sta qui e non in un test sul sorgente per una ragione precisa: il `where`
 * spesso non è un letterale, viene costruito a pezzi riga per riga o passato
 * da una funzione all'altra. Un controllo statico non lo vedrebbe, resterebbe
 * verde e sembrerebbe dire «nessuno cerca su campi cifrati». Qui invece passa
 * ogni query, comunque sia stata scritta.
 *
 * Esportata per poterla provare da sola: l'estensione la chiama prima di ogni
 * lettura.
 */
export function verificaRicercaSuCifrati(model: string, where: unknown): void {
  if (!where || typeof where !== 'object') return

  // Nessuna uscita anticipata sul modello di partenza: `ElectronicInvoice` non
  // ha campi cifrati, ma `{ supplier: { fiscalCode } }` cerca dentro il campo
  // cifrato del fornitore. Il risparmio si ottiene invece scendendo solo dove
  // il problema può esserci — OR/AND/NOT e le relazioni sensibili — così su un
  // where qualunque questa resta una sola passata sulle sue chiavi.
  if (!SENSITIVE_FIELDS[model] && RELAZIONI_SENSIBILI.size === 0) return

  // La regola del ripiego legittimo: se da qualche parte nello stesso `where`
  // si cerca anche per hash, il confronto sul chiaro è il fallback deliberato
  // per i record scritti prima della cifratura (vedi src/lib/sdi/matcher.ts).
  // È una regola sull'intero albero, non sul singolo ramo, perché nell'uso
  // reale hash e chiaro stanno in due rami fratelli di uno stesso OR.
  const presenti = chiaviPresenti(where)

  const visita = (nodo: unknown, modelloCorrente: string): void => {
    if (!nodo || typeof nodo !== 'object') return
    if (Array.isArray(nodo)) {
      for (const voce of nodo) visita(voce, modelloCorrente)
      return
    }

    const campiCifrati = SENSITIVE_FIELDS[modelloCorrente] ?? []
    const hashDelModello = HASH_FIELDS[modelloCorrente] ?? {}

    for (const [chiave, valore] of Object.entries(nodo as Record<string, unknown>)) {
      if (chiave === 'OR' || chiave === 'AND' || chiave === 'NOT') {
        visita(valore, modelloCorrente)
        continue
      }

      if (campiCifrati.includes(chiave)) {
        const hash = hashDelModello[chiave]
        if (hash && presenti.has(hash)) continue
        if (cercaUnValore(valore)) {
          throw new Error(messaggioDiErrore(modelloCorrente, chiave, hash))
        }
        continue
      }

      // Relazione: il filtro dentro riguarda un altro modello. Si scende solo
      // se quel modello ha campi cifrati, altrimenti non c'è nulla da trovare.
      if (RELAZIONI_SENSIBILI.has(chiave) && valore && typeof valore === 'object') {
        visita(valore, RELATION_MODEL[chiave])
        continue
      }

      if (INVOLUCRI_RELAZIONE.includes(chiave as (typeof INVOLUCRI_RELAZIONE)[number])) {
        visita(valore, modelloCorrente)
      }
    }
  }

  visita(where, model)
}

type QueryArgs = { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown>; model: string }

/**
 * Prisma client extension that automatically encrypts sensitive fields
 * (IBAN, codice fiscale, VAT number) on write and decrypts on read.
 * On write it also maintains the deterministic lookup-hash columns
 * (fiscalCodeHash, ibanHash) used for equality searches.
 */
export const fieldEncryptionExtension = Prisma.defineExtension({
  query: {
    $allModels: {
      async create({ args, query, model }: QueryArgs) {
        if (SENSITIVE_FIELDS[model]) {
          encryptFields(model, args.data as Record<string, unknown>)
        }
        const result = await query(args)
        decryptResult(model, result)
        return result
      },
      async createMany({ args, query, model }: QueryArgs) {
        if (SENSITIVE_FIELDS[model]) {
          const data = args.data
          if (Array.isArray(data)) {
            for (const item of data) {
              encryptFields(model, item as Record<string, unknown>)
            }
          } else {
            encryptFields(model, data as Record<string, unknown>)
          }
        }
        return query(args)
      },
      async update({ args, query, model }: QueryArgs) {
        verificaRicercaSuCifrati(model, args.where)
        if (SENSITIVE_FIELDS[model]) {
          encryptFields(model, args.data as Record<string, unknown>)
        }
        const result = await query(args)
        decryptResult(model, result)
        return result
      },
      async updateMany({ args, query, model }: QueryArgs) {
        verificaRicercaSuCifrati(model, args.where)
        if (SENSITIVE_FIELDS[model]) {
          encryptFields(model, args.data as Record<string, unknown>)
        }
        return query(args)
      },
      async upsert({ args, query, model }: QueryArgs) {
        if (SENSITIVE_FIELDS[model]) {
          encryptFields(model, (args as Record<string, unknown>).create as Record<string, unknown>)
          encryptFields(model, (args as Record<string, unknown>).update as Record<string, unknown>)
        }
        const result = await query(args)
        decryptResult(model, result)
        return result
      },
      async findUnique({ args, query, model }: QueryArgs) {
        verificaRicercaSuCifrati(model, args.where)
        const result = await query(args)
        decryptResult(model, result)
        return result
      },
      async findUniqueOrThrow({ args, query, model }: QueryArgs) {
        verificaRicercaSuCifrati(model, args.where)
        const result = await query(args)
        decryptResult(model, result)
        return result
      },
      async findFirst({ args, query, model }: QueryArgs) {
        verificaRicercaSuCifrati(model, args.where)
        const result = await query(args)
        decryptResult(model, result)
        return result
      },
      async findFirstOrThrow({ args, query, model }: QueryArgs) {
        verificaRicercaSuCifrati(model, args.where)
        const result = await query(args)
        decryptResult(model, result)
        return result
      },
      async findMany({ args, query, model }: QueryArgs) {
        verificaRicercaSuCifrati(model, args.where)
        const result = await query(args)
        decryptResult(model, result)
        return result
      },
      // Anche le operazioni che non leggono: un `deleteMany` o un `updateMany`
      // che filtra su un campo cifrato non cancella e non aggiorna nulla, e
      // pure lì il silenzio è il problema. `count` chiude il caso in cui il
      // guasto si traveste da «zero risultati».
      async count({ args, query, model }: QueryArgs) {
        verificaRicercaSuCifrati(model, args.where)
        return query(args)
      },
      async aggregate({ args, query, model }: QueryArgs) {
        verificaRicercaSuCifrati(model, args.where)
        return query(args)
      },
      async groupBy({ args, query, model }: QueryArgs) {
        verificaRicercaSuCifrati(model, args.where)
        return query(args)
      },
      async delete({ args, query, model }: QueryArgs) {
        verificaRicercaSuCifrati(model, args.where)
        const result = await query(args)
        decryptResult(model, result)
        return result
      },
      async deleteMany({ args, query, model }: QueryArgs) {
        verificaRicercaSuCifrati(model, args.where)
        return query(args)
      },
    },
  },
})
