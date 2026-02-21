'use client'

import { Label } from '@/components/ui/label'
import { SearchInput } from '../shared/FiltersToolbar'
import { DateRangePicker } from '../shared/FiltersToolbar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PAYMENT_STATUS_LABELS, PaymentType, PAYMENT_TYPE_LABELS } from '@/types/prima-nota'

interface PagamentiFiltersProps {
  dateFrom?: Date
  dateTo?: Date
  onDateRangeChange?: (range: { from?: Date; to?: Date }) => void
  tipo?: PaymentType
  onTipoChange?: (value: PaymentType | undefined) => void
  beneficiarioNome?: string
  onBeneficiarioNomeChange?: (value: string | undefined) => void
  stato?: string
  onStatoChange?: (value: string | undefined) => void
  search?: string
  onSearchChange?: (value: string) => void
  filterCount?: number
  onClearFilters?: () => void
}

export function PagamentiFilters({
  dateFrom,
  dateTo,
  onDateRangeChange,
  tipo,
  onTipoChange,
  beneficiarioNome,
  onBeneficiarioNomeChange,
  stato,
  onStatoChange,
  search,
  onSearchChange,
  filterCount = 0,
  onClearFilters,
}: PagamentiFiltersProps) {
  const ALL = '__all__'

  const tipoOptions = [
    { value: ALL, label: 'Tutti i tipi' },
    ...Object.entries(PAYMENT_TYPE_LABELS).map(([key, label]) => ({ value: key, label })),
  ]

  const statoOptions = [
    { value: ALL, label: 'Tutti gli stati' },
    ...Object.entries(PAYMENT_STATUS_LABELS).map(([key, label]) => ({ value: key, label })),
  ]

  return (
    <div className="space-y-3">
      {/* Prima riga: Ricerca e Date Range */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px]">
          <SearchInput
            value={search}
            onChange={onSearchChange}
            placeholder="Cerca pagamenti..."
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
        {/* Tipo */}
        <div className="min-w-[150px]">
          <Label htmlFor="filter-tipo" className="text-xs text-muted-foreground">
            Tipo
          </Label>
          <Select
            value={tipo ?? ALL}
            onValueChange={(v) => onTipoChange?.(v === ALL ? undefined : v as PaymentType)}
          >
            <SelectTrigger id="filter-tipo">
              <SelectValue placeholder="Tutti i tipi" />
            </SelectTrigger>
            <SelectContent>
              {tipoOptions.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Stato */}
        <div className="min-w-[180px]">
          <Label htmlFor="filter-stato" className="text-xs text-muted-foreground">
            Stato
          </Label>
          <Select
            value={stato ?? ALL}
            onValueChange={(v) => onStatoChange?.(v === ALL ? undefined : v)}
          >
            <SelectTrigger id="filter-stato">
              <SelectValue placeholder="Tutti gli stati" />
            </SelectTrigger>
            <SelectContent>
              {statoOptions.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Beneficiario */}
        <div className="min-w-[200px]">
          <Label htmlFor="filter-beneficiario" className="text-xs text-muted-foreground">
            Beneficiario
          </Label>
          <Select value={beneficiarioNome} onValueChange={onBeneficiarioNomeChange}>
            <SelectTrigger id="filter-beneficiario">
              <SelectValue placeholder="Tutti i beneficiari" />
            </SelectTrigger>
            <SelectContent>
              {/* Qui andrebbero i beneficiari unici già esistenti */}
              <SelectItem value="__search__">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">🔍</span>
                  <span>Cerca beneficiario...</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
