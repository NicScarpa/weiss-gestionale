'use client'

import { useQuery } from '@tanstack/react-query'

// Il piano v4 (12 agosto 2026) ha aggiunto PATRIMONIALE: mancava qui, e senza
// di lui `types={['COSTO', 'PATRIMONIALE']}` (Task 8, imputazione righe
// fattura) non avrebbe nemmeno compilato — il tipo reale è in
// `prisma/schema.prisma` (`enum AccountType`), questo lo rispecchia per il
// bundle client.
export type AccountType = 'RICAVO' | 'COSTO' | 'ATTIVO' | 'PASSIVO' | 'PATRIMONIALE'
export type CostCenterRule = 'OBBLIGATORIO' | 'DEFAULT_STR'

export interface ComboboxAccount {
  id: string
  code: string
  name: string
  type: AccountType
  mastroCode: string | null
  mastroNome: string | null
  gruppoCode: string | null
  gruppoNome: string | null
  costCenterRule: CostCenterRule
}

/**
 * Costruisce la querystring di /api/accounts. Estratta a parte per poterla
 * testare senza montare react-query: l'unica logica non banale qui è
 * l'omissione dei parametri a valore di default (nessun types, includeInactive
 * false), condivisa da fetchAccounts e dalla chiave di cache di
 * useAccountsForCombobox.
 */
export function buildAccountsQueryString(
  types?: AccountType[],
  includeInactive?: boolean
): string {
  const params = new URLSearchParams()
  if (types && types.length > 0) params.set('types', types.join(','))
  if (includeInactive) params.set('includeInactive', 'true')
  return params.toString()
}

async function fetchAccounts(
  types?: AccountType[],
  includeInactive?: boolean
): Promise<ComboboxAccount[]> {
  const qs = buildAccountsQueryString(types, includeInactive)

  const res = await fetch(`/api/accounts${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error('Errore nel caricamento dei conti')
  const json = await res.json()
  return json.accounts as ComboboxAccount[]
}

/**
 * Query dei conti condivisa da AccountCombobox e da chi ha bisogno solo dei
 * dati (es. buildCostCenterRuleMap sul risultato). Stessa chiave per
 * types+includeInactive equivalenti: niente fetch duplicati quando due punti
 * della stessa vista chiedono lo stesso filtro.
 *
 * La chiave usa una stringa normalizzata dei types (ordinati e uniti) invece
 * dell'array ricevuto: un array letterale passato inline dal chiamante ad
 * ogni render avrebbe reference diversa ma stesso contenuto, e react-query
 * rifarebbe la fetch inutilmente.
 *
 * includeInactive di default è false (i form di registrazione non devono
 * proporre conti disattivati); i filtri di lista lo passano true per poter
 * ancora trovare movimenti storici legati a un conto nel frattempo
 * disattivato (Task 17).
 */
export function useAccountsForCombobox(
  types?: AccountType[],
  includeInactive?: boolean
) {
  const normalizedTypes = types && types.length > 0 ? [...types].sort() : undefined
  const typesCacheKey = normalizedTypes?.join(',') ?? null

  return useQuery({
    queryKey: ['accounts', typesCacheKey, includeInactive ?? false],
    queryFn: () => fetchAccounts(normalizedTypes, includeInactive),
    staleTime: 60 * 1000,
  })
}

/**
 * Mappa accountId → costCenterRule da una lista di conti già caricata
 * (Task 13). Estratta come funzione pura così i form che hanno già la
 * propria query di conti (stessa chiave di `AccountCombobox`) possono
 * derivare la regola del centro senza sottoscrivere una query aggiuntiva.
 */
export function buildCostCenterRuleMap(accounts: ComboboxAccount[]): Map<string, CostCenterRule> {
  const map = new Map<string, CostCenterRule>()
  for (const account of accounts) {
    map.set(account.id, account.costCenterRule)
  }
  return map
}

// Nota: questo modulo esponeva anche un filtro `imputableOnly` (voci del
// piano v4 con mastroCode valorizzato, via ?imputable=true su /api/accounts)
// pensato per i form economici. Rimosso nella revisione finale del piano v4
// perché non aveva mai avuto un consumer reale: nessun form lo passava mai a
// `true`, in tutti i punti d'uso restava sul default `false`. Vedi il report
// del fix wave per i dettagli della decisione.
