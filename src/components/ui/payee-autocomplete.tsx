'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronsUpDown, Building2, Clock } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDebounce } from '@/hooks/useDebounce'

interface PayeeSuggestion {
  name: string
  source: 'supplier' | 'historical'
  defaultAccountId?: string | null
}

interface PayeeAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onSupplierSelect?: (suggestion: PayeeSuggestion) => void
  venueId?: string
  disabled?: boolean
  className?: string
  placeholder?: string
}

export function PayeeAutocomplete({
  value,
  onChange,
  onSupplierSelect,
  venueId,
  disabled,
  className,
  placeholder = 'es. Fornitore XYZ',
}: PayeeAutocompleteProps) {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState(value)
  const [valorePrecedente, setValorePrecedente] = React.useState(value)

  const debouncedInput = useDebounce(inputValue, 300)

  // Sincronizza inputValue con value prop (per quando il valore cambia dall'esterno)
  if (value !== valorePrecedente) {
    setValorePrecedente(value)
    setInputValue(value)
  }

  // Suggerimenti per l'input debounced: sotto i 2 caratteri non si interroga il server
  const { data: suggestions = [], isFetching: loading } = useQuery({
    queryKey: ['payee-suggestions', debouncedInput, venueId],
    enabled: debouncedInput.length >= 2,
    retry: false,
    queryFn: async (): Promise<PayeeSuggestion[]> => {
      const params = new URLSearchParams({ q: debouncedInput })
      if (venueId) params.set('venueId', venueId)

      const res = await fetch(`/api/payee-suggestions?${params}`)
      if (!res.ok) throw new Error('Errore nel caricamento dei beneficiari')
      const data = await res.json()
      return data.suggestions || []
    },
  })

  const supplierSuggestions = suggestions.filter((s) => s.source === 'supplier')
  const historicalSuggestions = suggestions.filter((s) => s.source === 'historical')

  const handleSelect = (suggestion: PayeeSuggestion) => {
    setInputValue(suggestion.name)
    onChange(suggestion.name)
    onSupplierSelect?.(suggestion)
    setOpen(false)
  }

  const handleInputChange = (val: string) => {
    setInputValue(val)
    onChange(val)
    if (val.length >= 2 && !open) {
      setOpen(true)
    }
  }

  // Se il payee è auto-generato, renderizza come input disabilitato
  if (value.startsWith('[EXTRA]') || value.startsWith('[PAGATO]')) {
    return (
      <Input
        value={value}
        disabled
        className={className}
      />
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between font-normal',
            !value && 'text-muted-foreground',
            className
          )}
          disabled={disabled}
        >
          <span className="truncate">
            {value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Cerca beneficiario..."
            value={inputValue}
            onValueChange={handleInputChange}
          />
          <CommandList>
            <CommandEmpty>
              {loading
                ? 'Ricerca...'
                : inputValue.length < 2
                  ? 'Digita almeno 2 caratteri...'
                  : 'Nessun beneficiario trovato'}
            </CommandEmpty>

            {supplierSuggestions.length > 0 && (
              <CommandGroup heading="Fornitori">
                {supplierSuggestions.map((s) => (
                  <CommandItem
                    key={`supplier-${s.name}`}
                    value={s.name}
                    onSelect={() => handleSelect(s)}
                    className="min-h-[44px]"
                  >
                    <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">{s.name}</span>
                    <Check
                      className={cn(
                        'ml-2 h-4 w-4',
                        value === s.name ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {historicalSuggestions.length > 0 && (
              <CommandGroup heading="Recenti">
                {historicalSuggestions.map((s) => (
                  <CommandItem
                    key={`historical-${s.name}`}
                    value={s.name}
                    onSelect={() => handleSelect(s)}
                    className="min-h-[44px]"
                  >
                    <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">{s.name}</span>
                    <Check
                      className={cn(
                        'ml-2 h-4 w-4',
                        value === s.name ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
