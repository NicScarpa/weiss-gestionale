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

// Tipi di vincolo relazionale (devono corrispondere all'enum Prisma RelConstraintType)
const REL_CONSTRAINT_TYPES = {
  SAME_DAY_OFF: {
    label: 'Stesso giorno libero',
    description: 'I dipendenti devono avere lo stesso giorno di riposo',
    icon: Calendar,
    color: 'bg-blue-100 text-blue-700',
  },
  NEVER_TOGETHER: {
    label: 'Mai insieme',
    description: 'I dipendenti non devono lavorare nello stesso turno',
    icon: Ban,
    color: 'bg-red-100 text-red-700',
  },
  ALWAYS_TOGETHER: {
    label: 'Sempre insieme',
    description: 'I dipendenti devono lavorare nello stesso turno',
    icon: Users,
    color: 'bg-green-100 text-green-700',
  },
  MIN_OVERLAP: {
    label: 'Sovrapposizione minima',
    description: 'Preferenza per lavorare insieme (soft constraint)',
    icon: Heart,
    color: 'bg-pink-100 text-pink-700',
  },
  MAX_TOGETHER: {
    label: 'Massimo tempo insieme',
    description: 'Limite massimo di turni insieme (soft constraint)',
    icon: Users,
    color: 'bg-amber-100 text-amber-700',
  },
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
  constraintType: keyof typeof REL_CONSTRAINT_TYPES
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

export function RelationshipConstraintEditor({ venueId }: RelationshipConstraintEditorProps) {
  const queryClient = useQueryClient()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingConstraint, setEditingConstraint] = useState<RelConstraint | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    constraintType: '' as keyof typeof REL_CONSTRAINT_TYPES | '',
    config: {} as Record<string, unknown>,
    validFrom: '',
    validTo: '',
    priority: 5,
    isHardConstraint: true,
    notes: '',
    userIds: [] as string[],
  })

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
    mutationFn: async (data: typeof formData) => {
      const res = await fetch('/api/relationship-constraints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          venueId: venueId || undefined,
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
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const res = await fetch(`/api/relationship-constraints/${id}`, {
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
        const err = await res.json()
        throw new Error(err.error || 'Errore nell\'eliminazione')
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
      setEditingConstraint(constraint)
      setFormData({
        constraintType: constraint.constraintType,
        config: constraint.config || {},
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
        config: {},
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

    if (editingConstraint) {
      updateMutation.mutate({ id: editingConstraint.id, data: formData })
    } else {
      createMutation.mutate(formData)
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
                        </div>

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
                onValueChange={v => setFormData(prev => ({
                  ...prev,
                  constraintType: v as keyof typeof REL_CONSTRAINT_TYPES,
                }))}
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
            </div>

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
