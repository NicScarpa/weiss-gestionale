'use client'

import { use, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ShiftCalendar } from '@/components/shifts/ShiftCalendar'
import { GenerationParamsForm } from '@/components/shifts/GenerationParamsForm'
import { ScheduleWarnings } from '@/components/shifts/ScheduleWarnings'
import { AssignmentDialog } from '@/components/shifts/AssignmentDialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ArrowLeft,
  Calendar,
  Wand2,
  Send,
  Users,
  Clock,
  Euro,
  RefreshCw,
  FileDown,
  FileSpreadsheet,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

interface PageProps {
  params: Promise<{ id: string }>
}

interface Assignment {
  id: string
  userId: string
  shiftDefinitionId: string | null
  date: string
  startTime: string
  endTime: string
  breakMinutes: number
  notes: string | null
  user: {
    id: string
    firstName: string
    lastName: string
  }
  shiftDefinition?: {
    id: string
    name: string
    code: string
    color: string | null
    startTime: string
    endTime: string
  } | null
}

interface DialogState {
  open: boolean
  mode: 'add' | 'edit'
  date?: Date
  shiftDefId?: string
  assignment?: Assignment
}

export default function ScheduleDetailPage({ params }: PageProps) {
  const resolvedParams = use(params)
  const queryClient = useQueryClient()
  const [isGenerating, setIsGenerating] = useState(false)
  const [staffingRequirements, setStaffingRequirements] = useState<Record<string, number>>({})
  const [dialogState, setDialogState] = useState<DialogState>({
    open: false,
    mode: 'add',
  })

  const { data: schedule, isLoading, error } = useQuery({
    queryKey: ['schedule', resolvedParams.id],
    queryFn: async () => {
      const res = await fetch(`/api/schedules/${resolvedParams.id}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nel caricamento')
      }
      return res.json()
    },
  })

  const { data: shiftDefsData } = useQuery({
    queryKey: ['shift-definitions', schedule?.venueId],
    queryFn: async () => {
      const res = await fetch(`/api/shift-definitions?venueId=${schedule?.venueId}`)
      if (!res.ok) throw new Error('Errore nel caricamento turni')
      return res.json()
    },
    enabled: !!schedule?.venueId,
  })

  const shiftDefinitions = shiftDefsData?.data || []

  const generateMutation = useMutation({
    mutationFn: async (params: { preferFixedStaff: boolean; balanceHours: boolean; minimizeCost: boolean; staffingRequirements?: Record<string, number> }) => {
      const res = await fetch(`/api/schedules/${resolvedParams.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nella generazione')
      }
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['schedule', resolvedParams.id] })
      toast.success(`Generati ${data.assignmentsCreated} turni`)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const publishMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/schedules/${resolvedParams.id}/publish`, {
        method: 'POST',
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nella pubblicazione')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', resolvedParams.id] })
      toast.success('Pianificazione pubblicata!')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const moveAssignmentMutation = useMutation({
    mutationFn: async ({ assignmentId, newDate, newShiftDefId }: { assignmentId: string; newDate: Date; newShiftDefId: string }) => {
      const res = await fetch(`/api/assignments/${assignmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: newDate.toISOString().split('T')[0],
          shiftDefinitionId: newShiftDefId === 'custom' ? null : newShiftDefId,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nello spostamento')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', resolvedParams.id] })
      toast.success('Turno spostato')
    },
    onError: (error: Error) => {
      toast.error(error.message, { duration: Infinity })
    },
  })

  const handleAssignmentMove = async (assignmentId: string, newDate: Date, newShiftDefId: string) => {
    await moveAssignmentMutation.mutateAsync({ assignmentId, newDate, newShiftDefId })
  }

  const handleGenerate = async (params: { preferFixedStaff: boolean; balanceHours: boolean; minimizeCost: boolean; staffingRequirements?: Record<string, number> }) => {
    setIsGenerating(true)
    try {
      await generateMutation.mutateAsync(params)
    } finally {
      setIsGenerating(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (error || !schedule) {
    return (
      <div className="space-y-6">
        <Link href="/turni">
          <Button variant="ghost">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Torna alla lista
          </Button>
        </Link>
        <div className="text-center py-12 text-destructive">
          {error instanceof Error ? error.message : 'Pianificazione non trovata'}
        </div>
      </div>
    )
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <Badge variant="secondary">Bozza</Badge>
      case 'GENERATED':
        return <Badge className="bg-blue-100 text-blue-700">Generato</Badge>
      case 'REVIEW':
        return <Badge className="bg-amber-100 text-amber-700">In revisione</Badge>
      case 'PUBLISHED':
        return <Badge className="bg-green-100 text-green-700">Pubblicato</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  // Calculate stats
  const totalAssignments = schedule.assignments?.length || 0
  const totalHours = schedule.assignments?.reduce(
    (sum: number, a: { hoursScheduled: number }) => sum + (a.hoursScheduled || 0),
    0
  ) || 0
  const totalCost = schedule.assignments?.reduce(
    (sum: number, a: { costEstimated: number }) => sum + (a.costEstimated || 0),
    0
  ) || 0

  // Get warnings from generation log
  const warnings = schedule.generationLog?.warnings || []

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
              <Calendar className="h-6 w-6" />
              {schedule.name}
            </h1>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>
                {format(new Date(schedule.startDate), 'd MMMM', { locale: it })} -{' '}
                {format(new Date(schedule.endDate), 'd MMMM yyyy', { locale: it })}
              </span>
              <Badge variant="outline">{schedule.venue.code}</Badge>
              {getStatusBadge(schedule.status)}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {/* Export buttons - always visible when there are assignments */}
          {totalAssignments > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.open(`/api/schedules/${resolvedParams.id}/export/pdf`, '_blank')
                }}
              >
                <FileDown className="h-4 w-4 mr-2" />
                PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.open(`/api/schedules/${resolvedParams.id}/export/excel`, '_blank')
                }}
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel
              </Button>
            </>
          )}

          {/* Publish button - only for unpublished schedules */}
          {schedule.status !== 'PUBLISHED' && schedule.status !== 'ARCHIVED' && (
            <>
              {(schedule.status === 'GENERATED' || schedule.status === 'REVIEW') && (
                <Button
                  onClick={() => publishMutation.mutate()}
                  disabled={publishMutation.isPending}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Pubblica
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">{totalAssignments}</span>
            </div>
            <p className="text-sm text-muted-foreground">Turni assegnati</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">{totalHours.toFixed(1)}</span>
            </div>
            <p className="text-sm text-muted-foreground">Ore totali</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Euro className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">
                {totalCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">Costo stimato</p>
          </CardContent>
        </Card>
      </div>

      {/* Generation Form - Full Width Above Calendar */}
      {schedule.status !== 'PUBLISHED' && (
        <GenerationParamsForm
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
          startDate={new Date(schedule.startDate)}
          endDate={new Date(schedule.endDate)}
          shiftDefinitions={shiftDefinitions}
          onStaffingChange={setStaffingRequirements}
        />
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <ScheduleWarnings warnings={warnings} />
      )}

      {/* Calendar - Full Width */}
      <Card>
        <CardHeader>
          <CardTitle>Calendario Turni</CardTitle>
          <CardDescription>
            Clicca sulle celle per aggiungere o modificare turni
          </CardDescription>
        </CardHeader>
        <CardContent>
          {shiftDefinitions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Nessuna definizione turno configurata per questa sede.</p>
              <Link href="/turni/definizioni">
                <Button className="mt-4">
                  Configura Definizioni Turno
                </Button>
              </Link>
            </div>
          ) : (
            <ShiftCalendar
              startDate={new Date(schedule.startDate)}
              endDate={new Date(schedule.endDate)}
              assignments={schedule.assignments || []}
              shiftDefinitions={shiftDefinitions}
              staffingRequirements={staffingRequirements}
              onAssignmentClick={(assignment) => {
                setDialogState({
                  open: true,
                  mode: 'edit',
                  assignment: assignment as Assignment,
                })
              }}
              onSlotClick={(date, shiftDefId) => {
                setDialogState({
                  open: true,
                  mode: 'add',
                  date,
                  shiftDefId,
                })
              }}
              onAssignmentMove={schedule.status !== 'PUBLISHED' ? handleAssignmentMove : undefined}
            />
          )}
        </CardContent>
      </Card>

      {/* Dialog per aggiungere/modificare assegnazioni */}
      <AssignmentDialog
        open={dialogState.open}
        onOpenChange={(open) => setDialogState(prev => ({ ...prev, open }))}
        scheduleId={resolvedParams.id}
        venueId={schedule.venueId}
        shiftDefinitions={shiftDefinitions}
        date={dialogState.date}
        shiftDefId={dialogState.shiftDefId}
        assignment={dialogState.assignment}
        isReadOnly={false}
      />
    </div>
  )
}
