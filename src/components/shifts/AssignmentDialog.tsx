'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface ShiftDefinition {
  id: string
  name: string
  code: string
  color: string | null
  startTime: string
  endTime: string
  breakMinutes?: number
}

interface StaffMember {
  id: string
  firstName: string
  lastName: string
  contractType: string | null
  skills: string[]
}

interface Assignment {
  id: string
  userId: string
  shiftDefinitionId: string | null
  date: string
  startTime: string
  endTime: string
  breakMinutes: number
  notes: string | null
  user: {
    id: string
    firstName: string
    lastName: string
  }
  shiftDefinition?: ShiftDefinition | null
}

interface AssignmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scheduleId: string
  venueId: string
  shiftDefinitions: ShiftDefinition[]
  // Per nuova assegnazione
  date?: Date
  shiftDefId?: string
  // Per modifica assegnazione
  assignment?: Assignment
  isReadOnly?: boolean
}

export function AssignmentDialog({
  open,
  onOpenChange,
  scheduleId,
  venueId,
  shiftDefinitions,
  date,
  shiftDefId,
  assignment,
  isReadOnly = false,
}: AssignmentDialogProps) {
  const queryClient = useQueryClient()
  const isEditMode = !!assignment
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    userId: '',
    shiftDefinitionId: '',
    startTime: '',
    endTime: '',
    breakMinutes: 0,
    notes: '',
  })

  // Carica staff
  const { data: staffData } = useQuery({
    queryKey: ['staff', venueId],
    queryFn: async () => {
      const res = await fetch(`/api/staff?venueId=${venueId}&activeOnly=true`)
      if (!res.ok) throw new Error('Errore nel caricamento staff')
      return res.json()
    },
    enabled: open,
  })

  const staffList: StaffMember[] = staffData?.data || []

  // Inizializza form quando si apre
  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        if (assignment) {
          // Modifica
          setFormData({
            userId: assignment.userId,
            shiftDefinitionId: assignment.shiftDefinitionId || '',
            startTime: assignment.startTime,
            endTime: assignment.endTime,
            breakMinutes: assignment.breakMinutes,
            notes: assignment.notes || '',
          })
        } else {
          // Nuova assegnazione
          const selectedShift = shiftDefinitions.find(s => s.id === shiftDefId)
          setFormData({
            userId: '',
            shiftDefinitionId: shiftDefId || '',
            startTime: selectedShift?.startTime || '09:00',
            endTime: selectedShift?.endTime || '17:00',
            breakMinutes: selectedShift?.breakMinutes || 0,
            notes: '',
          })
        }
      })
    }
  }, [open, assignment, shiftDefId, shiftDefinitions])

  // Quando cambia turno, aggiorna orari
  const handleShiftChange = (shiftId: string) => {
    // "custom" è un valore speciale che significa nessun turno tipo
    const actualId = shiftId === 'custom' ? '' : shiftId
    const shift = shiftDefinitions.find(s => s.id === actualId)
    if (shift) {
      setFormData(prev => ({
        ...prev,
        shiftDefinitionId: actualId,
        startTime: shift.startTime,
        endTime: shift.endTime,
        breakMinutes: shift.breakMinutes || 0,
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        shiftDefinitionId: actualId,
      }))
    }
  }

  // Mutation per creare assegnazione
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch(`/api/schedules/${scheduleId}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          date: date?.toISOString(),
          shiftDefinitionId: data.shiftDefinitionId || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nella creazione')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', scheduleId] })
      toast.success('Turno assegnato')
      onOpenChange(false)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Mutation per aggiornare assegnazione
  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch(`/api/assignments/${assignment?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          shiftDefinitionId: data.shiftDefinitionId || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nell\'aggiornamento')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', scheduleId] })
      toast.success('Turno aggiornato')
      onOpenChange(false)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Mutation per eliminare assegnazione
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/assignments/${assignment?.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nell\'eliminazione')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', scheduleId] })
      toast.success('Turno eliminato')
      onOpenChange(false)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleSubmit = () => {
    if (!formData.userId) {
      toast.error('Seleziona un dipendente')
      return
    }

    if (isEditMode) {
      updateMutation.mutate(formData)
    } else {
      createMutation.mutate(formData)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
  }

  const selectedStaff = staffList.find(s => s.id === formData.userId)
  const displayDate = date || (assignment ? new Date(assignment.date) : new Date())

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {isEditMode ? 'Modifica Turno' : 'Assegna Turno'}
            </DialogTitle>
            <DialogDescription>
              {format(displayDate, 'EEEE d MMMM yyyy', { locale: it })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Selezione dipendente */}
            <div className="space-y-2">
              <Label>Dipendente *</Label>
              <Select
                value={formData.userId}
                onValueChange={v => setFormData(prev => ({ ...prev, userId: v }))}
                disabled={isReadOnly}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona dipendente" />
                </SelectTrigger>
                <SelectContent>
                  {staffList.map(staff => (
                    <SelectItem key={staff.id} value={staff.id}>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">
                            {getInitials(staff.firstName, staff.lastName)}
                          </AvatarFallback>
                        </Avatar>
                        <span>{staff.firstName} {staff.lastName}</span>
                        {staff.contractType && (
                          <Badge variant="outline" className="text-xs">
                            {staff.contractType}
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Info dipendente selezionato */}
            {selectedStaff?.skills && selectedStaff.skills.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedStaff.skills.map(skill => (
                  <Badge key={skill} variant="secondary" className="text-xs">
                    {skill}
                  </Badge>
                ))}
              </div>
            )}

            {/* Selezione turno tipo */}
            <div className="space-y-2">
              <Label>Tipo Turno</Label>
              <Select
                value={formData.shiftDefinitionId || 'custom'}
                onValueChange={handleShiftChange}
                disabled={isReadOnly}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona turno (opzionale)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Personalizzato</SelectItem>
                  {shiftDefinitions.map(shift => (
                    <SelectItem key={shift.id} value={shift.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: shift.color || '#6B7280' }}
                        />
                        <span>{shift.name}</span>
                        <span className="text-muted-foreground text-xs">
                          {shift.startTime} - {shift.endTime}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Orari */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ora Inizio</Label>
                <Input
                  type="time"
                  value={formData.startTime}
                  onChange={e => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label>Ora Fine</Label>
                <Input
                  type="time"
                  value={formData.endTime}
                  onChange={e => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                  disabled={isReadOnly}
                />
              </div>
            </div>

            {/* Pausa */}
            <div className="space-y-2">
              <Label>Pausa (minuti)</Label>
              <Input
                type="number"
                min="0"
                max="120"
                value={formData.breakMinutes}
                onChange={e => setFormData(prev => ({ ...prev, breakMinutes: parseInt(e.target.value) || 0 }))}
                disabled={isReadOnly}
              />
            </div>

            {/* Note */}
            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea
                placeholder="Note opzionali..."
                value={formData.notes}
                onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                rows={2}
                disabled={isReadOnly}
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {isEditMode && !isReadOnly && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isPending}
                className="sm:mr-auto"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Elimina
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {isReadOnly ? 'Chiudi' : 'Annulla'}
            </Button>
            {!isReadOnly && (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isPending || !formData.userId}
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvataggio...
                  </>
                ) : isEditMode ? (
                  'Salva Modifiche'
                ) : (
                  'Assegna Turno'
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conferma eliminazione */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare questo turno? L&apos;operazione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Eliminazione...
                </>
              ) : (
                'Elimina'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
