'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { CertificationsBox } from '../CertificationsBox'
import { Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type ContractType = 'TEMPO_DETERMINATO' | 'TEMPO_INDETERMINATO' | 'LAVORO_INTERMITTENTE' | 'LAVORATORE_OCCASIONALE' | 'LIBERO_PROFESSIONISTA' | null

interface ContractTabProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  employee: any
  isAdmin: boolean
  userId: string
  userRole: string
}

export function ContractTab({ employee, isAdmin, userId, userRole }: ContractTabProps) {
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState({
    contractType: employee.contractType as ContractType,
    isFixedStaff: employee.isFixedStaff,
    hireDate: employee.hireDate?.split('T')[0] || '',
    terminationDate: employee.terminationDate?.split('T')[0] || '',
    workDaysPerWeek: employee.workDaysPerWeek,
    contractHoursWeek: employee.contractHoursWeek !== null ? Number(employee.contractHoursWeek) : null,
    vatNumber: employee.vatNumber || '',
    defaultShift: employee.defaultShift,
    hourlyRate: employee.hourlyRate !== null ? Number(employee.hourlyRate) : null,
    hourlyRateBase: employee.hourlyRateBase !== null ? Number(employee.hourlyRateBase) : null,
    hourlyRateExtra: employee.hourlyRateExtra !== null ? Number(employee.hourlyRateExtra) : null,
    hourlyRateHoliday: employee.hourlyRateHoliday !== null ? Number(employee.hourlyRateHoliday) : null,
    hourlyRateNight: employee.hourlyRateNight !== null ? Number(employee.hourlyRateNight) : null,
  })

  const showDates = formData.contractType === 'TEMPO_DETERMINATO' ||
    formData.contractType === 'TEMPO_INDETERMINATO' ||
    formData.contractType === 'LAVORO_INTERMITTENTE'
  const showEndDate = formData.contractType === 'TEMPO_DETERMINATO' ||
    formData.contractType === 'LAVORO_INTERMITTENTE'
  const showVatNumber = formData.contractType === 'LIBERO_PROFESSIONISTA'

  const handleNumberChange = (field: keyof typeof formData, value: string) => {
    const numValue = value === '' ? null : parseFloat(value)
    setFormData(prev => ({ ...prev, [field]: numValue }))
  }

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch(`/api/staff/${employee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          hireDate: data.hireDate || null,
          terminationDate: data.terminationDate || null,
          vatNumber: data.vatNumber || null,
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
      toast.success('Dati contrattuali aggiornati')
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

      {/* Card Dati contrattuali */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dati contrattuali</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2 flex-1">
              <Label>Tipo contratto</Label>
              <Select
                value={formData.contractType || ''}
                onValueChange={v => setFormData(prev => ({
                  ...prev,
                  contractType: v as ContractType,
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
            <div className="flex items-center gap-3 rounded-lg bg-muted/60 border px-4 py-2 ml-4">
              <span className="text-base font-bold tracking-wide">EXTRA</span>
              <Switch
                checked={!formData.isFixedStaff}
                onCheckedChange={(checked) => isAdmin && setFormData(prev => ({ ...prev, isFixedStaff: !checked }))}
                disabled={!isAdmin}
              />
            </div>
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
                maxLength={11}
                value={formData.vatNumber}
                onChange={e => setFormData(prev => ({ ...prev, vatNumber: e.target.value.replace(/\D/g, '') }))}
                disabled={!isAdmin}
                placeholder="12345678901"
              />
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
        </CardContent>
      </Card>

      {/* Card Compensi */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compensi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Compenso orario base ({'\u20AC'})</Label>
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
              <Label>Compenso straordinario ({'\u20AC'})</Label>
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
              <Label>Compenso festivo ({'\u20AC'})</Label>
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
              <Label>Compenso notturno ({'\u20AC'})</Label>
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
        </CardContent>
      </Card>

      {/* Card Certificazioni */}
      <CertificationsBox
        userId={userId}
        contractType={employee.contractType}
        roleName={employee.role?.name}
        isReadOnly={userRole === 'staff'}
      />
    </form>
  )
}
