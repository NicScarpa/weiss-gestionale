'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const SENZA_CATEGORIA = 'Senza categoria'

interface AccountOption {
  id: string
  code: string
  name: string
  type: string
  budgetCategory?: { id: string; name: string } | null
}

interface AccountGroup {
  key: string
  label: string
  accounts: AccountOption[]
}

interface AccountGroupedSelectProps {
  value?: string
  onChange: (accountId: string) => void
  disabled?: boolean
  placeholder?: string
}

async function fetchAccounts(): Promise<AccountOption[]> {
  const res = await fetch('/api/accounts')
  if (!res.ok) throw new Error('Errore nel caricamento dei conti')
  const json = await res.json()
  return json.accounts as AccountOption[]
}

/**
 * Select dei conti attivi raggruppati per categoria di budget derivata
 * (AccountBudgetMapping, Fase 0). Condivisa tra editor di suddivisione e
 * futuri punti di imputazione (righe fattura, Fase 2).
 */
export function AccountGroupedSelect({
  value,
  onChange,
  disabled,
  placeholder = 'Seleziona conto',
}: AccountGroupedSelectProps) {
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts-grouped-by-category'],
    queryFn: fetchAccounts,
    staleTime: 60 * 1000,
  })

  const groups = React.useMemo<AccountGroup[]>(() => {
    const map = new Map<string, AccountGroup>()
    for (const account of accounts) {
      const key = account.budgetCategory?.id ?? '__senza_categoria__'
      const label = account.budgetCategory?.name ?? SENZA_CATEGORIA
      if (!map.has(key)) map.set(key, { key, label, accounts: [] })
      map.get(key)!.accounts.push(account)
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.key === '__senza_categoria__') return 1
      if (b.key === '__senza_categoria__') return -1
      return a.label.localeCompare(b.label, 'it')
    })
  }, [accounts])

  return (
    <Select
      value={value}
      onValueChange={onChange}
      disabled={disabled || isLoading}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={isLoading ? 'Caricamento conti...' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {groups.map((group) => (
          <SelectGroup key={group.key}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                <span className="font-medium">{account.code}</span>
                <span className="ml-2 text-muted-foreground">{account.name}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
