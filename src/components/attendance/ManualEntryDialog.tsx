'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'

interface ManualEntryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preselectedUserId?: string
  date?: Date
}

interface User {
  id: string
  firstName: string
  lastName: string
  email: string
}

interface Venue {
  id: string
  name: string
  code: string
}

export function ManualEntryDialog({
  open,
  onOpenChange,
  preselectedUserId,
  date = new Date(),
}: ManualEntryDialogProps) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    userId: preselectedUserId || '',
    venueId: '',
    punchType: 'IN' as 'IN' | 'OUT' | 'BREAK_START' | 'BREAK_END',
    punchedAt: format(date, "yyyy-MM-dd'T'HH:mm"),
    reason: '',
    notes: '',
  })

  // Fetch users
  const { data: users, isLoading: loadingUsers } = useQuery<User[]>({
    queryKey: ['staff-list'],
    queryFn: async () => {
      const response = await fetch('/api/staff')
      if (!response.ok) throw new Error('Errore caricamento dipendenti')
      const data = await response.json()
      return data.data || []
    },
    enabled: open,
  })

  // Fetch venues
  const { data: venues, isLoading: loadingVenues } = useQuery<Venue[]>({
    queryKey: ['venues-list'],
    queryFn: async () => {
      const response = await fetch('/api/venues')
      if (!response.ok) throw new Error('Errore caricamento sedi')
      const data = await response.json()
      return data.venues || []
    },
    enabled: open,
  })

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetch('/api/attendance/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Errore inserimento')
      }
      return response.json()
    },
    onSuccess: () => {
      toast.success('Timbratura inserita con successo')
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      onOpenChange(false)
      setFormData({
        userId: '',
        venueId: '',
        punchType: 'IN',
        punchedAt: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        reason: '',
        notes: '',
      })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.userId || !formData.venueId || !formData.reason) {
      toast.error('Compila tutti i campi obbligatori')
      return
    }
    submitMutation.mutate(formData)
  }

  const punchTypes = [
    { value: 'IN', label: 'Entrata' },
    { value: 'OUT', label: 'Uscita' },
    { value: 'BREAK_START', label: 'Inizio Pausa' },
    { value: 'BREAK_END', label: 'Fine Pausa' },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Inserimento Manuale Timbratura</DialogTitle>
            <DialogDescription>
              Inserisci una timbratura manuale per un dipendente. Richiede una motivazione.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Dipendente */}
            <div className="grid gap-2">
              <Label htmlFor="userId">Dipendente *</Label>
              <Select
                value={formData.userId}
                onValueChange={(value) => setFormData({ ...formData, userId: value })}
                disabled={loadingUsers}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona dipendente" />
                </SelectTrigger>
                <SelectContent>
                  {Array.isArray(users) ? users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.firstName} {user.lastName}
                    </SelectItem>
                  )) : (
                    <SelectItem value="" disabled>Nessun dipendente disponibile</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Sede */}
            <div className="grid gap-2">
              <Label htmlFor="venueId">Sede *</Label>
              <Select
                value={formData.venueId}
                onValueChange={(value) => setFormData({ ...formData, venueId: value })}
                disabled={loadingVenues}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona sede" />
                </SelectTrigger>
                <SelectContent>
                  {Array.isArray(venues) ? venues.map((venue) => (
                    <SelectItem key={venue.id} value={venue.id}>
                      {venue.name}
                    </SelectItem>
                  )) : (
                    <SelectItem value="" disabled>Nessuna sede disponibile</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Tipo Timbratura */}
            <div className="grid gap-2">
              <Label htmlFor="punchType">Tipo Timbratura *</Label>
              <Select
                value={formData.punchType}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    punchType: value as typeof formData.punchType,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {punchTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Data/Ora */}
            <div className="grid gap-2">
              <Label htmlFor="punchedAt">Data e Ora *</Label>
              <Input
                type="datetime-local"
                id="punchedAt"
                value={formData.punchedAt}
                onChange={(e) => setFormData({ ...formData, punchedAt: e.target.value })}
              />
            </div>

            {/* Motivazione */}
            <div className="grid gap-2">
              <Label htmlFor="reason">Motivazione *</Label>
              <Input
                id="reason"
                placeholder="Es: Dimenticata timbratura"
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              />
            </div>

            {/* Note */}
            <div className="grid gap-2">
              <Label htmlFor="notes">Note (opzionale)</Label>
              <Textarea
                id="notes"
                placeholder="Note aggiuntive..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={submitMutation.isPending}>
              {submitMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Inserisci
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
