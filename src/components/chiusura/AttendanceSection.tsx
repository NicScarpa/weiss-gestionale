'use client'

import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Users, UserPlus, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/constants'

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
  isExtra?: boolean // Flag per distinguere staff fisso da extra
}

// Opzioni turno
const SHIFT_OPTIONS = [
  { value: 'MORNING', label: 'Mattina' },
  { value: 'EVENING', label: 'Sera' },
]

// Opzioni codice presenza per staff fisso
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
  isFixedStaff?: boolean
  hourlyRate?: number | null
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
  // Separa staff fisso da extra
  const fixedStaff = staffMembers.filter((s) => s.isFixedStaff)
  const extraStaff = staffMembers.filter((s) => !s.isFixedStaff)

  // Separa presenze fissi da extra
  const fixedAttendance = attendance.filter((a) => !a.isExtra)
  const extraAttendance = attendance.filter((a) => a.isExtra)

  // Calcola totali
  const fixedTotalHours = fixedAttendance.reduce((sum, a) => sum + (a.hours || 0), 0)
  const extraTotalHours = extraAttendance.reduce((sum, a) => sum + (a.hours || 0), 0)
  const extraTotalPay = extraAttendance.reduce((sum, a) => sum + (a.totalPay || 0), 0)

  // Aggiungi nuova presenza
  const handleAddFixed = () => {
    onChange([
      ...attendance,
      {
        userId: '',
        shift: 'MORNING',
        hours: 8,
        statusCode: 'P',
        isPaid: false,
        isExtra: false,
      },
    ])
  }

  const handleAddExtra = () => {
    onChange([
      ...attendance,
      {
        userId: '',
        shift: 'MORNING',
        hours: 0,
        hourlyRate: 0,
        totalPay: 0,
        isPaid: false,
        isExtra: true,
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

      // Ricalcola totalPay per extra
      if (current.isExtra) {
        const hours: number = field === 'hours' ? numValue : Number(current.hours || 0)
        const rate: number = field === 'hourlyRate' ? numValue : Number(current.hourlyRate || 0)
        updated[index].totalPay = hours * rate
      }
    } else if (field === 'userId') {
      // Trova il nome dello staff e la tariffa
      const staff = staffMembers.find((s) => s.id === value)
      updated[index] = {
        ...current,
        userId: value as string,
        userName: staff ? `${staff.firstName} ${staff.lastName}` : undefined,
        hourlyRate: staff?.hourlyRate || current.hourlyRate,
      }
      // Ricalcola totalPay per extra
      if (current.isExtra && staff?.hourlyRate) {
        updated[index].totalPay = (current.hours || 0) * staff.hourlyRate
      }
    } else {
      updated[index] = {
        ...current,
        [field]: value,
      }
    }

    onChange(updated)
  }

  // Trova l'indice reale nell'array completo
  const getRealIndex = (att: AttendanceData): number => {
    return attendance.findIndex((a) => a === att)
  }

  return (
    <div className={`space-y-4 ${className || ''}`}>
      {/* SEZIONE DIPENDENTI FISSI */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Dipendenti Fissi
            </CardTitle>
            {fixedTotalHours > 0 && (
              <span className="text-sm text-muted-foreground">
                ({fixedTotalHours}h)
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddFixed}
            disabled={disabled}
            className="gap-1"
          >
            <Plus className="h-4 w-4" />
            Aggiungi
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {fixedAttendance.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nessun dipendente fisso registrato.
            </p>
          ) : (
            <>
              {/* Header */}
              <div className="grid grid-cols-[1fr_120px_100px_80px_40px] gap-2 text-xs font-medium text-muted-foreground border-b pb-2">
                <span>Dipendente</span>
                <span>Turno</span>
                <span>Codice</span>
                <span>Ore</span>
                <span></span>
              </div>

              {fixedAttendance.map((att) => {
                const realIndex = getRealIndex(att)
                return (
                  <div
                    key={realIndex}
                    className="grid grid-cols-[1fr_120px_100px_80px_40px] gap-2 items-center"
                  >
                    {/* Dipendente */}
                    <Select
                      value={att.userId}
                      onValueChange={(value) =>
                        handleFieldChange(realIndex, 'userId', value)
                      }
                      disabled={disabled}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona..." />
                      </SelectTrigger>
                      <SelectContent>
                        {fixedStaff.map((staff) => (
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
                        handleFieldChange(realIndex, 'shift', value)
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
                        handleFieldChange(realIndex, 'statusCode', value)
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
                        handleFieldChange(realIndex, 'hours', e.target.value)
                      }
                      disabled={disabled}
                      className="font-mono"
                      placeholder="0"
                    />

                    {/* Rimuovi */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(realIndex)}
                      disabled={disabled}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )
              })}

              {/* Totale Ore */}
              <div className="flex justify-end pt-2 border-t text-sm">
                <span className="text-muted-foreground">
                  Totale ore: <strong>{fixedTotalHours}h</strong>
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* SEZIONE PERSONALE EXTRA */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Personale Extra / Occasionale
            </CardTitle>
            {extraTotalHours > 0 && (
              <span className="text-sm text-muted-foreground">
                ({extraTotalHours}h - {formatCurrency(extraTotalPay)})
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddExtra}
            disabled={disabled}
            className="gap-1"
          >
            <Plus className="h-4 w-4" />
            Aggiungi Extra
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {extraAttendance.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nessun personale extra registrato.
            </p>
          ) : (
            <>
              {/* Header */}
              <div className="grid grid-cols-[1fr_100px_80px_100px_100px_80px_40px] gap-2 text-xs font-medium text-muted-foreground border-b pb-2">
                <span>Nome</span>
                <span>Turno</span>
                <span>Ore</span>
                <span>Tariffa/h</span>
                <span>Totale</span>
                <span>Pagato</span>
                <span></span>
              </div>

              {extraAttendance.map((att) => {
                const realIndex = getRealIndex(att)
                return (
                  <div
                    key={realIndex}
                    className="grid grid-cols-[1fr_100px_80px_100px_100px_80px_40px] gap-2 items-center"
                  >
                    {/* Nome (da lista extra o testo libero) */}
                    {extraStaff.length > 0 ? (
                      <Select
                        value={att.userId}
                        onValueChange={(value) =>
                          handleFieldChange(realIndex, 'userId', value)
                        }
                        disabled={disabled}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona..." />
                        </SelectTrigger>
                        <SelectContent>
                          {extraStaff.map((staff) => (
                            <SelectItem key={staff.id} value={staff.id}>
                              {staff.firstName} {staff.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={att.userName || ''}
                        onChange={(e) =>
                          handleFieldChange(realIndex, 'userName', e.target.value)
                        }
                        disabled={disabled}
                        placeholder="Nome collaboratore"
                      />
                    )}

                    {/* Turno */}
                    <Select
                      value={att.shift}
                      onValueChange={(value) =>
                        handleFieldChange(realIndex, 'shift', value)
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

                    {/* Ore */}
                    <Input
                      type="number"
                      min="0"
                      max="24"
                      step="0.5"
                      value={att.hours ?? ''}
                      onChange={(e) =>
                        handleFieldChange(realIndex, 'hours', e.target.value)
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
                        handleFieldChange(realIndex, 'hourlyRate', e.target.value)
                      }
                      disabled={disabled}
                      className="font-mono"
                      placeholder="0,00"
                    />

                    {/* Totale */}
                    <span className="font-mono text-sm">
                      {formatCurrency(att.totalPay || 0)}
                    </span>

                    {/* Checkbox Pagato */}
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={att.isPaid || false}
                        onChange={(e) =>
                          handleFieldChange(realIndex, 'isPaid', e.target.checked)
                        }
                        disabled={disabled}
                        className="h-4 w-4"
                      />
                    </div>

                    {/* Rimuovi */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(realIndex)}
                      disabled={disabled}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )
              })}

              {/* Totale */}
              <div className="flex justify-between pt-2 border-t text-sm">
                <span className="text-muted-foreground">
                  Totale: <strong>{extraTotalHours}h</strong>
                </span>
                <span>
                  <span className="text-muted-foreground">Compenso: </span>
                  <strong className="font-mono">{formatCurrency(extraTotalPay)}</strong>
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
