/**
 * Cosa manda davvero GoCardless per Banca della Marca.
 *
 * Misurato sul campo il 12 agosto 2026 (referto in
 * `docs/gocardless-referto-2026-08-12.md`): dei campi previsti dallo standard
 * ne arrivano **nove**, e la controparte non è fra questi. `creditorName` e
 * `debtorName` sono dichiarati qui come facoltativi perché un altro istituto
 * potrebbe mandarli, ma nessun codice a valle può darli per presenti: per
 * Banca della Marca il nome della controparte vive dentro
 * `remittanceInformationUnstructured`. `creditorAccount`/`debtorAccount` non
 * sono nemmeno tipizzati — l'IBAN della controparte non entra nel sistema, e
 * un tipo che lo prevede invita a persisterlo.
 */
import { z } from 'zod'

/**
 * L'importo arriva come **stringa** e come stringa deve restare fino a
 * PostgreSQL, che ha una colonna `Decimal(12,2)`. Passare da `number`
 * introdurrebbe un binario a virgola mobile fra due rappresentazioni decimali
 * esatte, ed è così che si perdono i centesimi.
 */
export const importoSchema = z.object({
  amount: z.string(),
  currency: z.string(),
})

export const movimentoSchema = z.object({
  transactionId: z.string(),
  internalTransactionId: z.string().optional(),
  entryReference: z.string().optional(),
  endToEndId: z.string().optional(),
  bookingDate: z.string(),
  valueDate: z.string().optional(),
  transactionAmount: importoSchema,
  remittanceInformationUnstructured: z.string().optional(),
  remittanceInformationUnstructuredArray: z.array(z.string()).optional(),
  proprietaryBankTransactionCode: z.string().optional(),
  bankTransactionCode: z.string().optional(),
  creditorName: z.string().optional(),
  debtorName: z.string().optional(),
})

export const rispostaMovimentiSchema = z.object({
  transactions: z.object({
    booked: z.array(movimentoSchema),
    // La banca non manda `pending`. Il default evita un ramo `?? []` in ogni
    // punto che li legge.
    pending: z.array(movimentoSchema).default([]),
  }),
})

export const saldoSchema = z.object({
  balanceAmount: importoSchema,
  balanceType: z.string(),
  referenceDate: z.string().optional(),
})

export const rispostaSaldiSchema = z.object({
  balances: z.array(saldoSchema),
})

export const rispostaDettagliSchema = z.object({
  account: z.object({
    resourceId: z.string().optional(),
    iban: z.string().optional(),
    currency: z.string().optional(),
    ownerName: z.string().optional(),
    product: z.string().optional(),
    cashAccountType: z.string().optional(),
    bic: z.string().optional(),
  }),
})

export const istituzioneSchema = z.object({
  id: z.string(),
  name: z.string(),
  bic: z.string().optional(),
  transaction_total_days: z.union([z.string(), z.number()]).optional(),
  max_access_valid_for_days: z.union([z.string(), z.number()]).optional(),
})

export type Movimento = z.infer<typeof movimentoSchema>
export type RispostaMovimenti = z.infer<typeof rispostaMovimentiSchema>
export type RispostaSaldi = z.infer<typeof rispostaSaldiSchema>
export type RispostaDettagli = z.infer<typeof rispostaDettagliSchema>
export type Istituzione = z.infer<typeof istituzioneSchema>
