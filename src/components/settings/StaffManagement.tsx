'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Pencil, Users, UserPlus, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'

interface Staff {
  id: string
  firstName: string
  lastName: string
  email: string
  isFixedStaff: boolean
  hourlyRate: number | null
  defaultShift: 'MORNING' | 'EVENING' | null
  isActive: boolean
  venue: {
    id: string
    name: string
    code: string
  } | null
  role: {
    id: string
    name: string
  }
}

export function StaffManagement() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  // Form state per modifica
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    isFixedStaff: true,
    hourlyRate: '',
    defaultShift: '' as 'MORNING' | 'EVENING' | '',
    isActive: true,
  })

  // Form state per creazione
  const [createFormData, setCreateFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    isFixedStaff: true,
    hourlyRate: '',
    defaultShift: '' as 'MORNING' | 'EVENING' | '',
  })

  // Carica lista staff
  const fetchStaff = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/staff?showInactive=${showInactive}`)
      if (!res.ok) throw new Error('Errore nel caricamento')
      const data = await res.json()
      setStaff(data.data || [])
    } catch (error) {
      console.error('Errore:', error)
      toast.error('Errore nel caricamento dei dipendenti')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStaff()
  }, [showInactive])

  // Apri dialog modifica
  const handleEdit = (member: Staff) => {
    setEditingStaff(member)
    setFormData({
      firstName: member.firstName,
      lastName: member.lastName,
      isFixedStaff: member.isFixedStaff,
      hourlyRate: member.hourlyRate?.toString() || '',
      defaultShift: member.defaultShift || '',
      isActive: member.isActive,
    })
    setIsDialogOpen(true)
  }

  // Salva modifiche
  const handleSave = async () => {
    if (!editingStaff) return

    try {
      setSaving(true)

      const updateData: any = {
        id: editingStaff.id,
        firstName: formData.firstName,
        lastName: formData.lastName,
        isFixedStaff: formData.isFixedStaff,
        hourlyRate: formData.hourlyRate ? parseFloat(formData.hourlyRate) : null,
        defaultShift: formData.defaultShift || null,
        isActive: formData.isActive,
      }

      const res = await fetch('/api/staff', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Errore nel salvataggio')
      }

      toast.success('Dipendente aggiornato')
      setIsDialogOpen(false)
      setEditingStaff(null)
      fetchStaff()
    } catch (error: any) {
      console.error('Errore:', error)
      toast.error(error.message || 'Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  // Crea nuovo dipendente
  const handleCreate = async () => {
    if (!createFormData.firstName || !createFormData.lastName || !createFormData.email) {
      toast.error('Compila tutti i campi obbligatori')
      return
    }

    try {
      setSaving(true)

      const newStaffData: any = {
        firstName: createFormData.firstName,
        lastName: createFormData.lastName,
        email: createFormData.email,
        isFixedStaff: createFormData.isFixedStaff,
        hourlyRate: createFormData.hourlyRate ? parseFloat(createFormData.hourlyRate) : null,
        defaultShift: createFormData.defaultShift || null,
      }

      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStaffData),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Errore nella creazione')
      }

      toast.success('Dipendente creato')
      setIsCreateDialogOpen(false)
      setCreateFormData({
        firstName: '',
        lastName: '',
        email: '',
        isFixedStaff: true,
        hourlyRate: '',
        defaultShift: '',
      })
      fetchStaff()
    } catch (error: any) {
      console.error('Errore:', error)
      toast.error(error.message || 'Errore nella creazione')
    } finally {
      setSaving(false)
    }
  }

  // Separa dipendenti e extra
  const fixedStaff = staff.filter((s) => s.isFixedStaff)
  const extraStaff = staff.filter((s) => !s.isFixedStaff)

  const getShiftLabel = (shift: string | null) => {
    switch (shift) {
      case 'MORNING':
        return 'Mattina'
      case 'EVENING':
        return 'Sera'
      default:
        return '-'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Controlli */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            id="show-inactive"
            checked={showInactive}
            onCheckedChange={setShowInactive}
          />
          <Label htmlFor="show-inactive" className="text-sm">
            Mostra inattivi
          </Label>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Dipendente
        </Button>
      </div>

      {/* Dipendenti Fissi */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Dipendenti ({fixedStaff.length})
          </CardTitle>
          <CardDescription>
            Personale fisso con turno assegnato
          </CardDescription>
        </CardHeader>
        <CardContent>
          {fixedStaff.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nessun dipendente fisso configurato
            </p>
          ) : (
            <div className="space-y-2">
              {fixedStaff.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <span className="font-medium">
                        {member.firstName} {member.lastName}
                      </span>
                      {!member.isActive && (
                        <Badge variant="secondary" className="ml-2">
                          Inattivo
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-sm text-muted-foreground">
                      Turno: <span className="font-medium">{getShiftLabel(member.defaultShift)}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(member)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Personale Extra */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Extra ({extraStaff.length})
          </CardTitle>
          <CardDescription>
            Collaboratori occasionali con paga oraria
          </CardDescription>
        </CardHeader>
        <CardContent>
          {extraStaff.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nessun collaboratore extra configurato
            </p>
          ) : (
            <div className="space-y-2">
              {extraStaff.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <span className="font-medium">
                        {member.firstName} {member.lastName}
                      </span>
                      {!member.isActive && (
                        <Badge variant="secondary" className="ml-2">
                          Inattivo
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-sm text-muted-foreground">
                      {member.hourlyRate ? (
                        <>Paga: <span className="font-mono font-medium">{member.hourlyRate}€/h</span></>
                      ) : (
                        'Paga non impostata'
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(member)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Modifica */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica Dipendente</DialogTitle>
            <DialogDescription>
              Modifica le informazioni del dipendente
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Nome e Cognome */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">Nome</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) =>
                    setFormData({ ...formData, firstName: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Cognome</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) =>
                    setFormData({ ...formData, lastName: e.target.value })
                  }
                />
              </div>
            </div>

            {/* Tipo Dipendente */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Tipo Dipendente</Label>
                <p className="text-sm text-muted-foreground">
                  {formData.isFixedStaff ? 'Dipendente fisso' : 'Collaboratore extra'}
                </p>
              </div>
              <Switch
                checked={formData.isFixedStaff}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isFixedStaff: checked })
                }
              />
            </div>

            {/* Turno Default (solo per fissi) */}
            {formData.isFixedStaff && (
              <div className="space-y-2">
                <Label htmlFor="defaultShift">Turno Default</Label>
                <Select
                  value={formData.defaultShift}
                  onValueChange={(value: 'MORNING' | 'EVENING' | '') =>
                    setFormData({ ...formData, defaultShift: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona turno..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MORNING">Mattina</SelectItem>
                    <SelectItem value="EVENING">Sera</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Il turno selezionato automaticamente quando aggiungi questo dipendente alla chiusura
                </p>
              </div>
            )}

            {/* Paga Oraria (solo per extra) */}
            {!formData.isFixedStaff && (
              <div className="space-y-2">
                <Label htmlFor="hourlyRate">Paga Oraria</Label>
                <div className="relative">
                  <Input
                    id="hourlyRate"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.hourlyRate}
                    onChange={(e) =>
                      setFormData({ ...formData, hourlyRate: e.target.value })
                    }
                    className="pr-10"
                    placeholder="0.00"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    €/h
                  </span>
                </div>
              </div>
            )}

            {/* Stato Attivo */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Stato</Label>
                <p className="text-sm text-muted-foreground">
                  {formData.isActive ? 'Attivo' : 'Inattivo'}
                </p>
              </div>
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isActive: checked })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={saving}
            >
              Annulla
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvataggio...
                </>
              ) : (
                'Salva'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Creazione */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuovo Dipendente</DialogTitle>
            <DialogDescription>
              Inserisci i dati del nuovo dipendente
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Nome e Cognome */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="create-firstName">Nome *</Label>
                <Input
                  id="create-firstName"
                  value={createFormData.firstName}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, firstName: e.target.value })
                  }
                  placeholder="Mario"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-lastName">Cognome *</Label>
                <Input
                  id="create-lastName"
                  value={createFormData.lastName}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, lastName: e.target.value })
                  }
                  placeholder="Rossi"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="create-email">Email *</Label>
              <Input
                id="create-email"
                type="email"
                value={createFormData.email}
                onChange={(e) =>
                  setCreateFormData({ ...createFormData, email: e.target.value })
                }
                placeholder="mario.rossi@esempio.it"
              />
            </div>

            {/* Tipo Dipendente */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Tipo Dipendente</Label>
                <p className="text-sm text-muted-foreground">
                  {createFormData.isFixedStaff ? 'Dipendente fisso' : 'Collaboratore extra'}
                </p>
              </div>
              <Switch
                checked={createFormData.isFixedStaff}
                onCheckedChange={(checked) =>
                  setCreateFormData({ ...createFormData, isFixedStaff: checked })
                }
              />
            </div>

            {/* Turno Default (solo per fissi) */}
            {createFormData.isFixedStaff && (
              <div className="space-y-2">
                <Label htmlFor="create-defaultShift">Turno Default</Label>
                <Select
                  value={createFormData.defaultShift}
                  onValueChange={(value: 'MORNING' | 'EVENING' | '') =>
                    setCreateFormData({ ...createFormData, defaultShift: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona turno..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MORNING">Mattina</SelectItem>
                    <SelectItem value="EVENING">Sera</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Paga Oraria (solo per extra) */}
            {!createFormData.isFixedStaff && (
              <div className="space-y-2">
                <Label htmlFor="create-hourlyRate">Paga Oraria</Label>
                <div className="relative">
                  <Input
                    id="create-hourlyRate"
                    type="number"
                    min="0"
                    step="0.01"
                    value={createFormData.hourlyRate}
                    onChange={(e) =>
                      setCreateFormData({ ...createFormData, hourlyRate: e.target.value })
                    }
                    className="pr-10"
                    placeholder="0.00"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    €/h
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
              disabled={saving}
            >
              Annulla
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creazione...
                </>
              ) : (
                'Crea Dipendente'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
