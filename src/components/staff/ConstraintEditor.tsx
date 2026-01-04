'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Slider } from '@/components/ui/slider'
import { Plus, Pencil, Trash2, Clock, Calendar, AlertTriangle, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

// Tipi di vincolo con configurazione
const CONSTRAINT_TYPES = {
  AVAILABILITY: {
    label: 'Disponibilità',
    description: 'Orari o giorni di disponibilità',
    icon: Clock,
    configFields: ['dayOfWeek', 'startTime', 'endTime', 'available'],
  },
  MAX_HOURS: {
    label: 'Max Ore Settimanali',
    description: 'Limite massimo ore lavorative',
    icon: Clock,
    configFields: ['maxHours'],
  },
  MIN_REST: {
    label: 'Riposo Minimo',
    description: 'Ore di riposo minimo tra turni',
    icon: Clock,
    configFields: ['minRestHours'],
  },
  PREFERRED_SHIFT: {
    label: 'Turno Preferito',
    description: 'Preferenza per un tipo di turno',
    icon: Calendar,
    configFields: ['shiftType', 'preference'],
  },
  BLOCKED_DAY: {
    label: 'Giorno Bloccato',
    description: 'Giorno non disponibile (fisso)',
    icon: Calendar,
    configFields: ['dayOfWeek', 'reason'],
  },
  SKILL_REQUIRED: {
    label: 'Skill Richiesta',
    description: 'Competenza necessaria per turno',
    icon: CheckCircle,
    configFields: ['skill'],
  },
  CONSECUTIVE_DAYS: {
    label: 'Giorni Consecutivi',
    description: 'Max giorni di lavoro consecutivi',
    icon: Calendar,
    configFields: ['maxDays'],
  },
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Domenica' },
  { value: 1, label: 'Lunedì' },
  { value: 2, label: 'Martedì' },
  { value: 3, label: 'Mercoledì' },
  { value: 4, label: 'Giovedì' },
  { value: 5, label: 'Venerdì' },
  { value: 6, label: 'Sabato' },
]

interface Constraint {
  id: string
  constraintType: keyof typeof CONSTRAINT_TYPES
  config: Record<string, unknown>
  validFrom: string | null
  validTo: string | null
  priority: number
  isHardConstraint: boolean
  notes: string | null
  venue?: {
    id: string
    name: string
    code: string
  }
}

interface ConstraintEditorProps {
  userId: string
  userName: string
}

export function ConstraintEditor({ userId, userName }: ConstraintEditorProps) {
  const queryClient = useQueryClient()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingConstraint, setEditingConstraint] = useState<Constraint | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    constraintType: '' as keyof typeof CONSTRAINT_TYPES | '',
    config: {} as Record<string, unknown>,
    validFrom: '',
    validTo: '',
    priority: 5,
    isHardConstraint: true,
    notes: '',
  })

  // Fetch constraints
  const { data: constraintsData, isLoading } = useQuery({
    queryKey: ['staff-constraints', userId],
    queryFn: async () => {
      const res = await fetch(`/api/staff/${userId}/constraints`)
      if (!res.ok) throw new Error('Errore nel caricamento vincoli')
      return res.json()
    },
  })

  const constraints: Constraint[] = constraintsData?.data || []

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch(`/api/staff/${userId}/constraints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          validFrom: data.validFrom || null,
          validTo: data.validTo || null,
          notes: data.notes || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nella creazione')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-constraints', userId] })
      toast.success('Vincolo creato con successo')
      handleCloseDialog()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const res = await fetch(`/api/constraints/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          validFrom: data.validFrom || null,
          validTo: data.validTo || null,
          notes: data.notes || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nell\'aggiornamento')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-constraints', userId] })
      toast.success('Vincolo aggiornato con successo')
      handleCloseDialog()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/constraints/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nell\'eliminazione')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-constraints', userId] })
      toast.success('Vincolo eliminato')
      setDeleteId(null)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleOpenDialog = (constraint?: Constraint) => {
    if (constraint) {
      setEditingConstraint(constraint)
      setFormData({
        constraintType: constraint.constraintType,
        config: constraint.config || {},
        validFrom: constraint.validFrom?.split('T')[0] || '',
        validTo: constraint.validTo?.split('T')[0] || '',
        priority: constraint.priority,
        isHardConstraint: constraint.isHardConstraint,
        notes: constraint.notes || '',
      })
    } else {
      setEditingConstraint(null)
      setFormData({
        constraintType: '',
        config: {},
        validFrom: '',
        validTo: '',
        priority: 5,
        isHardConstraint: true,
        notes: '',
      })
    }
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingConstraint(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.constraintType) return

    if (editingConstraint) {
      updateMutation.mutate({ id: editingConstraint.id, data: formData })
    } else {
      createMutation.mutate(formData)
    }
  }

  const updateConfig = (key: string, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      config: { ...prev.config, [key]: value },
    }))
  }

  const renderConfigFields = () => {
    if (!formData.constraintType) return null
    const type = CONSTRAINT_TYPES[formData.constraintType]
    if (!type) return null

    return (
      <div className="space-y-4 pt-4 border-t">
        <h4 className="font-medium text-sm">Configurazione</h4>

        {type.configFields.includes('dayOfWeek') && (
          <div className="space-y-2">
            <Label>Giorno della settimana</Label>
            <Select
              value={String(formData.config.dayOfWeek ?? '')}
              onValueChange={v => updateConfig('dayOfWeek', parseInt(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona giorno" />
              </SelectTrigger>
              <SelectContent>
                {DAYS_OF_WEEK.map(day => (
                  <SelectItem key={day.value} value={String(day.value)}>
                    {day.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {type.configFields.includes('startTime') && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Ora inizio</Label>
              <Input
                type="time"
                value={(formData.config.startTime as string) || ''}
                onChange={e => updateConfig('startTime', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Ora fine</Label>
              <Input
                type="time"
                value={(formData.config.endTime as string) || ''}
                onChange={e => updateConfig('endTime', e.target.value)}
              />
            </div>
          </div>
        )}

        {type.configFields.includes('available') && (
          <div className="flex items-center gap-2">
            <Switch
              checked={formData.config.available as boolean ?? true}
              onCheckedChange={v => updateConfig('available', v)}
            />
            <Label>Disponibile in questo orario</Label>
          </div>
        )}

        {type.configFields.includes('maxHours') && (
          <div className="space-y-2">
            <Label>Ore massime settimanali: {Number(formData.config.maxHours) || 40}</Label>
            <Slider
              value={[Number(formData.config.maxHours) || 40]}
              onValueChange={([v]) => updateConfig('maxHours', v)}
              min={10}
              max={60}
              step={1}
            />
          </div>
        )}

        {type.configFields.includes('minRestHours') && (
          <div className="space-y-2">
            <Label>Ore riposo minimo: {Number(formData.config.minRestHours) || 11}</Label>
            <Slider
              value={[Number(formData.config.minRestHours) || 11]}
              onValueChange={([v]) => updateConfig('minRestHours', v)}
              min={8}
              max={24}
              step={1}
            />
          </div>
        )}

        {type.configFields.includes('maxDays') && (
          <div className="space-y-2">
            <Label>Giorni consecutivi max: {Number(formData.config.maxDays) || 6}</Label>
            <Slider
              value={[Number(formData.config.maxDays) || 6]}
              onValueChange={([v]) => updateConfig('maxDays', v)}
              min={3}
              max={7}
              step={1}
            />
          </div>
        )}

        {type.configFields.includes('shiftType') && (
          <div className="space-y-2">
            <Label>Tipo turno</Label>
            <Select
              value={(formData.config.shiftType as string) || ''}
              onValueChange={v => updateConfig('shiftType', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona turno" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MORNING">Mattina</SelectItem>
                <SelectItem value="AFTERNOON">Pomeriggio</SelectItem>
                <SelectItem value="EVENING">Sera</SelectItem>
                <SelectItem value="NIGHT">Notte</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {type.configFields.includes('preference') && (
          <div className="space-y-2">
            <Label>Preferenza</Label>
            <Select
              value={(formData.config.preference as string) || 'PREFER'}
              onValueChange={v => updateConfig('preference', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PREFER">Preferito</SelectItem>
                <SelectItem value="AVOID">Da evitare</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {type.configFields.includes('reason') && (
          <div className="space-y-2">
            <Label>Motivo</Label>
            <Input
              value={(formData.config.reason as string) || ''}
              onChange={e => updateConfig('reason', e.target.value)}
              placeholder="es. Corso universitario"
            />
          </div>
        )}

        {type.configFields.includes('skill') && (
          <div className="space-y-2">
            <Label>Competenza</Label>
            <Input
              value={(formData.config.skill as string) || ''}
              onChange={e => updateConfig('skill', e.target.value)}
              placeholder="es. Barista"
            />
          </div>
        )}
      </div>
    )
  }

  const getConstraintSummary = (constraint: Constraint) => {
    const config = constraint.config || {}
    switch (constraint.constraintType) {
      case 'AVAILABILITY':
        const day = DAYS_OF_WEEK.find(d => d.value === config.dayOfWeek)?.label
        return `${day || 'Ogni giorno'} ${config.startTime || ''}-${config.endTime || ''} ${config.available ? '(disponibile)' : '(non disponibile)'}`
      case 'MAX_HOURS':
        return `Max ${config.maxHours || 40} ore/settimana`
      case 'MIN_REST':
        return `Min ${config.minRestHours || 11} ore riposo`
      case 'PREFERRED_SHIFT':
        return `Turno ${config.shiftType} (${config.preference === 'PREFER' ? 'preferito' : 'da evitare'})`
      case 'BLOCKED_DAY':
        const blockedDay = DAYS_OF_WEEK.find(d => d.value === config.dayOfWeek)?.label
        return `${blockedDay} bloccato${config.reason ? ` - ${config.reason}` : ''}`
      case 'SKILL_REQUIRED':
        return `Richiede: ${config.skill}`
      case 'CONSECUTIVE_DAYS':
        return `Max ${config.maxDays || 6} giorni consecutivi`
      default:
        return JSON.stringify(config)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">Caricamento vincoli...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Vincoli Individuali</CardTitle>
            <CardDescription>
              Gestisci vincoli e preferenze per {userName}
            </CardDescription>
          </div>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Nuovo Vincolo
          </Button>
        </CardHeader>
        <CardContent>
          {constraints.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nessun vincolo configurato
            </div>
          ) : (
            <div className="space-y-3">
              {constraints.map(constraint => {
                const TypeIcon = CONSTRAINT_TYPES[constraint.constraintType]?.icon || AlertTriangle
                return (
                  <div
                    key={constraint.id}
                    className="flex items-start justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${constraint.isHardConstraint ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        <TypeIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {CONSTRAINT_TYPES[constraint.constraintType]?.label || constraint.constraintType}
                          </span>
                          <Badge variant={constraint.isHardConstraint ? 'destructive' : 'secondary'} className="text-xs">
                            {constraint.isHardConstraint ? 'Vincolante' : 'Preferenza'}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            Priorità: {constraint.priority}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {getConstraintSummary(constraint)}
                        </p>
                        {(constraint.validFrom || constraint.validTo) && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {constraint.validFrom && `Dal ${format(new Date(constraint.validFrom), 'dd/MM/yyyy', { locale: it })}`}
                            {constraint.validFrom && constraint.validTo && ' - '}
                            {constraint.validTo && `Al ${format(new Date(constraint.validTo), 'dd/MM/yyyy', { locale: it })}`}
                          </p>
                        )}
                        {constraint.notes && (
                          <p className="text-xs text-muted-foreground italic mt-1">
                            {constraint.notes}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDialog(constraint)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(constraint.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog creazione/modifica */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingConstraint ? 'Modifica Vincolo' : 'Nuovo Vincolo'}
            </DialogTitle>
            <DialogDescription>
              {editingConstraint
                ? 'Modifica i parametri del vincolo'
                : 'Crea un nuovo vincolo per il dipendente'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo vincolo</Label>
              <Select
                value={formData.constraintType}
                onValueChange={v => setFormData(prev => ({
                  ...prev,
                  constraintType: v as keyof typeof CONSTRAINT_TYPES,
                  config: {},
                }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona tipo" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CONSTRAINT_TYPES).map(([key, type]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <type.icon className="h-4 w-4" />
                        <span>{type.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {renderConfigFields()}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valido dal</Label>
                <Input
                  type="date"
                  value={formData.validFrom}
                  onChange={e => setFormData(prev => ({ ...prev, validFrom: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Valido al</Label>
                <Input
                  type="date"
                  value={formData.validTo}
                  onChange={e => setFormData(prev => ({ ...prev, validTo: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Priorità: {formData.priority}</Label>
              <Slider
                value={[formData.priority]}
                onValueChange={([v]) => setFormData(prev => ({ ...prev, priority: v }))}
                min={1}
                max={10}
                step={1}
              />
              <p className="text-xs text-muted-foreground">
                1 = bassa priorità, 10 = alta priorità
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={formData.isHardConstraint}
                onCheckedChange={v => setFormData(prev => ({ ...prev, isHardConstraint: v }))}
              />
              <Label>Vincolo rigido (non violabile)</Label>
            </div>

            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea
                value={formData.notes}
                onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Note aggiuntive..."
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={!formData.constraintType || createMutation.isPending || updateMutation.isPending}
              >
                {editingConstraint ? 'Salva' : 'Crea'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog conferma eliminazione */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina vincolo</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare questo vincolo? L&apos;azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
