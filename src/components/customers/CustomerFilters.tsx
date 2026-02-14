'use client'

import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

export interface CustomerFiltersValue {
  search: string
  showInactive: boolean
}

interface CustomerFiltersProps {
  filters: CustomerFiltersValue
  onFiltersChange: (filters: CustomerFiltersValue) => void
  onReset: () => void
}

export function CustomerFilters({ filters, onFiltersChange, onReset }: CustomerFiltersProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cerca cliente..."
          value={filters.search}
          onChange={e => onFiltersChange({ ...filters, search: e.target.value })}
          className="pl-9"
        />
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="show-inactive-customers"
          checked={filters.showInactive}
          onCheckedChange={checked => onFiltersChange({ ...filters, showInactive: checked })}
        />
        <Label htmlFor="show-inactive-customers" className="text-sm cursor-pointer">
          Mostra inattivi
        </Label>
      </div>

      {(filters.search || filters.showInactive) && (
        <Button variant="ghost" size="sm" onClick={onReset}>
          <X className="h-4 w-4 mr-1" />
          Reset
        </Button>
      )}
    </div>
  )
}
