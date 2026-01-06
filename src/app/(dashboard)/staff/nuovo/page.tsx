'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { UserPlus, ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'

interface Venue {
  id: string
  name: string
  code: string
}

interface Role {
  id: string
  name: string
}

export default function NuovoDipendentePage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  // Form state
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [venueId, setVenueId] = useState('')
  const [roleId, setRoleId] = useState('')
  const [contractType, setContractType] = useState('')
  const [isExtra, setIsExtra] = useState(false)
  const [defaultShift, setDefaultShift] = useState('')

  // Fetch venues
  const { data: venuesData } = useQuery({
    queryKey: ['venues'],
    queryFn: async () => {
      const res = await fetch('/api/venues')
      if (!res.ok) throw new Error('Errore nel caricamento sedi')
      return res.json()
    },
  })

  // Fetch roles
  const { data: rolesData } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await fetch('/api/roles')
      if (!res.ok) throw new Error('Errore nel caricamento ruoli')
      return res.json()
    },
  })

  const venues: Venue[] = venuesData?.venues || []
  const roles: Role[] = rolesData?.roles || []

  // Mutation per creazione
  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Errore nella creazione')
      }
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['staff-list'] })
      toast.success('Dipendente creato con successo')
      router.push(`/staff/${data.id}`)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Validazione base
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !venueId) {
      toast.error('Compila tutti i campi obbligatori')
      return
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      toast.error('Email non valida')
      return
    }

    createMutation.mutate({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      phoneNumber: phoneNumber.trim() || null,
      venueId,
      roleId: roleId || undefined,
      contractType: contractType || null,
      isFixedStaff: !isExtra, // isExtra ON = staff extra (isFixedStaff = false)
      defaultShift: !isExtra && defaultShift ? defaultShift : null,
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/staff">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserPlus className="h-6 w-6" />
            Nuovo Dipendente
          </h1>
          <p className="text-muted-foreground">
            Inserisci i dati del nuovo dipendente
          </p>
        </div>
      </div>

      {/* Form */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Dati Dipendente</CardTitle>
          <CardDescription>
            I campi contrassegnati con * sono obbligatori
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Anagrafica */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">Nome *</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Mario"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Cognome *</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Rossi"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="mario.rossi@email.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Telefono</Label>
                <Input
                  id="phoneNumber"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+39 333 1234567"
                />
              </div>
            </div>

            {/* Assegnazione */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="venue">Sede *</Label>
                <Select value={venueId} onValueChange={setVenueId} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona sede" />
                  </SelectTrigger>
                  <SelectContent>
                    {venues.map((venue) => (
                      <SelectItem key={venue.id} value={venue.id}>
                        {venue.name} ({venue.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Ruolo</Label>
                <Select value={roleId} onValueChange={setRoleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Staff (default)" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles
                      .filter((r) => r.name !== 'admin')
                      .map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name.charAt(0).toUpperCase() + role.name.slice(1)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Contratto */}
            <div className="space-y-2">
              <Label htmlFor="contractType">Tipo Contratto</Label>
              <Select value={contractType} onValueChange={setContractType}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona tipo contratto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEMPO_INDETERMINATO">Tempo Indeterminato</SelectItem>
                  <SelectItem value="TEMPO_DETERMINATO">Tempo Determinato</SelectItem>
                  <SelectItem value="LAVORO_INTERMITTENTE">Lavoro Intermittente</SelectItem>
                  <SelectItem value="LAVORATORE_OCCASIONALE">Lavoratore Occasionale</SelectItem>
                  <SelectItem value="LIBERO_PROFESSIONISTA">Libero Professionista</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tipo Staff */}
            <div className="space-y-4 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="isExtra" className="text-base font-medium">
                    Extra / Collaboratore
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Attiva se il dipendente è uno staff extra chiamato a necessità
                  </p>
                </div>
                <Switch
                  id="isExtra"
                  checked={isExtra}
                  onCheckedChange={setIsExtra}
                />
              </div>

              {/* Turno default (solo per staff fisso) */}
              {!isExtra && (
                <div className="space-y-2 pt-2 border-t">
                  <Label htmlFor="defaultShift">Turno Predefinito</Label>
                  <Select value={defaultShift} onValueChange={setDefaultShift}>
                    <SelectTrigger>
                      <SelectValue placeholder="Nessun turno predefinito" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MORNING">Mattina</SelectItem>
                      <SelectItem value="EVENING">Sera</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <Link href="/staff">
                <Button type="button" variant="outline">
                  Annulla
                </Button>
              </Link>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Crea Dipendente
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
