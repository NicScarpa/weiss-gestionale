'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation } from '@tanstack/react-query'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { ArrowLeft, Calendar, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { format, addDays, startOfWeek, endOfWeek } from 'date-fns'

interface Venue {
  id: string
  name: string
  code: string
}

export default function NuovoPianificazionePage() {
  const router = useRouter()

  // Default to current week
  const today = new Date()
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 })

  const [formData, setFormData] = useState({
    venueId: '',
    name: '',
    startDate: format(weekStart, 'yyyy-MM-dd'),
    endDate: format(weekEnd, 'yyyy-MM-dd'),
    notes: '',
  })

  const { data: venuesData } = useQuery({
    queryKey: ['venues'],
    queryFn: async () => {
      const res = await fetch('/api/venues')
      if (!res.ok) throw new Error('Errore nel caricamento sedi')
      return res.json()
    },
  })

  const venues: Venue[] = venuesData?.venues || []

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nella creazione')
      }
      return res.json()
    },
    onSuccess: (data) => {
      toast.success('Pianificazione creata con successo')
      router.push(`/turni/${data.id}`)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.venueId) {
      toast.error('Seleziona una sede')
      return
    }

    if (!formData.startDate || !formData.endDate) {
      toast.error('Seleziona le date')
      return
    }

    createMutation.mutate(formData)
  }

  const setQuickPeriod = (type: 'this-week' | 'next-week' | 'this-month') => {
    let start: Date
    let end: Date

    switch (type) {
      case 'this-week':
        start = startOfWeek(today, { weekStartsOn: 1 })
        end = endOfWeek(today, { weekStartsOn: 1 })
        break
      case 'next-week':
        start = startOfWeek(addDays(today, 7), { weekStartsOn: 1 })
        end = endOfWeek(addDays(today, 7), { weekStartsOn: 1 })
        break
      case 'this-month':
        start = new Date(today.getFullYear(), today.getMonth(), 1)
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
        break
    }

    setFormData(prev => ({
      ...prev,
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(end, 'yyyy-MM-dd'),
    }))
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/turni">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            Nuova Pianificazione
          </h1>
          <p className="text-muted-foreground">
            Crea una nuova pianificazione turni
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Dettagli Pianificazione</CardTitle>
            <CardDescription>
              Configura il periodo e la sede per la nuova pianificazione
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Sede *</Label>
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
                      {venue.name} ({venue.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Nome (opzionale)</Label>
              <Input
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Es. Settimana 1-7 Gennaio"
              />
              <p className="text-xs text-muted-foreground">
                Se lasciato vuoto verrà generato automaticamente
              </p>
            </div>

            <div className="space-y-2">
              <Label>Periodo rapido</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setQuickPeriod('this-week')}
                >
                  Questa settimana
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setQuickPeriod('next-week')}
                >
                  Prossima settimana
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setQuickPeriod('this-month')}
                >
                  Questo mese
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data inizio *</Label>
                <Input
                  type="date"
                  value={formData.startDate}
                  onChange={e => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Data fine *</Label>
                <Input
                  type="date"
                  value={formData.endDate}
                  onChange={e => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea
                value={formData.notes}
                onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Note aggiuntive..."
                rows={3}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Link href="/turni" className="flex-1">
                <Button type="button" variant="outline" className="w-full">
                  Annulla
                </Button>
              </Link>
              <Button
                type="submit"
                className="flex-1"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creazione...
                  </>
                ) : (
                  'Crea Pianificazione'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
