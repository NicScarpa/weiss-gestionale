'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { CalendarIcon, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface LeaveType {
  id: string
  code: string
  name: string
  color: string | null
  requiresApproval: boolean
}

const leaveRequestSchema = z.object({
  leaveTypeId: z.string().min(1, 'Seleziona un tipo di assenza'),
  startDate: z.date({ message: 'Data inizio obbligatoria' }),
  endDate: z.date({ message: 'Data fine obbligatoria' }),
  isPartialDay: z.boolean(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  notes: z.string().optional(),
}).refine((data) => data.endDate >= data.startDate, {
  message: 'La data fine deve essere successiva alla data inizio',
  path: ['endDate'],
}).refine((data) => {
  if (data.isPartialDay) {
    return data.startTime && data.endTime
  }
  return true
}, {
  message: 'Orari obbligatori per giornata parziale',
  path: ['startTime'],
})

type LeaveRequestFormData = {
  leaveTypeId: string
  startDate: Date
  endDate: Date
  isPartialDay: boolean
  startTime?: string
  endTime?: string
  notes?: string
}

async function fetchLeaveTypes(): Promise<LeaveType[]> {
  const res = await fetch('/api/leave-types')
  if (!res.ok) throw new Error('Errore nel caricamento tipi assenza')
  const data = await res.json()
  return data.data || []
}

async function createLeaveRequest(data: Record<string, unknown>) {
  const res = await fetch('/api/leave-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Errore nella creazione')
  }
  return res.json()
}

export function LeaveRequestForm() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isPartialDay, setIsPartialDay] = useState(false)

  const { data: leaveTypes, isLoading: loadingTypes } = useQuery({
    queryKey: ['leave-types'],
    queryFn: fetchLeaveTypes,
  })

  const mutation = useMutation({
    mutationFn: createLeaveRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-leave-requests'] })
      queryClient.invalidateQueries({ queryKey: ['portal-leave-balance'] })
      toast.success('Richiesta inviata con successo')
      router.push('/portale/ferie')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const form = useForm<LeaveRequestFormData>({
    resolver: zodResolver(leaveRequestSchema),
    defaultValues: {
      isPartialDay: false,
      notes: '',
    },
  })

  const onSubmit = (data: LeaveRequestFormData) => {
    mutation.mutate({
      leaveTypeId: data.leaveTypeId,
      startDate: format(data.startDate, 'yyyy-MM-dd'),
      endDate: format(data.endDate, 'yyyy-MM-dd'),
      isPartialDay: data.isPartialDay,
      startTime: data.startTime,
      endTime: data.endTime,
      notes: data.notes,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nuova Richiesta</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Tipo assenza */}
          <div className="space-y-2">
            <Label>Tipo di Assenza *</Label>
            <Select
              disabled={loadingTypes}
              onValueChange={(value) => form.setValue('leaveTypeId', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona tipo..." />
              </SelectTrigger>
              <SelectContent>
                {leaveTypes?.map((lt) => (
                  <SelectItem key={lt.id} value={lt.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: lt.color || '#6B7280' }}
                      />
                      {lt.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.leaveTypeId && (
              <p className="text-sm text-red-500">
                {form.formState.errors.leaveTypeId.message}
              </p>
            )}
          </div>

          {/* Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data Inizio *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !form.watch('startDate') && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.watch('startDate')
                      ? format(form.watch('startDate'), 'dd/MM/yyyy')
                      : 'Seleziona...'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.watch('startDate')}
                    onSelect={(date) => date && form.setValue('startDate', date)}
                    locale={it}
                    disabled={(date) => date < new Date()}
                  />
                </PopoverContent>
              </Popover>
              {form.formState.errors.startDate && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.startDate.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Data Fine *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !form.watch('endDate') && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.watch('endDate')
                      ? format(form.watch('endDate'), 'dd/MM/yyyy')
                      : 'Seleziona...'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.watch('endDate')}
                    onSelect={(date) => date && form.setValue('endDate', date)}
                    locale={it}
                    disabled={(date) =>
                      date < new Date() ||
                      (form.watch('startDate') && date < form.watch('startDate'))
                    }
                  />
                </PopoverContent>
              </Popover>
              {form.formState.errors.endDate && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.endDate.message}
                </p>
              )}
            </div>
          </div>

          {/* Giornata parziale */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label>Giornata parziale</Label>
              <p className="text-sm text-slate-500">
                Richiedi solo alcune ore del giorno
              </p>
            </div>
            <Switch
              checked={isPartialDay}
              onCheckedChange={(checked) => {
                setIsPartialDay(checked)
                form.setValue('isPartialDay', checked)
              }}
            />
          </div>

          {/* Orari (se giornata parziale) */}
          {isPartialDay && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ora Inizio *</Label>
                <Input
                  type="time"
                  {...form.register('startTime')}
                />
                {form.formState.errors.startTime && (
                  <p className="text-sm text-red-500">
                    {form.formState.errors.startTime.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Ora Fine *</Label>
                <Input
                  type="time"
                  {...form.register('endTime')}
                />
              </div>
            </div>
          )}

          {/* Note */}
          <div className="space-y-2">
            <Label>Note (opzionale)</Label>
            <Textarea
              placeholder="Aggiungi eventuali note..."
              {...form.register('notes')}
              rows={3}
            />
          </div>

          {/* Submit */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => router.back()}
            >
              Annulla
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={mutation.isPending}
            >
              {mutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Invia Richiesta
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
