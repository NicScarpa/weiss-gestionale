'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowLeft, Plus, Pencil, Trash2, Clock, Users, Settings } from 'lucide-react'
import { toast } from 'sonner'

interface ShiftDefinition {
  id: string
  name: string
  code: string
  color: string | null
  startTime: string
  endTime: string
  breakMinutes: number
  minStaff: number
  maxStaff: number | null
  requiredSkills: string[]
  rateMultiplier: number
  position: number
  isActive: boolean
  venue: {
    id: string
    name: string
    code: string
  }
}

interface Venue {
  id: string
  name: string
  code: string
}

const COLORS = [
  { value: '#FCD34D', label: 'Giallo' },
  { value: '#F97316', label: 'Arancione' },
  { value: '#EF4444', label: 'Rosso' },
  { value: '#EC4899', label: 'Rosa' },
  { value: '#8B5CF6', label: 'Viola' },
  { value: '#3B82F6', label: 'Blu' },
  { value: '#06B6D4', label: 'Ciano' },
  { value: '#10B981', label: 'Verde' },
  { value: '#6B7280', label: 'Grigio' },
]

export default function ShiftDefinitionsPage() {
  const queryClient = useQueryClient()
  const [filterVenue, setFilterVenue] = useState<string>('all')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingShift, setEditingShift] = useState<ShiftDefinition | null>(null)

  const [formData, setFormData] = useState({
    venueId: '',
    name: '',
    code: '',
    color: '#3B82F6',
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 0,
    minStaff: 1,
    maxStaff: '',
    position: 0,
  })

  const { data: venuesData } = useQuery({
    queryKey: ['venues'],
    queryFn: async () => {
      const res = await fetch('/api/venues')
      if (!res.ok) throw new Error('Errore nel caricamento')
      return res.json()
    },
  })

  const { data: shiftsData, isLoading } = useQuery({
    queryKey: ['shift-definitions', filterVenue],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filterVenue !== 'all') params.append('venueId', filterVenue)
      params.append('includeInactive', 'true')
      const res = await fetch(`/api/shift-definitions?${params}`)
      if (!res.ok) throw new Error('Errore nel caricamento')
      return res.json()
    },
  })

  const venues: Venue[] = venuesData?.data || []
  const shifts: ShiftDefinition[] = shiftsData?.data || []

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch('/api/shift-definitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          maxStaff: data.maxStaff ? parseInt(data.maxStaff) : null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nella creazione')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-definitions'] })
      toast.success('Definizione turno creata')
      handleCloseDialog()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const res = await fetch(`/api/shift-definitions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          maxStaff: data.maxStaff ? parseInt(data.maxStaff) : null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nell\'aggiornamento')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-definitions'] })
      toast.success('Definizione turno aggiornata')
      handleCloseDialog()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/shift-definitions/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nell\'eliminazione')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-definitions'] })
      toast.success('Definizione turno eliminata')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleOpenDialog = (shift?: ShiftDefinition) => {
    if (shift) {
      setEditingShift(shift)
      setFormData({
        venueId: shift.venue.id,
        name: shift.name,
        code: shift.code,
        color: shift.color || '#3B82F6',
        startTime: shift.startTime,
        endTime: shift.endTime,
        breakMinutes: shift.breakMinutes,
        minStaff: shift.minStaff,
        maxStaff: shift.maxStaff?.toString() || '',
        position: shift.position,
      })
    } else {
      setEditingShift(null)
      setFormData({
        venueId: filterVenue !== 'all' ? filterVenue : (venues[0]?.id || ''),
        name: '',
        code: '',
        color: '#3B82F6',
        startTime: '09:00',
        endTime: '17:00',
        breakMinutes: 0,
        minStaff: 1,
        maxStaff: '',
        position: 0,
      })
    }
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingShift(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingShift) {
      updateMutation.mutate({ id: editingShift.id, data: formData })
    } else {
      createMutation.mutate(formData)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/turni">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Settings className="h-6 w-6" />
              Definizioni Turni
            </h1>
            <p className="text-muted-foreground">
              Configura i tipi di turno disponibili per sede
            </p>
          </div>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Turno
        </Button>
      </div>

      {/* Filtri */}
      <div className="flex items-center gap-4">
        <Select value={filterVenue} onValueChange={setFilterVenue}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filtra per sede" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le sedi</SelectItem>
            {venues.map(venue => (
              <SelectItem key={venue.id} value={venue.id}>
                {venue.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      <Card>
        <CardHeader>
          <CardTitle>
            Turni Configurati
            <Badge variant="secondary" className="ml-2">
              {shifts.length}
            </Badge>
          </CardTitle>
          <CardDescription>
            Questi turni saranno disponibili per la pianificazione
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Caricamento...
            </div>
          ) : shifts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nessuna definizione turno configurata</p>
              <Button className="mt-4" onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Crea il primo turno
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Turno</TableHead>
                  <TableHead>Orario</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Sede</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.map(shift => (
                  <TableRow key={shift.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: shift.color || '#6B7280' }}
                        />
                        <div>
                          <div className="font-medium">{shift.name}</div>
                          <div className="text-xs text-muted-foreground">
                            Codice: {shift.code}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        {shift.startTime} - {shift.endTime}
                        {shift.breakMinutes > 0 && (
                          <span className="text-xs text-muted-foreground">
                            ({shift.breakMinutes}min pausa)
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {shift.minStaff}
                        {shift.maxStaff && ` - ${shift.maxStaff}`}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{shift.venue.code}</Badge>
                    </TableCell>
                    <TableCell>
                      {shift.isActive ? (
                        <Badge className="bg-green-100 text-green-700">Attivo</Badge>
                      ) : (
                        <Badge variant="secondary">Inattivo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(shift)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm('Eliminare questa definizione turno?')) {
                              deleteMutation.mutate(shift.id)
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingShift ? 'Modifica Turno' : 'Nuovo Turno'}
            </DialogTitle>
            <DialogDescription>
              Configura i dettagli del turno
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!editingShift && (
              <div className="space-y-2">
                <Label>Sede</Label>
                <Select
                  value={formData.venueId}
                  onValueChange={v => setFormData(prev => ({ ...prev, venueId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona sede" />
                  </SelectTrigger>
                  <SelectContent>
                    {venues.map(venue => (
                      <SelectItem key={venue.id} value={venue.id}>
                        {venue.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome turno</Label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Es. Mattina"
                />
              </div>
              <div className="space-y-2">
                <Label>Codice</Label>
                <Input
                  value={formData.code}
                  onChange={e => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  placeholder="Es. M"
                  maxLength={5}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Colore</Label>
              <div className="flex gap-2">
                {COLORS.map(color => (
                  <button
                    key={color.value}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 ${formData.color === color.value ? 'border-foreground' : 'border-transparent'}`}
                    style={{ backgroundColor: color.value }}
                    onClick={() => setFormData(prev => ({ ...prev, color: color.value }))}
                    title={color.label}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ora inizio</Label>
                <Input
                  type="time"
                  value={formData.startTime}
                  onChange={e => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Ora fine</Label>
                <Input
                  type="time"
                  value={formData.endTime}
                  onChange={e => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Pausa (min)</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.breakMinutes}
                  onChange={e => setFormData(prev => ({ ...prev, breakMinutes: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Staff min</Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.minStaff}
                  onChange={e => setFormData(prev => ({ ...prev, minStaff: parseInt(e.target.value) || 1 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Staff max</Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.maxStaff}
                  onChange={e => setFormData(prev => ({ ...prev, maxStaff: e.target.value }))}
                  placeholder="Illimitato"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingShift ? 'Salva' : 'Crea'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
