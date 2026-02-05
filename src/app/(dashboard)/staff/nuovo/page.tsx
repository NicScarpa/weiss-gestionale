'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { UserPlus, ArrowLeft, Loader2, User, Briefcase, Euro } from 'lucide-react'
import Link from 'next/link'
import { AddressAutocomplete } from '@/components/ui/address-autocomplete'

interface Venue {
  id: string
  name: string
  code: string
}

interface Role {
  id: string
  name: string
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Lunedì', short: 'Lun' },
  { value: 1, label: 'Martedì', short: 'Mar' },
  { value: 2, label: 'Mercoledì', short: 'Mer' },
  { value: 3, label: 'Giovedì', short: 'Gio' },
  { value: 4, label: 'Venerdì', short: 'Ven' },
  { value: 5, label: 'Sabato', short: 'Sab' },
  { value: 6, label: 'Domenica', short: 'Dom' },
]

const EXTRA_ONLY_CONTRACTS = [
  'LAVORO_INTERMITTENTE',
  'LAVORATORE_OCCASIONALE',
  'LIBERO_PROFESSIONISTA',
] as const

export default function NuovoDipendentePage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  // Form state - Anagrafica
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [fiscalCode, setFiscalCode] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [address, setAddress] = useState('')

  // Form state - Assegnazione
  const [venueId, setVenueId] = useState('')
  const [roleId, setRoleId] = useState('')

  // Form state - Contratto
  const [contractType, setContractType] = useState('')
  const [isExtra, setIsExtra] = useState(false)
  const [defaultShift, setDefaultShift] = useState('')
  const [workDaysPerWeek, setWorkDaysPerWeek] = useState('')
  const [contractHoursWeek, setContractHoursWeek] = useState('')
  const [hireDate, setHireDate] = useState('')

  // Form state - Disponibilità Extra
  const [availableDays, setAvailableDays] = useState<number[]>([])
  const [availableHolidays, setAvailableHolidays] = useState(false)

  // Form state - Compensi
  const [hourlyRateBase, setHourlyRateBase] = useState('')
  const [hourlyRateExtra, setHourlyRateExtra] = useState('')
  const [hourlyRateHoliday, setHourlyRateHoliday] = useState('')
  const [hourlyRateNight, setHourlyRateNight] = useState('')

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

  // Toggle giorno disponibilità
  const toggleDay = (dayValue: number) => {
    setAvailableDays(prev =>
      prev.includes(dayValue)
        ? prev.filter(d => d !== dayValue)
        : [...prev, dayValue].sort((a, b) => a - b)
    )
  }

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

    // Validazione campi obbligatori
    const missingFields: string[] = []
    if (!firstName.trim()) missingFields.push('Nome')
    if (!lastName.trim()) missingFields.push('Cognome')
    if (!email.trim()) missingFields.push('Email')
    if (!venueId) missingFields.push('Sede')
    if (!roleId) missingFields.push('Ruolo')
    if (!contractType) missingFields.push('Tipo Contratto')
    if (!hireDate) missingFields.push('Data Assunzione')

    if (missingFields.length > 0) {
      toast.error(`Campi obbligatori mancanti: ${missingFields.join(', ')}`)
      return
    }

    // Validazione turno per staff extra
    if (isExtra && !defaultShift) {
      toast.error('Seleziona il turno predefinito per lo staff extra')
      return
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      toast.error('Email non valida')
      return
    }

    // Codice Fiscale validation (se inserito)
    if (fiscalCode && fiscalCode.length !== 16) {
      toast.error('Il codice fiscale deve essere di 16 caratteri')
      return
    }

    // Validazione extra: deve avere almeno un giorno disponibile
    if (isExtra && availableDays.length === 0) {
      toast.error('Seleziona almeno un giorno di disponibilità per lo staff extra')
      return
    }

    createMutation.mutate({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      phoneNumber: phoneNumber.trim() || null,
      fiscalCode: fiscalCode.trim().toUpperCase() || null,
      birthDate: birthDate || null,
      address: address.trim() || null,
      venueId,
      roleId,
      contractType,
      isFixedStaff: !isExtra,
      defaultShift: defaultShift || null,
      workDaysPerWeek: workDaysPerWeek ? parseInt(workDaysPerWeek) : null,
      contractHoursWeek: contractHoursWeek ? parseFloat(contractHoursWeek) : null,
      hireDate,
      availableDays: isExtra ? availableDays : [],
      availableHolidays: isExtra ? availableHolidays : false,
      hourlyRateBase: hourlyRateBase ? parseFloat(hourlyRateBase) : null,
      hourlyRateExtra: hourlyRateExtra ? parseFloat(hourlyRateExtra) : null,
      hourlyRateHoliday: hourlyRateHoliday ? parseFloat(hourlyRateHoliday) : null,
      hourlyRateNight: hourlyRateNight ? parseFloat(hourlyRateNight) : null,
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

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Sezione 1: Anagrafica */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Dati Anagrafici
            </CardTitle>
            <CardDescription>
              I campi contrassegnati con * sono obbligatori
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fiscalCode">Codice Fiscale</Label>
                <Input
                  id="fiscalCode"
                  value={fiscalCode}
                  onChange={(e) => setFiscalCode(e.target.value.toUpperCase())}
                  placeholder="RSSMRA85M01H501W"
                  maxLength={16}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="birthDate">Data di Nascita</Label>
                <Input
                  id="birthDate"
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Indirizzo</Label>
              <AddressAutocomplete
                value={address}
                onChange={setAddress}
                placeholder="Via Roma 1, 33077 Sacile PN"
              />
            </div>
          </CardContent>
        </Card>

        {/* Sezione 2: Contratto e Assegnazione */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Contratto e Assegnazione
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
                <Label htmlFor="role">Ruolo *</Label>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contractType">Tipo Contratto *</Label>
                <Select value={contractType} onValueChange={(value) => {
                  setContractType(value)
                  if (EXTRA_ONLY_CONTRACTS.includes(value as typeof EXTRA_ONLY_CONTRACTS[number])) {
                    setIsExtra(true)
                  }
                }}>
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
              <div className="space-y-2">
                <Label htmlFor="hireDate">Data Assunzione *</Label>
                <Input
                  id="hireDate"
                  type="date"
                  value={hireDate}
                  onChange={(e) => setHireDate(e.target.value)}
                />
              </div>
            </div>

            {/* Tipo Staff */}
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between">
                <Label htmlFor="isExtra" className="text-base font-medium">
                  Extra
                </Label>
                <Switch
                  id="isExtra"
                  checked={isExtra}
                  onCheckedChange={setIsExtra}
                  disabled={EXTRA_ONLY_CONTRACTS.includes(contractType as typeof EXTRA_ONLY_CONTRACTS[number])}
                />
              </div>

              {/* Opzioni per Staff Fisso */}
              {!isExtra && (
                <div className="space-y-4 pt-4 border-t">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="defaultShift">Turno Predefinito</Label>
                      <Select value={defaultShift} onValueChange={setDefaultShift}>
                        <SelectTrigger>
                          <SelectValue placeholder="Nessuno" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MORNING">Mattina</SelectItem>
                          <SelectItem value="EVENING">Sera</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="workDaysPerWeek">Giorni Lav./Settimana</Label>
                      <Select value={workDaysPerWeek} onValueChange={setWorkDaysPerWeek}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona" />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                            <SelectItem key={n} value={n.toString()}>
                              {n} {n === 1 ? 'giorno' : 'giorni'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Minimo giorni obbligatori
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contractHoursWeek">Ore/Settimana</Label>
                      <Input
                        id="contractHoursWeek"
                        type="number"
                        min="0"
                        max="60"
                        step="0.5"
                        value={contractHoursWeek}
                        onChange={(e) => setContractHoursWeek(e.target.value)}
                        placeholder="40"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Opzioni per Staff Extra */}
              {isExtra && (
                <div className="space-y-4 pt-4 border-t">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="defaultShiftExtra">Turno Assegnato</Label>
                      <Select value={defaultShift} onValueChange={setDefaultShift}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona turno" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MORNING">Mattina</SelectItem>
                          <SelectItem value="EVENING">Sera</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Turno per cui è stato assunto
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="workDaysPerWeekExtra">Max Giorni/Settimana</Label>
                      <Select value={workDaysPerWeek} onValueChange={setWorkDaysPerWeek}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona" />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                            <SelectItem key={n} value={n.toString()}>
                              {n} {n === 1 ? 'giorno' : 'giorni'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Massimo disponibilità
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Giorni Disponibilità *</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Seleziona i giorni in cui è disponibile a lavorare
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {DAYS_OF_WEEK.map((day) => (
                        <Button
                          key={day.value}
                          type="button"
                          variant={availableDays.includes(day.value) ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => toggleDay(day.value)}
                          className="min-w-[60px]"
                        >
                          {day.short}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="availableHolidays"
                      checked={availableHolidays}
                      onCheckedChange={(checked) => setAvailableHolidays(checked === true)}
                    />
                    <Label htmlFor="availableHolidays" className="text-sm font-normal">
                      Disponibile anche nei giorni festivi
                    </Label>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Sezione 3: Compensi */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Euro className="h-5 w-5" />
              Compensi
            </CardTitle>
            <CardDescription>
              Tariffe orarie del dipendente
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="hourlyRateBase">Tariffa Base</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                  <Input
                    id="hourlyRateBase"
                    type="number"
                    min="0"
                    step="0.01"
                    value={hourlyRateBase}
                    onChange={(e) => setHourlyRateBase(e.target.value)}
                    className="pl-7"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="hourlyRateExtra">Straordinario</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                  <Input
                    id="hourlyRateExtra"
                    type="number"
                    min="0"
                    step="0.01"
                    value={hourlyRateExtra}
                    onChange={(e) => setHourlyRateExtra(e.target.value)}
                    className="pl-7"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="hourlyRateHoliday">Festivo</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                  <Input
                    id="hourlyRateHoliday"
                    type="number"
                    min="0"
                    step="0.01"
                    value={hourlyRateHoliday}
                    onChange={(e) => setHourlyRateHoliday(e.target.value)}
                    className="pl-7"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="hourlyRateNight">Notturno</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                  <Input
                    id="hourlyRateNight"
                    type="number"
                    min="0"
                    step="0.01"
                    value={hourlyRateNight}
                    onChange={(e) => setHourlyRateNight(e.target.value)}
                    className="pl-7"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
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
    </div>
  )
}
