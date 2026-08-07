'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'

export type AccountType = 'RICAVO' | 'COSTO' | 'ATTIVO' | 'PASSIVO'
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

async function fetchAccounts(
  types?: AccountType[],
  imputableOnly?: boolean
): Promise<ComboboxAccount[]> {
  const params = new URLSearchParams()
  if (types && types.length > 0) params.set('types', types.join(','))
  if (imputableOnly) params.set('imputable', 'true')
  const qs = params.toString()

  const res = await fetch(`/api/accounts${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error('Errore nel caricamento dei conti')
  const json = await res.json()
  return json.accounts as ComboboxAccount[]
}

/**
 * Query dei conti condivisa da AccountCombobox e da chi ha bisogno solo dei
 * dati (es. useImputableAccounts). Stessa chiave per types+imputableOnly
 * equivalenti: niente fetch duplicati quando due punti della stessa vista
 * chiedono lo stesso filtro.
 *
 * La chiave usa una stringa normalizzata dei types (ordinati e uniti) invece
 * dell'array ricevuto: un array letterale passato inline dal chiamante ad
 * ogni render avrebbe reference diversa ma stesso contenuto, e react-query
 * rifarebbe la fetch inutilmente.
 */
export function useAccountsForCombobox(types?: AccountType[], imputableOnly?: boolean) {
  const normalizedTypes = types && types.length > 0 ? [...types].sort() : undefined
  const typesCacheKey = normalizedTypes?.join(',') ?? null

  return useQuery({
    queryKey: ['accounts', typesCacheKey, imputableOnly ?? false],
    queryFn: () => fetchAccounts(normalizedTypes, imputableOnly),
    staleTime: 60 * 1000,
  })
}

/**
 * Conti imputabili (piano v4) con la mappa costCenterRule per accountId, per
 * i form che devono sapere se il conto scelto richiede il centro di costo
 * (Task 13) senza dover renderizzare la combobox.
 */
export function useImputableAccounts(types?: AccountType[]) {
  const query = useAccountsForCombobox(types, true)

  const costCenterRuleByAccountId = React.useMemo(() => {
    const map = new Map<string, CostCenterRule>()
    for (const account of query.data ?? []) {
      map.set(account.id, account.costCenterRule)
    }
    return map
  }, [query.data])

  return { ...query, costCenterRuleByAccountId }
}
