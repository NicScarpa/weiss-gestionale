'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { SkillsSelector } from '../SkillsSelector'
import { ConstraintEditor } from '../ConstraintEditor'
import { Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const WEEKDAYS = [
  { value: 0, label: 'LUN' },
  { value: 1, label: 'MAR' },
  { value: 2, label: 'MER' },
  { value: 3, label: 'GIO' },
  { value: 4, label: 'VEN' },
  { value: 5, label: 'SAB' },
  { value: 6, label: 'DOM' },
]

interface SettingsTabProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  employee: any
  isAdmin: boolean
  userId: string
  userRole: string
}

export function SettingsTab({ employee, isAdmin, userId, userRole }: SettingsTabProps) {
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState({
    notifyEmail: employee.notifyEmail,
    notifyPush: employee.notifyPush,
    notifyWhatsapp: employee.notifyWhatsapp,
    whatsappNumber: employee.whatsappNumber || '',
    portalEnabled: employee.portalEnabled,
    portalPin: employee.portalPin || '',
    skills: employee.skills || [],
    canWorkAlone: employee.canWorkAlone,
    canHandleCash: employee.canHandleCash,
    availableDays: employee.availableDays || [],
    availableHolidays: employee.availableHolidays || false,
  })

  const toggleAvailableDay = (day: number) => {
    setFormData(prev => ({
      ...prev,
      availableDays: prev.availableDays.includes(day)
        ? prev.availableDays.filter((d: number) => d !== day)
        : [...prev.availableDays, day].sort((a: number, b: number) => a - b)
    }))
  }

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch(`/api/staff/${employee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          whatsappNumber: data.whatsappNumber || null,
          portalPin: data.portalPin || null,
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
      toast.success('Impostazioni aggiornate')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex justify-end">
        <Button type="submit" disabled={updateMutation.isPending}>
          {updateMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Salva
        </Button>
      </div>

      {/* Card Notifiche */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notifiche</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Notifiche via email</Label>
            <Switch
              checked={formData.notifyEmail}
              onCheckedChange={v => setFormData(prev => ({ ...prev, notifyEmail: v }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Notifiche push</Label>
            <Switch
              checked={formData.notifyPush}
              onCheckedChange={v => setFormData(prev => ({ ...prev, notifyPush: v }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Notifiche WhatsApp</Label>
            <Switch
              checked={formData.notifyWhatsapp}
              onCheckedChange={v => setFormData(prev => ({ ...prev, notifyWhatsapp: v }))}
            />
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
        </CardContent>
      </Card>

      {/* Card Portale dipendente (solo admin) */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Portale dipendente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Accesso al portale</Label>
              <Switch
                checked={formData.portalEnabled}
                onCheckedChange={v => setFormData(prev => ({ ...prev, portalEnabled: v }))}
              />
            </div>
            {formData.portalEnabled && (
              <div className="space-y-2">
                <Label>PIN Portale (6 cifre)</Label>
                <Input
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
          </CardContent>
        </Card>
      )}

      {/* Card Competenze */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Competenze</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SkillsSelector
            value={formData.skills}
            onChange={skills => setFormData(prev => ({ ...prev, skills }))}
            disabled={!isAdmin}
          />
          <div className="flex items-center justify-between">
            <Label>Può lavorare da solo</Label>
            <Switch
              checked={formData.canWorkAlone}
              onCheckedChange={v => setFormData(prev => ({ ...prev, canWorkAlone: v }))}
              disabled={!isAdmin}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Può gestire la cassa</Label>
            <Switch
              checked={formData.canHandleCash}
              onCheckedChange={v => setFormData(prev => ({ ...prev, canHandleCash: v }))}
              disabled={!isAdmin}
            />
          </div>
        </CardContent>
      </Card>

      {/* Card Disponibilità */}
      {!employee.isFixedStaff && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Disponibilità</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map(day => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => isAdmin && toggleAvailableDay(day.value)}
                  disabled={!isAdmin}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    formData.availableDays.includes(day.value)
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
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  formData.availableHolidays
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
          </CardContent>
        </Card>
      )}

      {/* Card Vincoli */}
      {(userRole === 'admin' || userRole === 'manager') && (
        <ConstraintEditor
          userId={userId}
          userName={`${employee.firstName} ${employee.lastName}`}
        />
      )}
    </form>
  )
}
