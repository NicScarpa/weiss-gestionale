'use client'

import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Search, X } from 'lucide-react'

export interface UserFiltersValue {
  search: string
  role: string
  status: string
}

interface UserFiltersProps {
  filters: UserFiltersValue
  onFiltersChange: (filters: UserFiltersValue) => void
  onReset: () => void
}

export function UserFilters({ filters, onFiltersChange, onReset }: UserFiltersProps) {
  const hasActiveFilters = filters.search || filters.role !== 'all' || filters.status !== 'all'

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-1 gap-3 flex-wrap">
        {/* Ricerca */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca per nome, cognome, email..."
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            className="pl-9"
          />
        </div>

        {/* Filtro ruolo */}
        <Select
          value={filters.role}
          onValueChange={(value) => onFiltersChange({ ...filters, role: value })}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Ruolo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i ruoli</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="staff">Staff</SelectItem>
          </SelectContent>
        </Select>

        {/* Filtro stato */}
        <Select
          value={filters.status}
          onValueChange={(value) => onFiltersChange({ ...filters, status: value })}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            <SelectItem value="active">Attivi</SelectItem>
            <SelectItem value="inactive">Inattivi</SelectItem>
          </SelectContent>
        </Select>

        {/* Reset filtri */}
        {hasActiveFilters && (
          <Button variant="ghost" size="icon" onClick={onReset} title="Resetta filtri">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
