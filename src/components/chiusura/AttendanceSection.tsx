'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Users, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatCurrency, ATTENDANCE_CODES } from '@/lib/constants'

// Tipo per presenza
export interface AttendanceData {
  id?: string
  userId: string
  userName?: string
  shift: 'MORNING' | 'EVENING'
  hours?: number
  statusCode?: string
  hourlyRate?: number
  totalPay?: number
  isPaid?: boolean
  notes?: string
}

// Opzioni turno
const SHIFT_OPTIONS = [
  { value: 'MORNING', label: 'Mattina' },
  { value: 'EVENING', label: 'Sera' },
]

// Opzioni codice presenza
const STATUS_CODE_OPTIONS = [
  { value: 'P', label: 'P - Presente' },
  { value: 'FE', label: 'FE - Ferie' },
  { value: 'R', label: 'R - Riposo' },
  { value: 'Z', label: 'Z - Permesso' },
  { value: 'C', label: 'C - Altra Sede' },
]

interface StaffMember {
  id: string
  firstName: string
  lastName: string
}

interface AttendanceSectionProps {
  attendance: AttendanceData[]
  onChange: (attendance: AttendanceData[]) => void
  staffMembers?: StaffMember[]
  disabled?: boolean
  className?: string
}

export function AttendanceSection({
  attendance,
  onChange,
  staffMembers = [],
  disabled = false,
  className,
}: AttendanceSectionProps) {
  // Calcola totale ore e compensi
  const totalHours = attendance.reduce((sum, a) => sum + (a.hours || 0), 0)
  const totalPay = attendance.reduce((sum, a) => sum + (a.totalPay || 0), 0)

  // Aggiungi nuova presenza
  const handleAdd = () => {
    onChange([
      ...attendance,
      {
        userId: '',
        shift: 'MORNING',
        hours: 8,
        statusCode: 'P',
        isPaid: false,
      },
    ])
  }

  // Rimuovi presenza
  const handleRemove = (index: number) => {
    onChange(attendance.filter((_, i) => i !== index))
  }

  // Aggiorna campo presenza
  const handleFieldChange = (
    index: number,
    field: keyof AttendanceData,
    value: string | number | boolean
  ) => {
    const updated = [...attendance]
    const current = updated[index]

    if (field === 'hours' || field === 'hourlyRate') {
      const numValue = typeof value === 'string' ? parseFloat(value) || 0 : Number(value) || 0
      updated[index] = {
        ...current,
        [field]: numValue,
      }

      // Ricalcola totalPay
      const hours: number = field === 'hours' ? numValue : Number(current.hours || 0)
      const rate: number = field === 'hourlyRate' ? numValue : Number(current.hourlyRate || 0)
      updated[index].totalPay = hours * rate
    } else if (field === 'userId') {
      // Trova il nome dello staff
      const staff = staffMembers.find((s) => s.id === value)
      updated[index] = {
        ...current,
        userId: value as string,
        userName: staff ? `${staff.firstName} ${staff.lastName}` : undefined,
      }
    } else {
      updated[index] = {
        ...current,
        [field]: value,
      }
    }

    onChange(updated)
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Presenze Staff
          </CardTitle>
          {totalHours > 0 && (
            <span className="text-sm text-muted-foreground">
              ({totalHours}h)
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={disabled}
          className="gap-1"
        >
          <Plus className="h-4 w-4" />
          Aggiungi
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {attendance.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nessuna presenza registrata. Clicca &quot;Aggiungi&quot; per inserire lo staff.
          </p>
        ) : (
          <>
            {/* Header */}
            <div className="grid grid-cols-[1fr_120px_100px_80px_100px_100px_40px] gap-2 text-xs font-medium text-muted-foreground border-b pb-2">
              <span>Dipendente</span>
              <span>Turno</span>
              <span>Codice</span>
              <span>Ore</span>
              <span>Tariffa/h</span>
              <span>Totale</span>
              <span></span>
            </div>

            {attendance.map((att, index) => (
              <div
                key={index}
                className="grid grid-cols-[1fr_120px_100px_80px_100px_100px_40px] gap-2 items-center"
              >
                {/* Dipendente */}
                <Select
                  value={att.userId}
                  onValueChange={(value) =>
                    handleFieldChange(index, 'userId', value)
                  }
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona..." />
                  </SelectTrigger>
                  <SelectContent>
                    {staffMembers.map((staff) => (
                      <SelectItem key={staff.id} value={staff.id}>
                        {staff.firstName} {staff.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Turno */}
                <Select
                  value={att.shift}
                  onValueChange={(value) =>
                    handleFieldChange(index, 'shift', value)
                  }
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHIFT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Codice Presenza */}
                <Select
                  value={att.statusCode || 'P'}
                  onValueChange={(value) =>
                    handleFieldChange(index, 'statusCode', value)
                  }
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_CODE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Ore */}
                <Input
                  type="number"
                  min="0"
                  max="24"
                  step="0.5"
                  value={att.hours ?? ''}
                  onChange={(e) =>
                    handleFieldChange(index, 'hours', e.target.value)
                  }
                  disabled={disabled}
                  className="font-mono"
                  placeholder="0"
                />

                {/* Tariffa oraria */}
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={att.hourlyRate ?? ''}
                  onChange={(e) =>
                    handleFieldChange(index, 'hourlyRate', e.target.value)
                  }
                  disabled={disabled}
                  className="font-mono"
                  placeholder="0,00"
                />

                {/* Totale */}
                <span className="font-mono text-sm">
                  {formatCurrency(att.totalPay || 0)}
                </span>

                {/* Rimuovi */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(index)}
                  disabled={disabled}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {/* Totale */}
            <div className="flex justify-between pt-2 border-t text-sm">
              <span className="text-muted-foreground">
                Totale: <strong>{totalHours}h</strong>
              </span>
              <span>
                <span className="text-muted-foreground">Compenso: </span>
                <strong className="font-mono">{formatCurrency(totalPay)}</strong>
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
