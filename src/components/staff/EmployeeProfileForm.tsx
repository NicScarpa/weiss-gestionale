'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SkillsSelector } from './SkillsSelector'
import { CertificationsBox } from './CertificationsBox'
import { ConstraintEditor } from './ConstraintEditor'
import { AddressAutocomplete } from '@/components/ui/address-autocomplete'
import { Badge } from '@/components/ui/badge'
import { Save, User, Briefcase, Euro, Bell, Shield, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type ContractType = 'TEMPO_DETERMINATO' | 'TEMPO_INDETERMINATO' | 'LAVORO_INTERMITTENTE' | 'LAVORATORE_OCCASIONALE' | 'LIBERO_PROFESSIONISTA' | null

interface StaffMember {
  id: string
  firstName: string
  lastName: string
  email: string
  phoneNumber: string | null
  isFixedStaff: boolean
  hourlyRate: number | null
  defaultShift: 'MORNING' | 'EVENING' | null
  isActive: boolean
  contractType: ContractType
  contractHoursWeek: number | null
  workDaysPerWeek: number | null
  hireDate: string | null
  terminationDate: string | null
  vatNumber: string | null
  fiscalCode: string | null
  birthDate: string | null
  address: string | null
  availableDays: number[]
  availableHolidays: boolean
  hourlyRateBase: number | null
  hourlyRateExtra: number | null
  hourlyRateHoliday: number | null
  hourlyRateNight: number | null
  portalEnabled: boolean
  portalPin: string | null
  notifyEmail: boolean
  notifyPush: boolean
  notifyWhatsapp: boolean
  whatsappNumber: string | null
  skills: string[]
  canWorkAlone: boolean
  canHandleCash: boolean
  venue?: {
    id: string
    name: string
    code: string
  }
  role?: {
    id: string
    name: string
  }
}

interface Venue {
  id: string
  name: string
  code: string
}

interface Role {
  id: string
  name: string
}

interface EmployeeProfileFormProps {
  employee: StaffMember
  isAdmin?: boolean
  venues?: Venue[]
  roles?: Role[]
  userId: string
  userRole: string
}

// Costanti per i giorni della settimana
const WEEKDAYS = [
  { value: 0, label: 'LUN' },
  { value: 1, label: 'MAR' },
  { value: 2, label: 'MER' },
  { value: 3, label: 'GIO' },
  { value: 4, label: 'VEN' },
  { value: 5, label: 'SAB' },
  { value: 6, label: 'DOM' },
]

export function EmployeeProfileForm({ employee, isAdmin = false, venues = [], roles = [], userId, userRole }: EmployeeProfileFormProps) {
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState({
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    phoneNumber: employee.phoneNumber || '',
    venueId: employee.venue?.id || '',
    roleId: employee.role?.id || '',
    isFixedStaff: employee.isFixedStaff,
    hourlyRate: employee.hourlyRate !== null ? Number(employee.hourlyRate) : null,
    defaultShift: employee.defaultShift,
    isActive: employee.isActive,
    contractType: employee.contractType,
    contractHoursWeek: employee.contractHoursWeek !== null ? Number(employee.contractHoursWeek) : null,
    workDaysPerWeek: employee.workDaysPerWeek,
    hireDate: employee.hireDate?.split('T')[0] || '',
    terminationDate: employee.terminationDate?.split('T')[0] || '',
    vatNumber: employee.vatNumber || '',
    fiscalCode: employee.fiscalCode || '',
    birthDate: employee.birthDate?.split('T')[0] || '',
    address: employee.address || '',
    availableDays: employee.availableDays || [],
    availableHolidays: employee.availableHolidays || false,
    hourlyRateBase: employee.hourlyRateBase !== null ? Number(employee.hourlyRateBase) : null,
    hourlyRateExtra: employee.hourlyRateExtra !== null ? Number(employee.hourlyRateExtra) : null,
    hourlyRateHoliday: employee.hourlyRateHoliday !== null ? Number(employee.hourlyRateHoliday) : null,
    hourlyRateNight: employee.hourlyRateNight !== null ? Number(employee.hourlyRateNight) : null,
    portalEnabled: employee.portalEnabled,
    portalPin: employee.portalPin || '',
    notifyEmail: employee.notifyEmail,
    notifyPush: employee.notifyPush,
    notifyWhatsapp: employee.notifyWhatsapp,
    whatsappNumber: employee.whatsappNumber || '',
    skills: employee.skills || [],
    canWorkAlone: employee.canWorkAlone,
    canHandleCash: employee.canHandleCash,
  })

  // Update form data when employee changes
  useEffect(() => {
    queueMicrotask(() => {
      setFormData({
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        phoneNumber: employee.phoneNumber || '',
        venueId: employee.venue?.id || '',
        roleId: employee.role?.id || '',
        isFixedStaff: employee.isFixedStaff,
        hourlyRate: employee.hourlyRate !== null ? Number(employee.hourlyRate) : null,
        defaultShift: employee.defaultShift,
        isActive: employee.isActive,
        contractType: employee.contractType,
        contractHoursWeek: employee.contractHoursWeek !== null ? Number(employee.contractHoursWeek) : null,
        workDaysPerWeek: employee.workDaysPerWeek,
        hireDate: employee.hireDate?.split('T')[0] || '',
        terminationDate: employee.terminationDate?.split('T')[0] || '',
        vatNumber: employee.vatNumber || '',
        fiscalCode: employee.fiscalCode || '',
        birthDate: employee.birthDate?.split('T')[0] || '',
        address: employee.address || '',
        availableDays: employee.availableDays || [],
        availableHolidays: employee.availableHolidays || false,
        hourlyRateBase: employee.hourlyRateBase !== null ? Number(employee.hourlyRateBase) : null,
        hourlyRateExtra: employee.hourlyRateExtra !== null ? Number(employee.hourlyRateExtra) : null,
        hourlyRateHoliday: employee.hourlyRateHoliday !== null ? Number(employee.hourlyRateHoliday) : null,
        hourlyRateNight: employee.hourlyRateNight !== null ? Number(employee.hourlyRateNight) : null,
        portalEnabled: employee.portalEnabled,
        portalPin: employee.portalPin || '',
        notifyEmail: employee.notifyEmail,
        notifyPush: employee.notifyPush,
        notifyWhatsapp: employee.notifyWhatsapp,
        whatsappNumber: employee.whatsappNumber || '',
        skills: employee.skills || [],
        canWorkAlone: employee.canWorkAlone,
        canHandleCash: employee.canHandleCash,
      })
    })
  }, [employee])

  // Determina se mostrare campi date in base al tipo contratto
  const showDates = formData.contractType === 'TEMPO_DETERMINATO' ||
    formData.contractType === 'TEMPO_INDETERMINATO' ||
    formData.contractType === 'LAVORO_INTERMITTENTE'

  const showEndDate = formData.contractType === 'TEMPO_DETERMINATO' ||
    formData.contractType === 'LAVORO_INTERMITTENTE'

  // Determina se mostrare P.IVA (solo per Libero Professionista)
  const showVatNumber = formData.contractType === 'LIBERO_PROFESSIONISTA'

  // Helper per toggle disponibilità giorni
  const toggleAvailableDay = (day: number) => {
    setFormData(prev => ({
      ...prev,
      availableDays: prev.availableDays.includes(day)
        ? prev.availableDays.filter(d => d !== day)
        : [...prev.availableDays, day].sort((a, b) => a - b)
    }))
  }

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch(`/api/staff/${employee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          phoneNumber: data.phoneNumber || null,
          venueId: data.venueId || null,
          roleId: data.roleId || undefined,
          hireDate: data.hireDate || null,
          terminationDate: data.terminationDate || null,
          vatNumber: data.vatNumber || null,
          fiscalCode: data.fiscalCode || null,
          birthDate: data.birthDate || null,
          address: data.address || null,
          portalPin: data.portalPin || null,
          whatsappNumber: data.whatsappNumber || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nel salvataggio')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', employee.id] })
      queryClient.invalidateQueries({ queryKey: ['staff-list'] })
      toast.success('Profilo aggiornato con successo')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate(formData)
  }

  const handleNumberChange = (field: keyof typeof formData, value: string) => {
    const numValue = value === '' ? null : parseFloat(value)
    setFormData(prev => ({ ...prev, [field]: numValue }))
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Profilo Dipendente</CardTitle>
            <CardDescription>
              Gestisci le informazioni del dipendente
            </CardDescription>
          </div>
          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salva
          </Button>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="info" className="space-y-4">
            <TabsList className="grid grid-cols-5 w-full">
              <TabsTrigger value="info" className="flex items-center gap-1">
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">Info</span>
              </TabsTrigger>
              <TabsTrigger value="contract" className="flex items-center gap-1">
                <Briefcase className="h-4 w-4" />
                <span className="hidden sm:inline">Contratto</span>
              </TabsTrigger>
              <TabsTrigger value="rates" className="flex items-center gap-1">
                <Euro className="h-4 w-4" />
                <span className="hidden sm:inline">Compensi</span>
              </TabsTrigger>
              <TabsTrigger value="notify" className="flex items-center gap-1">
                <Bell className="h-4 w-4" />
                <span className="hidden sm:inline">Notifiche</span>
              </TabsTrigger>
              <TabsTrigger value="skills" className="flex items-center gap-1">
                <Shield className="h-4 w-4" />
                <span className="hidden sm:inline">Skills</span>
              </TabsTrigger>
            </TabsList>

            {/* Tab Informazioni Base */}
            <TabsContent value="info" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={formData.firstName}
                    onChange={e => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                    disabled={!isAdmin}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cognome</Label>
                  <Input
                    value={formData.lastName}
                    onChange={e => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                    disabled={!isAdmin}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    disabled={!isAdmin}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefono</Label>
                  <Input
                    type="tel"
                    value={formData.phoneNumber}
                    onChange={e => setFormData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                    placeholder="+39 123 456 7890"
                    disabled={!isAdmin}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Codice Fiscale</Label>
                  <Input
                    type="text"
                    maxLength={16}
                    value={formData.fiscalCode}
                    onChange={e => setFormData(prev => ({ ...prev, fiscalCode: e.target.value.toUpperCase() }))}
                    disabled={!isAdmin}
                    placeholder="RSSMRA85M01H501A"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data di nascita</Label>
                  <Input
                    type="date"
                    value={formData.birthDate}
                    onChange={e => setFormData(prev => ({ ...prev, birthDate: e.target.value }))}
                    disabled={!isAdmin}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Indirizzo di residenza</Label>
                <AddressAutocomplete
                  value={formData.address}
                  onChange={val => setFormData(prev => ({ ...prev, address: val }))}
                  disabled={!isAdmin}
                  placeholder="Via Roma 1, 33077 Sacile (PN)"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Sede</Label>
                  <Select
                    value={formData.venueId}
                    onValueChange={v => setFormData(prev => ({ ...prev, venueId: v }))}
                    disabled={!isAdmin}
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
                  <Label>Ruolo</Label>
                  <Select
                    value={formData.roleId}
                    onValueChange={v => setFormData(prev => ({ ...prev, roleId: v }))}
                    disabled={!isAdmin}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona ruolo" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map(role => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name.charAt(0).toUpperCase() + role.name.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.isActive}
                  onCheckedChange={v => setFormData(prev => ({ ...prev, isActive: v }))}
                  disabled={!isAdmin}
                />
                <Label>Dipendente attivo</Label>
              </div>
            </TabsContent>

            {/* Tab Contratto */}
            <TabsContent value="contract" className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Tipo contratto</Label>
                  <div className="flex items-center gap-3 rounded-lg bg-muted/60 border px-4 py-2">
                    <span className="text-base font-bold tracking-wide">EXTRA</span>
                    <Switch
                      checked={!formData.isFixedStaff}
                      onCheckedChange={(checked) => isAdmin && setFormData(prev => ({ ...prev, isFixedStaff: !checked }))}
                      disabled={!isAdmin}
                    />
                  </div>
                </div>
                <Select
                  value={formData.contractType || ''}
                  onValueChange={v => setFormData(prev => ({
                    ...prev,
                    contractType: v as ContractType,
                    // Reset date fields when contract type changes
                    hireDate: ['LAVORATORE_OCCASIONALE', 'LIBERO_PROFESSIONISTA'].includes(v) ? '' : prev.hireDate,
                    terminationDate: ['LAVORATORE_OCCASIONALE', 'LIBERO_PROFESSIONISTA', 'TEMPO_INDETERMINATO'].includes(v) ? '' : prev.terminationDate,
                  }))}
                  disabled={!isAdmin}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona tipo contratto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TEMPO_DETERMINATO">Tempo Determinato</SelectItem>
                    <SelectItem value="TEMPO_INDETERMINATO">Tempo Indeterminato</SelectItem>
                    <SelectItem value="LAVORO_INTERMITTENTE">Lavoro Intermittente</SelectItem>
                    <SelectItem value="LAVORATORE_OCCASIONALE">Lavoratore Occasionale</SelectItem>
                    <SelectItem value="LIBERO_PROFESSIONISTA">Libero Professionista</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {showDates && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data assunzione</Label>
                    <Input
                      type="date"
                      value={formData.hireDate}
                      onChange={e => setFormData(prev => ({ ...prev, hireDate: e.target.value }))}
                      disabled={!isAdmin}
                    />
                  </div>
                  {showEndDate && (
                    <div className="space-y-2">
                      <Label>Data cessazione</Label>
                      <Input
                        type="date"
                        value={formData.terminationDate}
                        onChange={e => setFormData(prev => ({ ...prev, terminationDate: e.target.value }))}
                        disabled={!isAdmin}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Giorni lavorativi / settimana</Label>
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    max="7"
                    value={formData.workDaysPerWeek ?? ''}
                    onChange={e => handleNumberChange('workDaysPerWeek', e.target.value)}
                    disabled={!isAdmin}
                    placeholder="1-7"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ore settimanali</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    max="60"
                    value={formData.contractHoursWeek ?? ''}
                    onChange={e => handleNumberChange('contractHoursWeek', e.target.value)}
                    disabled={!isAdmin}
                  />
                </div>
              </div>

              {showVatNumber && (
                <div className="space-y-2">
                  <Label>P.IVA</Label>
                  <Input
                    type="text"
                    maxLength={11}
                    value={formData.vatNumber}
                    onChange={e => setFormData(prev => ({ ...prev, vatNumber: e.target.value.replace(/\D/g, '') }))}
                    disabled={!isAdmin}
                    placeholder="12345678901"
                  />
                  <p className="text-xs text-muted-foreground">11 cifre</p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Turno predefinito</Label>
                <Select
                  value={formData.defaultShift || ''}
                  onValueChange={v => setFormData(prev => ({
                    ...prev,
                    defaultShift: v as 'MORNING' | 'EVENING' | null || null,
                  }))}
                  disabled={!isAdmin}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Nessuno" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MORNING">Mattina</SelectItem>
                    <SelectItem value="EVENING">Sera</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Disponibilità per EXTRA */}
              {!formData.isFixedStaff && (
                <div className="space-y-3 p-3 border rounded-lg">
                  <Label className="font-medium">Disponibilità settimanale</Label>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map(day => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => isAdmin && toggleAvailableDay(day.value)}
                        disabled={!isAdmin}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${formData.availableDays.includes(day.value)
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted hover:bg-muted/80'
                          } ${!isAdmin ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                      >
                        {day.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => isAdmin && setFormData(prev => ({ ...prev, availableHolidays: !prev.availableHolidays }))}
                      disabled={!isAdmin}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${formData.availableHolidays
                        ? 'bg-orange-500 text-white'
                        : 'bg-muted hover:bg-muted/80'
                        } ${!isAdmin ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                    >
                      FESTIVI
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Seleziona i giorni in cui il lavoratore è disponibile
                  </p>
                </div>
              )}

              {/* Vincoli individuali (solo admin/manager) */}
              {(userRole === 'admin' || userRole === 'manager') && (
                <ConstraintEditor
                  userId={userId}
                  userName={`${employee.firstName} ${employee.lastName}`}
                />
              )}
            </TabsContent>

            {/* Tab Compensi (ex Tariffe) */}
            <TabsContent value="rates" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Compenso orario base (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.hourlyRateBase ?? ''}
                    onChange={e => handleNumberChange('hourlyRateBase', e.target.value)}
                    disabled={!isAdmin}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Compenso straordinario (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.hourlyRateExtra ?? ''}
                    onChange={e => handleNumberChange('hourlyRateExtra', e.target.value)}
                    disabled={!isAdmin}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Compenso festivo (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.hourlyRateHoliday ?? ''}
                    onChange={e => handleNumberChange('hourlyRateHoliday', e.target.value)}
                    disabled={!isAdmin}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Compenso notturno (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.hourlyRateNight ?? ''}
                    onChange={e => handleNumberChange('hourlyRateNight', e.target.value)}
                    disabled={!isAdmin}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Compenso orario legacy (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.hourlyRate ?? ''}
                  onChange={e => handleNumberChange('hourlyRate', e.target.value)}
                  disabled={!isAdmin}
                />
                <p className="text-xs text-muted-foreground">
                  Campo legacy, usare i compensi specifici sopra
                </p>
              </div>
            </TabsContent>

            {/* Tab Notifiche */}
            <TabsContent value="notify" className="space-y-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.notifyEmail}
                  onCheckedChange={v => setFormData(prev => ({ ...prev, notifyEmail: v }))}
                />
                <Label>Notifiche via email</Label>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.notifyPush}
                  onCheckedChange={v => setFormData(prev => ({ ...prev, notifyPush: v }))}
                />
                <Label>Notifiche push</Label>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.notifyWhatsapp}
                  onCheckedChange={v => setFormData(prev => ({ ...prev, notifyWhatsapp: v }))}
                />
                <Label>Notifiche WhatsApp</Label>
              </div>

              {formData.notifyWhatsapp && (
                <div className="space-y-2">
                  <Label>Numero WhatsApp</Label>
                  <Input
                    type="tel"
                    value={formData.whatsappNumber}
                    onChange={e => setFormData(prev => ({ ...prev, whatsappNumber: e.target.value }))}
                    placeholder="+39 123 456 7890"
                  />
                </div>
              )}

              {isAdmin && (
                <>
                  <hr className="my-4" />
                  <h4 className="font-medium">Accesso Portale</h4>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.portalEnabled}
                      onCheckedChange={v => setFormData(prev => ({ ...prev, portalEnabled: v }))}
                    />
                    <Label>Accesso al portale dipendente</Label>
                  </div>

                  {formData.portalEnabled && (
                    <div className="space-y-2">
                      <Label>PIN Portale (6 cifre)</Label>
                      <Input
                        type="text"
                        maxLength={6}
                        value={formData.portalPin}
                        onChange={e => setFormData(prev => ({
                          ...prev,
                          portalPin: e.target.value.replace(/\D/g, '').slice(0, 6),
                        }))}
                        placeholder="123456"
                      />
                      <p className="text-xs text-muted-foreground">
                        PIN opzionale per accesso rapido
                      </p>
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            {/* Tab Skills */}
            <TabsContent value="skills" className="space-y-4">
              <div className="space-y-2">
                <Label>Competenze</Label>
                <SkillsSelector
                  value={formData.skills}
                  onChange={skills => setFormData(prev => ({ ...prev, skills }))}
                  disabled={!isAdmin}
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.canWorkAlone}
                  onCheckedChange={v => setFormData(prev => ({ ...prev, canWorkAlone: v }))}
                  disabled={!isAdmin}
                />
                <Label>Può lavorare da solo</Label>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.canHandleCash}
                  onCheckedChange={v => setFormData(prev => ({ ...prev, canHandleCash: v }))}
                  disabled={!isAdmin}
                />
                <Label>Può gestire la cassa</Label>
              </div>

              {/* Certificazioni */}
              <CertificationsBox
                userId={userId}
                contractType={employee.contractType}
                roleName={employee.role?.name}
                isReadOnly={userRole === 'staff'}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </form>
  )
}
