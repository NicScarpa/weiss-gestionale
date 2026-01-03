'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Building2, Plus, Pencil, Trash2, Loader2, Users, Receipt } from 'lucide-react'
import { toast } from 'sonner'

interface Venue {
  id: string
  name: string
  code: string
  address: string | null
  defaultFloat: number
  vatRate: number
  isActive: boolean
  _count: {
    users: number
    closures: number
  }
}

const initialFormData = {
  name: '',
  code: '',
  address: '',
  defaultFloat: '114',
  vatRate: '10',
  isActive: true,
}

export function VenueManagement() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [venueToDelete, setVenueToDelete] = useState<Venue | null>(null)
  const [saving, setSaving] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [formData, setFormData] = useState(initialFormData)

  // Carica lista sedi
  const fetchVenues = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/venues?includeInactive=${showInactive}`)
      if (!res.ok) throw new Error('Errore nel caricamento')
      const data = await res.json()
      setVenues(data.venues || [])
    } catch (error) {
      console.error('Errore:', error)
      toast.error('Errore nel caricamento delle sedi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchVenues()
  }, [showInactive])

  // Apri dialog per nuova sede
  const handleNew = () => {
    setEditingVenue(null)
    setFormData(initialFormData)
    setIsDialogOpen(true)
  }

  // Apri dialog modifica
  const handleEdit = (venue: Venue) => {
    setEditingVenue(venue)
    setFormData({
      name: venue.name,
      code: venue.code,
      address: venue.address || '',
      defaultFloat: venue.defaultFloat.toString(),
      vatRate: venue.vatRate.toString(),
      isActive: venue.isActive,
    })
    setIsDialogOpen(true)
  }

  // Conferma eliminazione
  const handleDeleteConfirm = (venue: Venue) => {
    setVenueToDelete(venue)
    setIsDeleteDialogOpen(true)
  }

  // Salva sede
  const handleSave = async () => {
    if (!formData.name.trim() || !formData.code.trim()) {
      toast.error('Nome e codice sono obbligatori')
      return
    }

    try {
      setSaving(true)

      const payload = {
        ...(editingVenue && { id: editingVenue.id }),
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase(),
        address: formData.address.trim() || null,
        defaultFloat: parseFloat(formData.defaultFloat) || 114,
        vatRate: parseFloat(formData.vatRate) || 10,
        isActive: formData.isActive,
      }

      const res = await fetch('/api/venues', {
        method: editingVenue ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Errore nel salvataggio')
      }

      toast.success(editingVenue ? 'Sede aggiornata' : 'Sede creata')
      setIsDialogOpen(false)
      setEditingVenue(null)
      fetchVenues()
    } catch (error: any) {
      console.error('Errore:', error)
      toast.error(error.message || 'Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  // Elimina sede
  const handleDelete = async () => {
    if (!venueToDelete) return

    try {
      setSaving(true)
      const res = await fetch(`/api/venues?id=${venueToDelete.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Errore nell\'eliminazione')
      }

      const result = await res.json()
      toast.success(result.message)
      setIsDeleteDialogOpen(false)
      setVenueToDelete(null)
      fetchVenues()
    } catch (error: any) {
      console.error('Errore:', error)
      toast.error(error.message || 'Errore nell\'eliminazione')
    } finally {
      setSaving(false)
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
            id="show-inactive-venues"
            checked={showInactive}
            onCheckedChange={setShowInactive}
          />
          <Label htmlFor="show-inactive-venues" className="text-sm">
            Mostra inattive
          </Label>
        </div>
        <Button onClick={handleNew}>
          <Plus className="h-4 w-4 mr-2" />
          Nuova Sede
        </Button>
      </div>

      {/* Lista Sedi */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Sedi ({venues.length})
          </CardTitle>
          <CardDescription>
            Punti vendita e locali operativi
          </CardDescription>
        </CardHeader>
        <CardContent>
          {venues.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nessuna sede configurata
            </p>
          ) : (
            <div className="space-y-2">
              {venues.map((venue) => (
                <div
                  key={venue.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{venue.name}</span>
                        <Badge variant="outline" className="font-mono text-xs">
                          {venue.code}
                        </Badge>
                        {!venue.isActive && (
                          <Badge variant="secondary">Inattiva</Badge>
                        )}
                      </div>
                      {venue.address && (
                        <span className="text-sm text-muted-foreground">
                          {venue.address}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1" title="Dipendenti">
                        <Users className="h-3 w-3" />
                        {venue._count.users}
                      </span>
                      <span className="flex items-center gap-1" title="Chiusure">
                        <Receipt className="h-3 w-3" />
                        {venue._count.closures}
                      </span>
                      <span className="font-mono">
                        IVA {venue.vatRate}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(venue)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteConfirm(venue)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Crea/Modifica */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingVenue ? 'Modifica Sede' : 'Nuova Sede'}
            </DialogTitle>
            <DialogDescription>
              {editingVenue
                ? 'Modifica le informazioni della sede'
                : 'Inserisci i dati della nuova sede'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Nome e Codice */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="es. Weiss Cafe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Codice *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value.toUpperCase() })
                  }
                  placeholder="es. WEISS"
                  maxLength={10}
                  className="font-mono uppercase"
                />
              </div>
            </div>

            {/* Indirizzo */}
            <div className="space-y-2">
              <Label htmlFor="address">Indirizzo</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) =>
                  setFormData({ ...formData, address: e.target.value })
                }
                placeholder="Via Roma 1, Sacile (PN)"
              />
            </div>

            {/* Fondo Cassa e IVA */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="defaultFloat">Fondo Cassa Default</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">

                  </span>
                  <Input
                    id="defaultFloat"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.defaultFloat}
                    onChange={(e) =>
                      setFormData({ ...formData, defaultFloat: e.target.value })
                    }
                    className="pl-7 font-mono"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vatRate">Aliquota IVA</Label>
                <div className="relative">
                  <Input
                    id="vatRate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={formData.vatRate}
                    onChange={(e) =>
                      setFormData({ ...formData, vatRate: e.target.value })
                    }
                    className="pr-7 font-mono"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
            </div>

            {/* Stato Attivo */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Stato</Label>
                <p className="text-sm text-muted-foreground">
                  {formData.isActive ? 'Attiva' : 'Inattiva'}
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

      {/* Dialog Conferma Eliminazione */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina Sede</AlertDialogTitle>
            <AlertDialogDescription>
              {venueToDelete?._count.closures && venueToDelete._count.closures > 0 ? (
                <>
                  La sede <strong>{venueToDelete?.name}</strong> ha{' '}
                  {venueToDelete?._count.closures} chiusure associate.
                  Verra disattivata invece che eliminata.
                </>
              ) : (
                <>
                  Sei sicuro di voler eliminare la sede{' '}
                  <strong>{venueToDelete?.name}</strong>?
                  Questa azione non puo essere annullata.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={saving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Eliminazione...
                </>
              ) : venueToDelete?._count.closures && venueToDelete._count.closures > 0 ? (
                'Disattiva'
              ) : (
                'Elimina'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
