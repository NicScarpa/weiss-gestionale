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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import { Plus, Pencil, Trash2, Users, Heart, Ban, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  REL_CONSTRAINT_LIMITS,
  type RelConstraintType,
} from '@/lib/validations/relationship-constraints'

/**
 * Parametro numerico configurabile di un tipo di vincolo.
 *
 * `configKey` è la chiave scritta in `config`: deve restare quella che il
 * solver legge come prima scelta (vedi `getMinOverlapMinutes` e
 * `getMaxTogetherLimit` in `src/lib/shift-generation/constraints.ts`).
 * `fallbackKeys` sono le varianti che il solver accetta comunque e che possono
 * trovarsi su vincoli salvati in passato: servono a precompilare il campo.
 */
interface ConstraintParam {
  configKey: 'minOverlapMinutes' | 'maxShiftsTogether'
  fallbackKeys: string[]
  label: string
  hint: string
  unit: string
  min: number
  max: number
  step: number
  default: number
}

// Tipi di vincolo relazionale (devono corrispondere all'enum Prisma RelConstraintType).
// Le descrizioni riflettono il comportamento reale del solver: se cambia
// `checkRelationshipConstraints`/`checkWeeklyRelationshipConstraints`, vanno aggiornate.
const REL_CONSTRAINT_TYPES: Record<RelConstraintType, {
  label: string
  description: string
  icon: typeof Users
  color: string
  param?: ConstraintParam
}> = {
  SAME_DAY_OFF: {
    label: 'Stesso giorno libero',
    description:
      'Devono avere almeno un giorno di riposo in comune ogni settimana, valutato solo sulle settimane interamente pianificate',
    icon: Calendar,
    color: 'bg-blue-100 text-blue-700',
  },
  NEVER_TOGETHER: {
    label: 'Mai insieme',
    description: 'Non devono essere assegnati allo stesso turno nello stesso giorno',
    icon: Ban,
    color: 'bg-red-100 text-red-700',
  },
  ALWAYS_TOGETHER: {
    label: 'Sempre insieme',
    description: 'Se lavorano lo stesso giorno devono stare nello stesso turno',
    icon: Users,
    color: 'bg-green-100 text-green-700',
  },
  MIN_OVERLAP: {
    label: 'Passaggio di consegne',
    description: 'Lo stesso giorno in turni diversi i turni devono sovrapporsi di N minuti',
    icon: Heart,
    color: 'bg-pink-100 text-pink-700',
    param: {
      configKey: 'minOverlapMinutes',
      fallbackKeys: ['minutes', 'value'],
      label: 'Minuti di sovrapposizione minima',
      hint: 'Minuti in cui i due turni devono essere entrambi in corso per consentire il passaggio di consegne.',
      unit: 'minuti',
      min: REL_CONSTRAINT_LIMITS.minOverlapMinutes.min,
      max: REL_CONSTRAINT_LIMITS.minOverlapMinutes.max,
      step: REL_CONSTRAINT_LIMITS.minOverlapMinutes.step,
      default: REL_CONSTRAINT_LIMITS.minOverlapMinutes.default,
    },
  },
  MAX_TOGETHER: {
    label: 'Massimo turni insieme',
    description: 'Limita quanti turni possono svolgere fianco a fianco in una settimana',
    icon: Users,
    color: 'bg-amber-100 text-amber-700',
    param: {
      configKey: 'maxShiftsTogether',
      fallbackKeys: ['maxTogether', 'value'],
      label: 'Massimo turni insieme a settimana',
      hint: 'Contano solo i turni identici nello stesso giorno, cioè il tempo passato davvero insieme.',
      unit: 'turni/settimana',
      min: REL_CONSTRAINT_LIMITS.maxShiftsTogether.min,
      max: REL_CONSTRAINT_LIMITS.maxShiftsTogether.max,
      step: REL_CONSTRAINT_LIMITS.maxShiftsTogether.step,
      default: REL_CONSTRAINT_LIMITS.maxShiftsTogether.default,
    },
  },
}

/**
 * Come il solver applica ciascun tipo quando il vincolo è marcato rigido.
 * SAME_DAY_OFF non entra nella scelta dei candidati: il greedy solver lo
 * verifica solo a schedulazione conclusa, quindi produce una segnalazione, non
 * un blocco.
 */
const HARD_ENFORCEMENT_NOTE: Record<RelConstraintType, string> = {
  SAME_DAY_OFF:
    'Questo vincolo non blocca l\'assegnazione: viene verificato a generazione conclusa e segnalato fra le violazioni.',
  NEVER_TOGETHER: 'Se rigido, il generatore non assegna mai i due dipendenti allo stesso turno.',
  ALWAYS_TOGETHER:
    'Se rigido, il generatore scarta le assegnazioni che li metterebbero in turni diversi lo stesso giorno.',
  MIN_OVERLAP:
    'Se rigido, il generatore scarta le assegnazioni che non raggiungono la sovrapposizione richiesta.',
  MAX_TOGETHER: 'Se rigido, il generatore si ferma prima di superare il tetto settimanale.',
}

/** Valore da mostrare nel campo numerico aprendo un vincolo esistente. */
function readParamValue(
  param: ConstraintParam,
  config: Record<string, unknown> | undefined
): string {
  for (const key of [param.configKey, ...param.fallbackKeys]) {
    const raw = config?.[key]
    if (raw === undefined || raw === null || raw === '') continue
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return String(parsed)
  }
  return String(param.default)
}

/** Soglia effettiva di un vincolo, per il riepilogo in elenco. */
function describeParam(
  constraintType: RelConstraintType,
  config: Record<string, unknown>
): string | null {
  const param = REL_CONSTRAINT_TYPES[constraintType]?.param
  if (!param) return null
  return `${readParamValue(param, config)} ${param.unit}`
}

interface User {
  id: string
  firstName: string
  lastName: string
  email: string
}

interface RelConstraintUser {
  id: string
  user: User
}

interface RelConstraint {
  id: string
  constraintType: RelConstraintType
  config: Record<string, unknown>
  validFrom: string | null
  validTo: string | null
  priority: number
  isHardConstraint: boolean
  notes: string | null
  users: RelConstraintUser[]
  venue?: {
    id: string
    name: string
    code: string
  }
}

interface RelationshipConstraintEditorProps {
  venueId?: string
}

/**
 * Messaggio da mostrare quando l'API rifiuta la richiesta. Gli errori di
 * validazione arrivano come `{ error, details }`: senza il primo dettaglio
 * l'utente leggerebbe solo "Dati non validi".
 */
async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json()
    const detail = Array.isArray(body?.details) ? body.details[0]?.message : undefined
    if (body?.error && detail) return `${body.error}: ${detail}`
    return body?.error || fallback
  } catch {
    return fallback
  }
}

/** Corpo inviato all'API: `config` contiene solo la soglia del tipo scelto. */
interface ConstraintPayload {
  constraintType: RelConstraintType
  config: Record<string, number>
  validFrom: string | null
  validTo: string | null
  priority: number
  isHardConstraint: boolean
  notes: string | null
  userIds: string[]
}

export function RelationshipConstraintEditor({ venueId }: RelationshipConstraintEditorProps) {
  const queryClient = useQueryClient()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingConstraint, setEditingConstraint] = useState<RelConstraint | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Form state. `paramValue` è la soglia del tipo selezionato, tenuta come
  // stringa perché l'input possa restare temporaneamente vuoto durante la
  // digitazione; viene convertita in `config` solo al salvataggio.
  const [formData, setFormData] = useState({
    constraintType: '' as RelConstraintType | '',
    paramValue: '',
    validFrom: '',
    validTo: '',
    priority: 5,
    isHardConstraint: true,
    notes: '',
    userIds: [] as string[],
  })

  const selectedType = formData.constraintType
    ? REL_CONSTRAINT_TYPES[formData.constraintType]
    : null
  const selectedParam = selectedType?.param ?? null

  // Fetch constraints
  const { data: constraintsData, isLoading } = useQuery({
    queryKey: ['relationship-constraints', venueId],
    queryFn: async () => {
      const url = venueId
        ? `/api/relationship-constraints?venueId=${venueId}`
        : '/api/relationship-constraints'
      const res = await fetch(url)
      if (!res.ok) throw new Error('Errore nel caricamento vincoli')
      return res.json()
    },
  })

  // Fetch staff for selection
  const { data: staffData } = useQuery({
    queryKey: ['staff-list'],
    queryFn: async () => {
      const res = await fetch('/api/staff')
      if (!res.ok) throw new Error('Errore nel caricamento staff')
      return res.json()
    },
  })

  const constraints: RelConstraint[] = constraintsData?.data || []
  const staffList: User[] = staffData?.data || []

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: ConstraintPayload) => {
      const res = await fetch('/api/relationship-constraints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          venueId: venueId || undefined,
        }),
      })
      if (!res.ok) {
        throw new Error(await readApiError(res, 'Errore nella creazione'))
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['relationship-constraints', venueId] })
      toast.success('Vincolo relazionale creato')
      handleCloseDialog()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ConstraintPayload }) => {
      const res = await fetch(`/api/relationship-constraints/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        throw new Error(await readApiError(res, 'Errore nell\'aggiornamento'))
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['relationship-constraints', venueId] })
      toast.success('Vincolo aggiornato')
      handleCloseDialog()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/relationship-constraints/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        throw new Error(await readApiError(res, 'Errore nell\'eliminazione'))
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['relationship-constraints', venueId] })
      toast.success('Vincolo eliminato')
      setDeleteId(null)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleOpenDialog = (constraint?: RelConstraint) => {
    if (constraint) {
      const param = REL_CONSTRAINT_TYPES[constraint.constraintType]?.param
      setEditingConstraint(constraint)
      setFormData({
        constraintType: constraint.constraintType,
        paramValue: param ? readParamValue(param, constraint.config) : '',
        validFrom: constraint.validFrom?.split('T')[0] || '',
        validTo: constraint.validTo?.split('T')[0] || '',
        priority: constraint.priority,
        isHardConstraint: constraint.isHardConstraint,
        notes: constraint.notes || '',
        userIds: constraint.users.map(u => u.user.id),
      })
    } else {
      setEditingConstraint(null)
      setFormData({
        constraintType: '',
        paramValue: '',
        validFrom: '',
        validTo: '',
        priority: 5,
        isHardConstraint: true,
        notes: '',
        userIds: [],
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
    if (!formData.constraintType || formData.userIds.length < 2) return

    // La soglia va nel Json `config` con la chiave letta dal solver; per i tipi
    // senza parametri resta vuoto
    const config: Record<string, number> = {}
    if (selectedParam) {
      const parsed = Number(formData.paramValue)
      if (
        formData.paramValue.trim() === '' ||
        !Number.isInteger(parsed) ||
        parsed < selectedParam.min ||
        parsed > selectedParam.max
      ) {
        toast.error(
          `${selectedParam.label}: inserisci un numero intero fra ${selectedParam.min} e ${selectedParam.max}`
        )
        return
      }
      config[selectedParam.configKey] = parsed
    }

    const payload: ConstraintPayload = {
      constraintType: formData.constraintType,
      config,
      validFrom: formData.validFrom || null,
      validTo: formData.validTo || null,
      priority: formData.priority,
      isHardConstraint: formData.isHardConstraint,
      notes: formData.notes || null,
      userIds: formData.userIds,
    }

    if (editingConstraint) {
      updateMutation.mutate({ id: editingConstraint.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const toggleUser = (userId: string) => {
    setFormData(prev => ({
      ...prev,
      userIds: prev.userIds.includes(userId)
        ? prev.userIds.filter(id => id !== userId)
        : [...prev.userIds, userId],
    }))
  }

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">Caricamento vincoli relazionali...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Vincoli Relazionali</CardTitle>
            <CardDescription>
              Gestisci vincoli tra dipendenti (lavorare insieme, separati, etc.)
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
              Nessun vincolo relazionale configurato
            </div>
          ) : (
            <div className="space-y-3">
              {constraints.map(constraint => {
                const typeInfo = REL_CONSTRAINT_TYPES[constraint.constraintType]
                const TypeIcon = typeInfo?.icon || Users
                return (
                  <div
                    key={constraint.id}
                    className="flex items-start justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${typeInfo?.color || 'bg-gray-100'}`}>
                        <TypeIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">
                            {typeInfo?.label || constraint.constraintType}
                          </span>
                          <Badge variant={constraint.isHardConstraint ? 'destructive' : 'secondary'} className="text-xs">
                            {constraint.isHardConstraint ? 'Vincolante' : 'Preferenza'}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            Priorità: {constraint.priority}
                          </Badge>
                          {describeParam(constraint.constraintType, constraint.config) && (
                            <Badge variant="outline" className="text-xs">
                              {describeParam(constraint.constraintType, constraint.config)}
                            </Badge>
                          )}
                        </div>
                        {typeInfo?.description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {typeInfo.description}
                          </p>
                        )}

                        {/* Dipendenti coinvolti */}
                        <div className="flex items-center gap-1 mt-2">
                          {constraint.users.map((u, idx) => (
                            <div key={u.id} className="flex items-center">
                              {idx > 0 && <span className="mx-1 text-muted-foreground">+</span>}
                              <div className="flex items-center gap-1 bg-muted px-2 py-1 rounded-full text-sm">
                                <Avatar className="h-5 w-5">
                                  <AvatarFallback className="text-xs">
                                    {getInitials(u.user.firstName, u.user.lastName)}
                                  </AvatarFallback>
                                </Avatar>
                                {u.user.firstName} {u.user.lastName}
                              </div>
                            </div>
                          ))}
                        </div>

                        {(constraint.validFrom || constraint.validTo) && (
                          <p className="text-xs text-muted-foreground mt-2">
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
              {editingConstraint ? 'Modifica Vincolo Relazionale' : 'Nuovo Vincolo Relazionale'}
            </DialogTitle>
            <DialogDescription>
              {editingConstraint
                ? 'Modifica i parametri del vincolo'
                : 'Crea un vincolo tra due o più dipendenti'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo vincolo</Label>
              <Select
                value={formData.constraintType}
                onValueChange={v => {
                  const type = v as RelConstraintType
                  const param = REL_CONSTRAINT_TYPES[type]?.param
                  setFormData(prev => ({
                    ...prev,
                    constraintType: type,
                    // Cambiando tipo la soglia precedente non ha più significato
                    paramValue: param ? String(param.default) : '',
                  }))
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona tipo" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REL_CONSTRAINT_TYPES).map(([key, type]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <type.icon className="h-4 w-4" />
                        <div>
                          <div>{type.label}</div>
                          <div className="text-xs text-muted-foreground">{type.description}</div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedType && (
                <p className="text-xs text-muted-foreground">{selectedType.description}</p>
              )}
            </div>

            {/* Soglia numerica, solo per i tipi che ne hanno una */}
            {selectedParam && (
              <div className="space-y-2">
                <Label htmlFor="constraint-param">{selectedParam.label}</Label>
                <Input
                  id="constraint-param"
                  type="number"
                  inputMode="numeric"
                  min={selectedParam.min}
                  max={selectedParam.max}
                  step={selectedParam.step}
                  value={formData.paramValue}
                  onChange={e => setFormData(prev => ({ ...prev, paramValue: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  {selectedParam.hint} Valore consentito: da {selectedParam.min} a{' '}
                  {selectedParam.max} (predefinito {selectedParam.default}).
                </p>
              </div>
            )}

            {/* Selezione dipendenti */}
            <div className="space-y-2">
              <Label>Dipendenti coinvolti (min. 2)</Label>
              <div className="border rounded-lg max-h-48 overflow-y-auto">
                {staffList.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    Nessun dipendente disponibile
                  </div>
                ) : (
                  staffList.map(user => {
                    const isSelected = formData.userIds.includes(user.id)
                    return (
                    <div
                      key={user.id}
                      className="flex items-center gap-3 p-3 hover:bg-muted cursor-pointer border-b last:border-0"
                      onClick={() => toggleUser(user.id)}
                    >
                      <div className={`h-4 w-4 rounded border-2 flex items-center justify-center ${isSelected ? 'bg-primary border-primary' : 'border-muted-foreground'}`}>
                        {isSelected && <span className="text-primary-foreground text-xs">✓</span>}
                      </div>
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>
                          {getInitials(user.firstName, user.lastName)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium text-sm">
                          {user.firstName} {user.lastName}
                        </div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                      </div>
                    </div>
                  )})
                )}
              </div>
              {formData.userIds.length < 2 && formData.userIds.length > 0 && (
                <p className="text-xs text-amber-600">Seleziona almeno 2 dipendenti</p>
              )}
            </div>

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

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.isHardConstraint}
                  onCheckedChange={v => setFormData(prev => ({ ...prev, isHardConstraint: v }))}
                />
                <Label>Vincolo rigido (non violabile)</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                {formData.constraintType && formData.isHardConstraint
                  ? HARD_ENFORCEMENT_NOTE[formData.constraintType]
                  : 'Come preferenza il vincolo non blocca la generazione: le violazioni compaiono fra le segnalazioni della schedulazione.'}
              </p>
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
                disabled={
                  !formData.constraintType ||
                  formData.userIds.length < 2 ||
                  createMutation.isPending ||
                  updateMutation.isPending
                }
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
            <AlertDialogTitle>Elimina vincolo relazionale</AlertDialogTitle>
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
