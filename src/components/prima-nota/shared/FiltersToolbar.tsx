'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { CalendarIcon, FilterIcon, X } from 'lucide-react'
import { useState } from 'react'

interface FiltersToolbarProps {
  children?: React.ReactNode
  onClearFilters?: () => void
  filterCount?: number
}

export function FiltersToolbar({ children, onClearFilters, filterCount = 0 }: FiltersToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {children}
      </div>
      {filterCount > 0 && onClearFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="h-8 px-2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4 mr-1" />
          Cancella filtri ({filterCount})
        </Button>
      )}
    </div>
  )
}

interface DateRangePickerProps {
  value?: { from?: Date; to?: Date }
  onChange?: (range: { from?: Date; to?: Date } | undefined) => void
  placeholder?: string
}

export function DateRangePicker({ value, onChange, placeholder = 'Seleziona periodo' }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)

  const handleSelect = (range: { from?: Date; to?: Date } | undefined) => {
    onChange?.(range)
    if (range?.from && range?.to) {
      setOpen(false)
    }
  }

  const formatRange = () => {
    if (!value?.from && !value?.to) return placeholder
    const from = value.from?.toLocaleDateString('it-IT')
    const to = value.to?.toLocaleDateString('it-IT')
    if (from && to) return `${from} - ${to}`
    return from || to || placeholder
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'w-[200px] justify-start text-normal font-normal',
            !value?.from && !value?.to && 'text-muted-foreground'
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {formatRange()}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={{
            from: value?.from,
            to: value?.to,
          }}
          onSelect={handleSelect}
          className="rounded-md border"
        />
      </PopoverContent>
    </Popover>
  )
}

interface SearchInputProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
}

export function SearchInput({ value, onChange, placeholder = 'Cerca...' }: SearchInputProps) {
  return (
    <div className="relative">
      <FilterIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="pl-9 h-9 w-[200px]"
      />
    </div>
  )
}
