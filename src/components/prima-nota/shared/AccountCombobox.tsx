'use client'

import * as React from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  useAccountsForCombobox,
  type AccountType,
  type ComboboxAccount,
} from '@/hooks/useImputableAccounts'

const ALTRI_CONTI_LABEL = 'Altri conti'
const SENZA_MASTRO_KEY = '__senza_mastro__'

interface AccountComboboxProps {
  value?: string
  onChange: (accountId: string | undefined) => void
  /** Filtra per tipo di conto (es. ['COSTO', 'RICAVO']); nessun filtro se omesso. */
  types?: AccountType[]
  /** Solo voci del piano v4 (mastroCode valorizzato): esclude patrimoniali e legacy. */
  imputableOnly?: boolean
  disabled?: boolean
  placeholder?: string
  /** Mostra in cima una voce per azzerare la selezione. */
  allowNone?: boolean
}

interface AccountGroup {
  key: string
  heading: string
  accounts: ComboboxAccount[]
}

/**
 * Raggruppa per mastro, preservando l'ordine per codice già applicato
 * dall'API. I conti senza mastro (patrimoniali/legacy, visibili solo quando
 * imputableOnly è false) finiscono sempre in un gruppo a parte in fondo.
 *
 * Esportata per essere testata come funzione pura: il progetto non ha
 * un'infrastruttura funzionante per il rendering dei componenti React (vedi
 * il report del Task 11), quindi la logica di raggruppamento — l'unica parte
 * non banale del componente — è verificata qui senza montare il DOM.
 */
export function groupByMastro(accounts: ComboboxAccount[]): AccountGroup[] {
  const map = new Map<string, AccountGroup>()
  for (const account of accounts) {
    const key = account.mastroCode ?? SENZA_MASTRO_KEY
    const heading = account.mastroCode
      ? `${account.mastroCode} — ${account.mastroNome}`
      : ALTRI_CONTI_LABEL
    if (!map.has(key)) map.set(key, { key, heading, accounts: [] })
    map.get(key)!.accounts.push(account)
  }

  const groups = Array.from(map.values())
  const senzaMastro = groups.findIndex((g) => g.key === SENZA_MASTRO_KEY)
  if (senzaMastro >= 0) {
    const [gruppo] = groups.splice(senzaMastro, 1)
    groups.push(gruppo)
  }
  return groups
}

/**
 * Valore su cui cmdk esegue la ricerca client-side (fuzzy match, default di
 * Command). Include code e name — la ricerca per gruppo (es. "20.1") funziona
 * di riflesso perché il gruppoCode è già prefisso del code di ogni conto
 * figlio — più il gruppoNome, per trovare un conto anche digitandolo.
 */
export function buildSearchValue(account: ComboboxAccount): string {
  return `${account.code} ${account.name} ${account.gruppoNome ?? ''}`
}

/**
 * Combobox con ricerca (client-side, su codice e nome) dei conti del piano
 * dei conti, raggruppati per mastro. Sostituisce AccountGroupedSelect nei
 * punti che devono gestire le ~155 voci del piano v4 (Task 12/17): con quel
 * volume una select senza ricerca è inservibile.
 */
export function AccountCombobox({
  value,
  onChange,
  types,
  imputableOnly = false,
  disabled,
  placeholder = 'Seleziona conto',
  allowNone = false,
}: AccountComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const { data: accounts = [], isLoading } = useAccountsForCombobox(types, imputableOnly)

  const groups = React.useMemo(() => groupByMastro(accounts), [accounts])
  const selected = React.useMemo(
    () => accounts.find((a) => a.id === value),
    [accounts, value]
  )

  const handleSelectAccount = (accountId: string) => {
    onChange(accountId)
    setOpen(false)
  }

  const handleSelectNone = () => {
    onChange(undefined)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || isLoading}
          className={cn(
            'w-full justify-between font-normal',
            !selected && 'text-muted-foreground'
          )}
        >
          <span className="truncate">
            {isLoading
              ? 'Caricamento conti...'
              : selected
                ? `${selected.code} — ${selected.name}`
                : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Cerca per codice o nome..." />
          <CommandList>
            <CommandEmpty>Nessun conto trovato</CommandEmpty>
            {allowNone && (
              <CommandGroup>
                <CommandItem value="__nessun_conto__ nessun conto" onSelect={handleSelectNone}>
                  <Check className={cn('mr-2 h-4 w-4 shrink-0', !value ? 'opacity-100' : 'opacity-0')} />
                  Nessun conto
                </CommandItem>
              </CommandGroup>
            )}
            {groups.map((group) => (
              <CommandGroup key={group.key} heading={group.heading}>
                {group.accounts.map((account) => (
                  <CommandItem
                    key={account.id}
                    value={buildSearchValue(account)}
                    onSelect={() => handleSelectAccount(account.id)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4 shrink-0',
                        value === account.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <span className="font-medium">{account.code}</span>
                    <span className="ml-2 flex-1 truncate">{account.name}</span>
                    {account.gruppoNome && (
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                        {account.gruppoNome}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
