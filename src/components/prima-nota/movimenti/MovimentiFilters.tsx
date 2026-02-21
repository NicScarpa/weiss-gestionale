'use client'

import { Label } from '@/components/ui/label'
import { SearchInput } from '../shared/FiltersToolbar'
import { DateRangePicker } from '../shared/FiltersToolbar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ENTRY_TYPE_LABELS, RegisterType } from '@/types/prima-nota'

interface MovimentiFiltersProps {
  registerType?: RegisterType
  onRegisterTypeChange?: (value: RegisterType | undefined) => void
  dateFrom?: Date
  dateTo?: Date
  onDateRangeChange?: (range: { from?: Date; to?: Date }) => void
  entryType?: string
  onEntryTypeChange?: (value: string | undefined) => void
  accountId?: string
  onAccountIdChange?: (value: string | undefined) => void
  budgetCategoryId?: string
  onBudgetCategoryIdChange?: (value: string | undefined) => void
  verified?: boolean
  onVerifiedChange?: (value: boolean | undefined) => void
  search?: string
  onSearchChange?: (value: string) => void
  accountOptions?: Array<{ id: string; name: string; code: string }>
  budgetCategoryOptions?: Array<{ id: string; name: string; code: string; color?: string }>
  filterCount?: number
  onClearFilters?: () => void
}

export function MovimentiFilters({
  registerType,
  onRegisterTypeChange,
  dateFrom,
  dateTo,
  onDateRangeChange,
  entryType,
  onEntryTypeChange,
  accountId,
  onAccountIdChange,
  budgetCategoryId,
  onBudgetCategoryIdChange,
  verified,
  onVerifiedChange,
  search,
  onSearchChange,
  accountOptions = [],
  budgetCategoryOptions = [],
  filterCount = 0,
  onClearFilters,
}: MovimentiFiltersProps) {
  const ALL = '__all__'

  const entryTypeOptions = [
    { value: ALL, label: 'Tutti i tipi' },
    ...Object.entries(ENTRY_TYPE_LABELS).map(([key, label]) => ({ value: key, label })),
  ]

  const registerTypeOptions = [
    { value: ALL, label: 'Tutti i registri' },
    { value: 'CASH', label: 'Cassa' },
    { value: 'BANK', label: 'Banca' },
  ]

  const verifiedOptions = [
    { value: ALL, label: 'Tutti gli stati' },
    { value: 'true', label: 'Solo verificati' },
    { value: 'false', label: 'Solo non verificati' },
  ]

  return (
    <div className="space-y-3">
      {/* Prima riga: Ricerca e Date Range */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px]">
          <SearchInput
            value={search}
            onChange={onSearchChange}
            placeholder="Cerca movimenti..."
          />
        </div>
        <div className="min-w-[200px]">
          <DateRangePicker
            value={{ from: dateFrom, to: dateTo }}
            onChange={onDateRangeChange}
          />
        </div>
      </div>

      {/* Seconda riga: Filtri dettagliati */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* Registro */}
        <div className="min-w-[150px]">
          <Label htmlFor="filter-register" className="text-xs text-muted-foreground">
            Registro
          </Label>
          <Select
            value={registerType ?? ALL}
            onValueChange={(v) => onRegisterTypeChange?.(v === ALL ? undefined : v as RegisterType)}
          >
            <SelectTrigger id="filter-register">
              <SelectValue placeholder="Tutti i registri" />
            </SelectTrigger>
            <SelectContent>
              {registerTypeOptions.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tipo movimento */}
        <div className="min-w-[150px]">
          <Label htmlFor="filter-entry-type" className="text-xs text-muted-foreground">
            Tipo
          </Label>
          <Select
            value={entryType ?? ALL}
            onValueChange={(v) => onEntryTypeChange?.(v === ALL ? undefined : v)}
          >
            <SelectTrigger id="filter-entry-type">
              <SelectValue placeholder="Tutti i tipi" />
            </SelectTrigger>
            <SelectContent>
              {entryTypeOptions.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Conto */}
        <div className="min-w-[200px]">
          <Label htmlFor="filter-account" className="text-xs text-muted-foreground">
            Conto
          </Label>
          <Select value={accountId} onValueChange={onAccountIdChange}>
            <SelectTrigger id="filter-account">
              <SelectValue placeholder="Tutti i conti" />
            </SelectTrigger>
            <SelectContent>
              {accountOptions.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  <span className="font-medium">{account.code}</span>
                  <span className="ml-2 text-muted-foreground">{account.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Categoria Budget */}
        <div className="min-w-[200px]">
          <Label htmlFor="filter-category" className="text-xs text-muted-foreground">
            Categoria
          </Label>
          <Select value={budgetCategoryId} onValueChange={onBudgetCategoryIdChange}>
            <SelectTrigger id="filter-category">
              <SelectValue placeholder="Tutte le categorie" />
            </SelectTrigger>
            <SelectContent>
              {budgetCategoryOptions.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  <div className="flex items-center gap-2">
                    {category.color && (
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                    )}
                    <span className="font-medium">{category.code}</span>
                    <span className="text-muted-foreground">{category.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Verificato */}
        <div className="min-w-[150px]">
          <Label htmlFor="filter-verified" className="text-xs text-muted-foreground">
            Verificato
          </Label>
          <Select
            value={verified === undefined ? ALL : verified.toString()}
            onValueChange={(v) =>
              onVerifiedChange?.(v === ALL ? undefined : v === 'true')
            }
          >
            <SelectTrigger id="filter-verified">
              <SelectValue placeholder="Tutti gli stati" />
            </SelectTrigger>
            <SelectContent>
              {verifiedOptions.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
