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
import { Save, User, Briefcase, Euro, Bell, Shield, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface StaffMember {
  id: string
  firstName: string
  lastName: string
  email: string
  isFixedStaff: boolean
  hourlyRate: number | null
  defaultShift: 'MORNING' | 'EVENING' | null
  isActive: boolean
  contractType: 'FISSO' | 'EXTRA' | 'INTERMITTENTE' | null
  contractHoursWeek: number | null
  hireDate: string | null
  terminationDate: string | null
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

interface EmployeeProfileFormProps {
  employee: StaffMember
  isAdmin?: boolean
}

export function EmployeeProfileForm({ employee, isAdmin = false }: EmployeeProfileFormProps) {
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState({
    firstName: employee.firstName,
    lastName: employee.lastName,
    isFixedStaff: employee.isFixedStaff,
    hourlyRate: employee.hourlyRate,
    defaultShift: employee.defaultShift,
    isActive: employee.isActive,
    contractType: employee.contractType,
    contractHoursWeek: employee.contractHoursWeek,
    hireDate: employee.hireDate?.split('T')[0] || '',
    terminationDate: employee.terminationDate?.split('T')[0] || '',
    hourlyRateBase: employee.hourlyRateBase,
    hourlyRateExtra: employee.hourlyRateExtra,
    hourlyRateHoliday: employee.hourlyRateHoliday,
    hourlyRateNight: employee.hourlyRateNight,
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
    setFormData({
      firstName: employee.firstName,
      lastName: employee.lastName,
      isFixedStaff: employee.isFixedStaff,
      hourlyRate: employee.hourlyRate,
      defaultShift: employee.defaultShift,
      isActive: employee.isActive,
      contractType: employee.contractType,
      contractHoursWeek: employee.contractHoursWeek,
      hireDate: employee.hireDate?.split('T')[0] || '',
      terminationDate: employee.terminationDate?.split('T')[0] || '',
      hourlyRateBase: employee.hourlyRateBase,
      hourlyRateExtra: employee.hourlyRateExtra,
      hourlyRateHoliday: employee.hourlyRateHoliday,
      hourlyRateNight: employee.hourlyRateNight,
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
  }, [employee])

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch(`/api/staff/${employee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          hireDate: data.hireDate || null,
          terminationDate: data.terminationDate || null,
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
                <span className="hidden sm:inline">Tariffe</span>
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

              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={employee.email} disabled />
                <p className="text-xs text-muted-foreground">L&apos;email non può essere modificata</p>
              </div>

              {employee.venue && (
                <div className="space-y-2">
                  <Label>Sede</Label>
                  <Input value={`${employee.venue.name} (${employee.venue.code})`} disabled />
                </div>
              )}

              {employee.role && (
                <div className="space-y-2">
                  <Label>Ruolo</Label>
                  <Input value={employee.role.name} disabled />
                </div>
              )}

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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo contratto</Label>
                  <Select
                    value={formData.contractType || ''}
                    onValueChange={v => setFormData(prev => ({
                      ...prev,
                      contractType: v as 'FISSO' | 'EXTRA' | 'INTERMITTENTE' | null,
                    }))}
                    disabled={!isAdmin}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FISSO">Fisso</SelectItem>
                      <SelectItem value="EXTRA">Extra</SelectItem>
                      <SelectItem value="INTERMITTENTE">Intermittente</SelectItem>
                    </SelectContent>
                  </Select>
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
                <div className="space-y-2">
                  <Label>Data cessazione</Label>
                  <Input
                    type="date"
                    value={formData.terminationDate}
                    onChange={e => setFormData(prev => ({ ...prev, terminationDate: e.target.value }))}
                    disabled={!isAdmin}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.isFixedStaff}
                  onCheckedChange={v => setFormData(prev => ({ ...prev, isFixedStaff: v }))}
                  disabled={!isAdmin}
                />
                <Label>Staff fisso (vs extra)</Label>
              </div>

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
            </TabsContent>

            {/* Tab Tariffe */}
            <TabsContent value="rates" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tariffa oraria base (€)</Label>
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
                  <Label>Tariffa straordinario (€)</Label>
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
                  <Label>Tariffa festivo (€)</Label>
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
                  <Label>Tariffa notturno (€)</Label>
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
                <Label>Tariffa oraria legacy (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.hourlyRate ?? ''}
                  onChange={e => handleNumberChange('hourlyRate', e.target.value)}
                  disabled={!isAdmin}
                />
                <p className="text-xs text-muted-foreground">
                  Campo legacy, usare le tariffe specifiche sopra
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
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </form>
  )
}
