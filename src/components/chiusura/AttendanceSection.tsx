'use client'

import { useCallback, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Users, UserPlus, Plus, Trash2, Calendar, RefreshCw, Banknote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { formatCurrency } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

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
  // Nuovi campi per integrazione turni
  scheduledHours?: number
  shiftCode?: string
  shiftName?: string
  shiftColor?: string
}

// Tipo per turno schedulato
interface ScheduledShift {
  id: string
  userId: string
  userName: string
  shiftCode: string
  shiftName: string
  shiftColor: string
  startTime: string
  endTime: string
  scheduledHours: number
  isFixedStaff: boolean
  hourlyRate: number | null
  venueId: string
  venueName: string
  status: string
}

// Tipo per presenze effettive (dalla timbratura)
interface ActualAttendance {
  assignmentId: string
  userId: string
  userName: string
  clockIn: string | null
  clockOut: string | null
  hoursWorked: number
  status: 'SCHEDULED' | 'CLOCKED_IN' | 'ON_BREAK' | 'CLOCKED_OUT' | 'ABSENT'
}

// Opzioni turno
const SHIFT_OPTIONS = [
  { value: 'MORNING', label: 'Mattina' },
  { value: 'EVENING', label: 'Sera' },
]

// Opzioni codice presenza per staff fisso (solo codice)
const STATUS_CODE_OPTIONS = [
  { value: 'P', label: 'P' },
  { value: 'R', label: 'R' },
  { value: 'Z', label: 'Z' },
  { value: 'FE', label: 'FE' },
  { value: 'C', label: 'C' },
]

// Legenda codici
const STATUS_CODE_LEGEND = 'P = Presente | R = Riposo | Z = Permesso | FE = Ferie | C = Altra sede'

interface StaffMember {
  id: string
  firstName: string
  lastName: string
  isFixedStaff?: boolean
  hourlyRate?: number | null
  defaultShift?: 'MORNING' | 'EVENING' | null
}

interface AttendanceSectionProps {
  attendance: AttendanceData[]
  onChange: (attendance: AttendanceData[]) => void
  staffMembers?: StaffMember[]
  disabled?: boolean
  className?: string
  closureDate?: string // Data della chiusura per caricare turni schedulati
  venueId?: string
}

// Fetch turni schedulati per data
async function fetchScheduledShifts(date: string, venueId?: string): Promise<ScheduledShift[]> {
  const url = venueId
    ? `/api/schedules/daily?date=${date}&venueId=${venueId}`
    : `/api/schedules/daily?date=${date}`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json()
  return data.data || []
}

// Fetch presenze effettive per data
async function fetchActualAttendance(date: string, venueId?: string): Promise<ActualAttendance[]> {
  const params = new URLSearchParams({ date })
  if (venueId) params.append('venueId', venueId)

  const res = await fetch(`/api/attendance/daily-summary?${params}`)
  if (!res.ok) return []
  const data = await res.json()

  // Trasforma il formato API nel nostro tipo
  return (data.data || []).map((item: {
    assignment: { id: string; user: { id: string; firstName: string; lastName: string } }
    attendance: { clockIn: string | null; clockOut: string | null; hoursWorked: number; status: string }
  }) => ({
    assignmentId: item.assignment.id,
    userId: item.assignment.user.id,
    userName: `${item.assignment.user.firstName} ${item.assignment.user.lastName}`,
    clockIn: item.attendance.clockIn,
    clockOut: item.attendance.clockOut,
    hoursWorked: item.attendance.hoursWorked,
    status: item.attendance.status as ActualAttendance['status'],
  }))
}

export function AttendanceSection({
  attendance,
  onChange,
  staffMembers = [],
  disabled = false,
  className,
  closureDate,
  venueId,
}: AttendanceSectionProps) {
  const [hasLoadedFromSchedule, setHasLoadedFromSchedule] = useState(false)

  // Query per turni schedulati
  const { data: scheduledShifts } = useQuery({
    queryKey: ['scheduled-shifts', closureDate, venueId],
    queryFn: () => fetchScheduledShifts(closureDate!, venueId),
    enabled: !!closureDate && !hasLoadedFromSchedule,
  })

  // Query per presenze effettive (timbrature)
  const { data: actualAttendance } = useQuery({
    queryKey: ['actual-attendance', closureDate, venueId],
    queryFn: () => fetchActualAttendance(closureDate!, venueId),
    enabled: !!closureDate && !hasLoadedFromSchedule,
  })

  // Carica presenze da turni schedulati e timbrature effettive
  const loadFromSchedule = useCallback(() => {
    if (!scheduledShifts || scheduledShifts.length === 0) return

    const newAttendance: AttendanceData[] = scheduledShifts.map((shift) => {
      // Determina turno MORNING/EVENING basato sull'orario
      const startHour = new Date(shift.startTime).getHours()
      const shiftType: 'MORNING' | 'EVENING' = startHour < 14 ? 'MORNING' : 'EVENING'

      // Cerca dati timbratura effettiva per questo utente
      const actual = actualAttendance?.find((a) => a.userId === shift.userId)

      // Determina ore effettive: usa timbrature se disponibili, altrimenti schedulate
      let effectiveHours = shift.scheduledHours
      let statusCode = 'P'

      if (actual) {
        if (actual.status === 'CLOCKED_OUT' && actual.hoursWorked > 0) {
          // Ha timbrato uscita: usa ore effettive
          effectiveHours = actual.hoursWorked
        } else if (actual.status === 'ABSENT') {
          // Assente
          statusCode = 'R' // Riposo come default per assenza
          effectiveHours = 0
        }
      }

      return {
        userId: shift.userId,
        userName: shift.userName,
        shift: shiftType,
        hours: effectiveHours,
        statusCode,
        hourlyRate: shift.hourlyRate || undefined,
        isExtra: !shift.isFixedStaff,
        scheduledHours: shift.scheduledHours,
        shiftCode: shift.shiftCode,
        shiftName: shift.shiftName,
        shiftColor: shift.shiftColor,
      }
    })

    onChange(newAttendance)
    setHasLoadedFromSchedule(true)
  }, [scheduledShifts, actualAttendance, onChange])

  // Pre-popola da turni schedulati se non ci sono presenze e ci sono turni
  useEffect(() => {
    if (
      scheduledShifts &&
      scheduledShifts.length > 0 &&
      attendance.length === 0 &&
      !hasLoadedFromSchedule
    ) {
      queueMicrotask(() => loadFromSchedule())
    }
  }, [scheduledShifts, attendance.length, hasLoadedFromSchedule, loadFromSchedule])

  // Auto-caricamento dipendenti fissi per nuove chiusure (fallback se non ci sono turni schedulati)
  useEffect(() => {
    if (attendance.length > 0 || disabled || !staffMembers?.length) return
    if (hasLoadedFromSchedule) return
    // Aspetta che la query turni sia completata prima di fare il fallback
    if (scheduledShifts === undefined) return
    if (scheduledShifts && scheduledShifts.length > 0) return

    const fixedStaffMembers = staffMembers.filter(s => s.isFixedStaff)
    if (fixedStaffMembers.length === 0) return

    const autoAttendance: AttendanceData[] = fixedStaffMembers.map(staff => ({
      userId: staff.id,
      userName: `${staff.firstName} ${staff.lastName}`,
      shift: staff.defaultShift || 'EVENING',
      hours: undefined,
      statusCode: 'P',
      hourlyRate: staff.hourlyRate || undefined,
      isExtra: false,
    }))

    onChange(autoAttendance)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduledShifts, staffMembers])

  // Separa staff fisso da extra
  const fixedStaff = staffMembers.filter((s) => s.isFixedStaff)
  const extraStaff = staffMembers.filter((s) => !s.isFixedStaff)

  // Separa presenze fissi da extra
  const fixedAttendance = attendance.filter((a) => !a.isExtra)
  const extraAttendance = attendance.filter((a) => a.isExtra)

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
      const numValue = typeof value === 'string'
        ? (value === '' ? undefined : (parseFloat(value) || 0))
        : (Number(value) || 0)
      updated[index] = {
        ...current,
        [field]: numValue,
      }

      // Ricalcola totalPay per extra O per staff fisso pagato
      if (current.isExtra || current.isPaid) {
        const hours: number = field === 'hours' ? (numValue ?? 0) : Number(current.hours || 0)
        const rate: number = field === 'hourlyRate' ? (numValue ?? 0) : Number(current.hourlyRate || 0)
        updated[index].totalPay = hours * rate
      }
    } else if (field === 'userId') {
      // Trova il nome dello staff, la tariffa e il turno default
      const staff = staffMembers.find((s) => s.id === value)
      updated[index] = {
        ...current,
        userId: value as string,
        userName: staff ? `${staff.firstName} ${staff.lastName}` : undefined,
        hourlyRate: staff?.hourlyRate || current.hourlyRate,
        // Auto-fill turno default se disponibile
        shift: staff?.defaultShift || current.shift,
      }
      // Ricalcola totalPay per extra
      if (current.isExtra && staff?.hourlyRate) {
        updated[index].totalPay = (current.hours || 0) * staff.hourlyRate
      }
    } else if (field === 'isPaid') {
      // Toggle pagato a fine servizio (staff fisso ed extra)
      const isPaidNow = value === true
      if (isPaidNow) {
        // Attiva: pre-compila hourlyRate dal profilo se disponibile
        const staff = staffMembers.find((s) => s.id === current.userId)
        const rate = current.hourlyRate || staff?.hourlyRate || 0
        const hours = Number(current.hours || 0)
        updated[index] = {
          ...current,
          isPaid: true,
          hourlyRate: rate,
          totalPay: hours * rate,
        }
      } else {
        // Disattiva: azzera i campi pagamento
        updated[index] = {
          ...current,
          isPaid: false,
          hourlyRate: undefined,
          totalPay: undefined,
        }
      }
    } else if (field === 'statusCode') {
      updated[index] = {
        ...current,
        statusCode: value as string,
      }
      // Se il codice non è P, disattiva il pagamento
      if (value !== 'P' && current.isPaid) {
        updated[index].isPaid = false
        updated[index].hourlyRate = undefined
        updated[index].totalPay = undefined
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
    <TooltipProvider>
    <div className={`space-y-4 ${className || ''}`}>
      {/* Banner turni schedulati */}
      {closureDate && scheduledShifts && scheduledShifts.length > 0 && !hasLoadedFromSchedule && (
        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <Calendar className="h-5 w-5 text-blue-600" />
          <div className="flex-1">
            <p className="text-sm text-blue-800">
              Trovati <strong>{scheduledShifts.length}</strong> turni schedulati per questa data.
              {actualAttendance && actualAttendance.filter(a => a.status === 'CLOCKED_OUT').length > 0 && (
                <span className="ml-1">
                  (<strong>{actualAttendance.filter(a => a.status === 'CLOCKED_OUT').length}</strong> con ore effettive da timbratura)
                </span>
              )}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={loadFromSchedule}
            disabled={disabled}
            className="gap-1 border-blue-300 text-blue-700 hover:bg-blue-100"
          >
            <RefreshCw className="h-4 w-4" />
            Carica da turni
          </Button>
        </div>
      )}

      {/* SEZIONE DIPENDENTI */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Dipendenti
            {hasLoadedFromSchedule && (
              <Badge variant="secondary" className="text-xs gap-1">
                <Calendar className="h-3 w-3" />
                Da turni
              </Badge>
            )}
          </CardTitle>
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
              <div className="grid grid-cols-[1fr_100px_70px_60px_50px_40px] gap-2 text-xs font-medium text-muted-foreground border-b pb-2">
                <span>Dipendente</span>
                <span>Turno</span>
                <span className="text-center">Codice</span>
                <span className="text-center">Ore Eff.</span>
                <span className="text-center">Pagato</span>
                <span></span>
              </div>

              {fixedAttendance.map((att) => {
                const realIndex = getRealIndex(att)
                return (
                  <div key={realIndex} className="space-y-1">
                    <div
                      className="grid grid-cols-[1fr_100px_70px_60px_50px_40px] gap-2 items-center"
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

                      {/* Ore Effettive */}
                      <Input
                        type="number"
                        min="0"
                        max="24"
                        step="0.5"
                        value={att.statusCode === 'P' ? (att.hours ?? '') : ''}
                        onChange={(e) =>
                          handleFieldChange(realIndex, 'hours', e.target.value)
                        }
                        disabled={disabled || att.statusCode !== 'P'}
                        className="font-mono text-center"
                        placeholder={att.statusCode === 'P' ? '0' : '-'}
                      />

                      {/* Toggle Pagato */}
                      <div className="flex justify-center">
                        {att.statusCode === 'P' ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <Switch
                                  checked={att.isPaid || false}
                                  onCheckedChange={(checked) =>
                                    handleFieldChange(realIndex, 'isPaid', checked)
                                  }
                                  disabled={disabled}
                                  className="data-[state=checked]:bg-green-600"
                                />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              Pagato a fine servizio
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
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

                    {/* Riga espandibile: Tariffa e Totale (solo se pagato) */}
                    {att.isPaid && att.statusCode === 'P' && (
                      <div className="ml-4 flex items-center gap-3 py-1 px-3 bg-green-50 border border-green-200 rounded text-sm">
                        <Banknote className="h-4 w-4 text-green-600 shrink-0" />
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-muted-foreground whitespace-nowrap">Tariffa:</label>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">€</span>
                            <Input
                              type="number"
                              min="0"
                              step="0.50"
                              value={att.hourlyRate ?? ''}
                              onChange={(e) =>
                                handleFieldChange(realIndex, 'hourlyRate', e.target.value)
                              }
                              disabled={disabled}
                              className="w-20 h-7 font-mono text-sm"
                              placeholder="0"
                            />
                            <span className="text-xs text-muted-foreground">/h</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-auto">
                          <span className="text-xs text-muted-foreground">Totale:</span>
                          <span className="font-mono font-medium text-green-700">
                            {formatCurrency(att.totalPay || 0)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Legenda codici */}
              <p className="text-xs text-muted-foreground pt-2 border-t">
                {STATUS_CODE_LEGEND}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* SEZIONE EXTRA */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Extra
          </CardTitle>
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
              <div className="grid grid-cols-[1fr_100px_60px_50px_40px] gap-3 text-xs font-medium text-muted-foreground border-b pb-2">
                <span>Nome</span>
                <span>Turno</span>
                <span className="text-center">Ore</span>
                <span className="text-center">Pagato</span>
                <span></span>
              </div>

              {extraAttendance.map((att) => {
                const realIndex = getRealIndex(att)
                return (
                  <div key={realIndex} className="space-y-1">
                    <div
                      className="grid grid-cols-[1fr_100px_60px_50px_40px] gap-3 items-center"
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

                      {/* Toggle Pagato */}
                      <div className="flex justify-center">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div>
                              <Switch
                                checked={att.isPaid || false}
                                onCheckedChange={(checked) =>
                                  handleFieldChange(realIndex, 'isPaid', checked)
                                }
                                disabled={disabled}
                                className="data-[state=checked]:bg-green-600"
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            Pagato a fine servizio
                          </TooltipContent>
                        </Tooltip>
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

                    {/* Riga espandibile: Tariffa e Totale (solo se pagato) */}
                    {att.isPaid && (
                      <div className="ml-4 flex items-center gap-3 py-1 px-3 bg-green-50 border border-green-200 rounded text-sm">
                        <Banknote className="h-4 w-4 text-green-600 shrink-0" />
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-muted-foreground whitespace-nowrap">Tariffa:</label>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">€</span>
                            <Input
                              type="number"
                              min="0"
                              step="0.50"
                              value={att.hourlyRate ?? ''}
                              onChange={(e) =>
                                handleFieldChange(realIndex, 'hourlyRate', e.target.value)
                              }
                              disabled={disabled}
                              className="w-20 h-7 font-mono text-sm"
                              placeholder="0"
                            />
                            <span className="text-xs text-muted-foreground">/h</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-auto">
                          <span className="text-xs text-muted-foreground">Totale:</span>
                          <span className="font-mono font-medium text-green-700">
                            {formatCurrency(att.totalPay || 0)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </CardContent>
      </Card>

    </div>
    </TooltipProvider>
  )
}
