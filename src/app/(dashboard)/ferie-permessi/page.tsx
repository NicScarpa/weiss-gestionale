'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  CheckCircle2,
  XCircle,
  Filter,
  User,
  MapPin,
  CalendarDays,
  CalendarIcon,
  Plus,
  Loader2,
  Pencil,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useSession } from 'next-auth/react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Calendar } from '@/components/ui/calendar'

interface LeaveRequest {
  id: string
  startDate: string
  endDate: string
  daysRequested: number | null
  hoursRequested: number | null
  isPartialDay: boolean
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  notes: string | null
  requestedAt: string
  leaveType: {
    id: string
    code: string
    name: string
    color: string | null
  }
  user: {
    id: string
    firstName: string
    lastName: string
    email: string
    venue?: {
      id: string
      name: string
      code: string
    } | null
  }
}

interface StaffUser {
  id: string
  firstName: string
  lastName: string
  venue?: {
    code: string
  } | null
}

interface LeaveType {
  id: string
  code: string
  name: string
  color: string | null
}

async function fetchLeaveRequests(status?: string): Promise<LeaveRequest[]> {
  const url = status
    ? `/api/leave-requests?status=${status}`
    : '/api/leave-requests'
  const res = await fetch(url)
  if (!res.ok) throw new Error('Errore nel caricamento richieste')
  const data = await res.json()
  return data.data || []
}

async function fetchStaffUsers(): Promise<StaffUser[]> {
  const res = await fetch('/api/staff')
  if (!res.ok) throw new Error('Errore nel caricamento utenti')
  const data = await res.json()
  return data.data || []
}

async function fetchLeaveTypes(): Promise<LeaveType[]> {
  const res = await fetch('/api/leave-types')
  if (!res.ok) throw new Error('Errore nel caricamento tipi assenza')
  const data = await res.json()
  return data.data || []
}

async function createLeaveRequestForUser(data: {
  userId: string
  leaveTypeId: string
  startDate: string
  endDate: string
  isPartialDay: boolean
  startTime?: string
  endTime?: string
  notes?: string
}) {
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

async function approveRequest(id: string, managerNotes?: string) {
  const res = await fetch(`/api/leave-requests/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ managerNotes }),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Errore nell\'approvazione')
  }
  return res.json()
}

async function rejectRequest(id: string, rejectionReason: string) {
  const res = await fetch(`/api/leave-requests/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rejectionReason }),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Errore nel rifiuto')
  }
  return res.json()
}

function formatDateRange(start: string, end: string): string {
  const startDate = parseISO(start)
  const endDate = parseISO(end)

  if (start.split('T')[0] === end.split('T')[0]) {
    return format(startDate, 'd MMMM yyyy', { locale: it })
  }

  return `${format(startDate, 'd MMM')} - ${format(endDate, 'd MMM yyyy', { locale: it })}`
}

export default function FeriePermessiPage() {
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'

  const [statusFilter, setStatusFilter] = useState<string>('PENDING')
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null)
  const [dialogMode, setDialogMode] = useState<'approve' | 'reject' | null>(null)
  const [notes, setNotes] = useState('')

  // Stati per dialog creazione ferie (solo admin)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createForm, setCreateForm] = useState({
    userId: '',
    leaveTypeId: '',
    startDate: '',
    endDate: '',
    isPartialDay: false,
    startTime: '',
    endTime: '',
    notes: '',
  })

  // Stati per modifica e cancellazione (solo admin)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editingRequest, setEditingRequest] = useState<LeaveRequest | null>(null)
  const [editForm, setEditForm] = useState({
    startDate: '',
    endDate: '',
    leaveTypeId: '',
    notes: '',
  })

  const { data: requests, isLoading, error } = useQuery({
    queryKey: ['leave-requests-manager', statusFilter],
    queryFn: () => fetchLeaveRequests(statusFilter === 'ALL' ? undefined : statusFilter),
  })

  // Query per lista utenti (solo per admin)
  const { data: staffUsers } = useQuery({
    queryKey: ['staff-users'],
    queryFn: fetchStaffUsers,
    enabled: isAdmin,
  })

  // Query per tipi assenza (solo per admin)
  const { data: leaveTypes } = useQuery({
    queryKey: ['leave-types'],
    queryFn: fetchLeaveTypes,
    enabled: isAdmin,
  })

  const approveMutation = useMutation({
    mutationFn: ({ id, managerNotes }: { id: string; managerNotes?: string }) =>
      approveRequest(id, managerNotes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests-manager'] })
      toast.success('Richiesta approvata')
      closeDialog()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      rejectRequest(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests-manager'] })
      toast.success('Richiesta rifiutata')
      closeDialog()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Mutation per creare ferie (admin)
  const createMutation = useMutation({
    mutationFn: createLeaveRequestForUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests-manager'] })
      toast.success('Ferie aggiunte con successo')
      closeCreateDialog()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Mutation per modificare richiesta (admin)
  const editMutation = useMutation({
    mutationFn: async (data: { id: string; startDate?: string; endDate?: string; leaveTypeId?: string; notes?: string }) => {
      const res = await fetch(`/api/leave-requests/${data.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: data.startDate,
          endDate: data.endDate,
          leaveTypeId: data.leaveTypeId,
          notes: data.notes,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nella modifica')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests-manager'] })
      toast.success('Richiesta modificata con successo')
      closeEditDialog()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Mutation per cancellare richiesta (admin)
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/leave-requests/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nella cancellazione')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests-manager'] })
      toast.success('Richiesta annullata')
      setShowDeleteDialog(false)
      setEditingRequest(null)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const openApproveDialog = (req: LeaveRequest) => {
    setSelectedRequest(req)
    setDialogMode('approve')
    setNotes('')
  }

  const openRejectDialog = (req: LeaveRequest) => {
    setSelectedRequest(req)
    setDialogMode('reject')
    setNotes('')
  }

  const closeDialog = () => {
    setSelectedRequest(null)
    setDialogMode(null)
    setNotes('')
  }

  const handleConfirm = () => {
    if (!selectedRequest) return

    if (dialogMode === 'approve') {
      approveMutation.mutate({
        id: selectedRequest.id,
        managerNotes: notes || undefined,
      })
    } else if (dialogMode === 'reject') {
      if (!notes.trim()) {
        toast.error('Il motivo del rifiuto è obbligatorio')
        return
      }
      rejectMutation.mutate({
        id: selectedRequest.id,
        reason: notes,
      })
    }
  }

  // Funzioni per dialog creazione ferie
  const openCreateDialog = () => {
    setCreateForm({
      userId: '',
      leaveTypeId: '',
      startDate: '',
      endDate: '',
      isPartialDay: false,
      startTime: '',
      endTime: '',
      notes: '',
    })
    setShowCreateDialog(true)
  }

  const closeCreateDialog = () => {
    setShowCreateDialog(false)
    setCreateForm({
      userId: '',
      leaveTypeId: '',
      startDate: '',
      endDate: '',
      isPartialDay: false,
      startTime: '',
      endTime: '',
      notes: '',
    })
  }

  const handleCreateSubmit = () => {
    if (!createForm.userId) {
      toast.error('Seleziona un dipendente')
      return
    }
    if (!createForm.leaveTypeId) {
      toast.error('Seleziona un tipo di assenza')
      return
    }
    if (!createForm.startDate || !createForm.endDate) {
      toast.error('Inserisci le date')
      return
    }
    if (createForm.isPartialDay && (!createForm.startTime || !createForm.endTime)) {
      toast.error('Inserisci gli orari per la giornata parziale')
      return
    }

    createMutation.mutate({
      userId: createForm.userId,
      leaveTypeId: createForm.leaveTypeId,
      startDate: createForm.startDate,
      endDate: createForm.endDate,
      isPartialDay: createForm.isPartialDay,
      startTime: createForm.isPartialDay ? createForm.startTime : undefined,
      endTime: createForm.isPartialDay ? createForm.endTime : undefined,
      notes: createForm.notes || undefined,
    })
  }

  // Funzioni per dialog modifica (admin)
  const openEditDialog = (req: LeaveRequest) => {
    setEditingRequest(req)
    setEditForm({
      startDate: req.startDate.split('T')[0],
      endDate: req.endDate.split('T')[0],
      leaveTypeId: req.leaveType.id,
      notes: req.notes || '',
    })
    setShowEditDialog(true)
  }

  const closeEditDialog = () => {
    setShowEditDialog(false)
    setEditingRequest(null)
    setEditForm({
      startDate: '',
      endDate: '',
      leaveTypeId: '',
      notes: '',
    })
  }

  const handleEditSubmit = () => {
    if (!editingRequest) return
    if (!editForm.startDate || !editForm.endDate) {
      toast.error('Inserisci le date')
      return
    }
    editMutation.mutate({
      id: editingRequest.id,
      startDate: editForm.startDate,
      endDate: editForm.endDate,
      leaveTypeId: editForm.leaveTypeId,
      notes: editForm.notes || undefined,
    })
  }

  // Funzioni per dialog cancellazione (admin)
  const openDeleteDialog = (req: LeaveRequest) => {
    setEditingRequest(req)
    setShowDeleteDialog(true)
  }

  const handleDeleteConfirm = () => {
    if (!editingRequest) return
    deleteMutation.mutate(editingRequest.id)
  }

  const pendingCount = requests?.filter((r) => r.status === 'PENDING').length || 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ferie e Permessi</h1>
          <p className="text-sm text-slate-600 mt-1">
            Gestisci le richieste di ferie e permessi del personale
          </p>
        </div>

        <div className="flex items-center gap-3">
          {pendingCount > 0 && statusFilter !== 'PENDING' && (
            <Badge variant="destructive" className="text-sm">
              {pendingCount} in attesa
            </Badge>
          )}
          {isAdmin && (
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Aggiungi Ferie
            </Button>
          )}
        </div>
      </div>

      {/* Filtri */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="flex gap-1 p-1 bg-muted/50 rounded-lg h-auto w-fit border-none">
          <TabsTrigger
            value="PENDING"
            className="px-4 py-2 rounded-full data-[state=active]:bg-black data-[state=active]:text-white transition-all shadow-none border-none text-sm font-medium gap-2"
          >
            In Attesa
            {pendingCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="APPROVED"
            className="px-4 py-2 rounded-full data-[state=active]:bg-black data-[state=active]:text-white transition-all shadow-none border-none text-sm font-medium"
          >
            Approvate
          </TabsTrigger>
          <TabsTrigger
            value="REJECTED"
            className="px-4 py-2 rounded-full data-[state=active]:bg-black data-[state=active]:text-white transition-all shadow-none border-none text-sm font-medium"
          >
            Rifiutate
          </TabsTrigger>
          <TabsTrigger
            value="ALL"
            className="px-4 py-2 rounded-full data-[state=active]:bg-black data-[state=active]:text-white transition-all shadow-none border-none text-sm font-medium"
          >
            Tutte
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Lista richieste */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Richieste
            {requests && (
              <Badge variant="outline" className="ml-2">
                {requests.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-red-500 text-center py-8">
              Errore nel caricamento delle richieste
            </p>
          ) : requests && requests.length > 0 ? (
            <div className="space-y-4">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className={cn(
                    'flex items-start gap-4 p-4 rounded-lg border',
                    req.status === 'PENDING' && 'bg-amber-50/50 border-amber-200',
                    req.status === 'APPROVED' && 'bg-emerald-50/50 border-emerald-200',
                    req.status === 'REJECTED' && 'bg-red-50/50 border-red-200'
                  )}
                >
                  {/* Indicatore colore tipo */}
                  <div
                    className="w-1 h-16 rounded-full"
                    style={{ backgroundColor: req.leaveType.color || '#6B7280' }}
                  />

                  {/* Info richiesta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="h-4 w-4 text-slate-400" />
                      <span className="font-medium text-slate-900">
                        {req.user.firstName} {req.user.lastName}
                      </span>
                      {req.user.venue && (
                        <Badge variant="outline" className="text-xs">
                          <MapPin className="h-3 w-3 mr-1" />
                          {req.user.venue.code}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                      <Badge
                        variant="secondary"
                        style={{
                          backgroundColor: `${req.leaveType.color}20` || undefined,
                          borderColor: req.leaveType.color || undefined,
                        }}
                      >
                        {req.leaveType.name}
                      </Badge>
                      <span className="text-sm text-slate-600">
                        {formatDateRange(req.startDate, req.endDate)}
                      </span>
                      {req.daysRequested && (
                        <span className="text-sm text-slate-500">
                          ({Number(req.daysRequested).toFixed(1)} gg)
                        </span>
                      )}
                    </div>

                    {req.notes && (
                      <p className="text-sm text-slate-500 italic mb-2">
                        &quot;{req.notes}&quot;
                      </p>
                    )}

                    <p className="text-xs text-slate-400">
                      Richiesta il {format(parseISO(req.requestedAt), 'd MMM yyyy HH:mm', { locale: it })}
                    </p>
                  </div>

                  {/* Azioni */}
                  <div className="flex items-center gap-2">
                    {req.status === 'PENDING' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          onClick={() => openApproveDialog(req)}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Approva
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => openRejectDialog(req)}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Rifiuta
                        </Button>
                      </>
                    )}

                    {req.status !== 'PENDING' && (
                      <Badge
                        className={cn(
                          req.status === 'APPROVED' && 'bg-emerald-100 text-emerald-700',
                          req.status === 'REJECTED' && 'bg-red-100 text-red-700',
                          req.status === 'CANCELLED' && 'bg-slate-100 text-slate-600'
                        )}
                      >
                        {req.status === 'APPROVED' && 'Approvata'}
                        {req.status === 'REJECTED' && 'Rifiutata'}
                        {req.status === 'CANCELLED' && 'Annullata'}
                      </Badge>
                    )}

                    {/* Pulsanti modifica/cancella (solo admin) */}
                    {isAdmin && req.status !== 'CANCELLED' && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-slate-500 hover:text-blue-600"
                          onClick={() => openEditDialog(req)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-slate-500 hover:text-red-600"
                          onClick={() => openDeleteDialog(req)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-8">
              Nessuna richiesta trovata
            </p>
          )}
        </CardContent>
      </Card>

      {/* Dialog conferma */}
      <Dialog open={dialogMode !== null} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'approve' ? 'Approva Richiesta' : 'Rifiuta Richiesta'}
            </DialogTitle>
            <DialogDescription>
              {selectedRequest && (
                <>
                  Richiesta di {selectedRequest.user.firstName} {selectedRequest.user.lastName}
                  {' per '}
                  {selectedRequest.leaveType.name}
                  {' dal '}
                  {formatDateRange(selectedRequest.startDate, selectedRequest.endDate)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>
                {dialogMode === 'approve' ? 'Note (opzionale)' : 'Motivo del rifiuto *'}
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  dialogMode === 'approve'
                    ? 'Aggiungi eventuali note...'
                    : 'Specifica il motivo del rifiuto...'
                }
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Annulla
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={approveMutation.isPending || rejectMutation.isPending}
              className={cn(
                dialogMode === 'approve' && 'bg-emerald-600 hover:bg-emerald-700',
                dialogMode === 'reject' && 'bg-red-600 hover:bg-red-700'
              )}
            >
              {dialogMode === 'approve' ? 'Approva' : 'Rifiuta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog creazione ferie (solo admin) */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Aggiungi Ferie</DialogTitle>
            <DialogDescription>
              Crea una richiesta di ferie per un dipendente. Sarà automaticamente approvata.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Selezione dipendente */}
            <div className="space-y-2">
              <Label>Dipendente *</Label>
              <Select
                value={createForm.userId}
                onValueChange={(value) => setCreateForm(prev => ({ ...prev, userId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona dipendente" />
                </SelectTrigger>
                <SelectContent>
                  {staffUsers?.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.firstName} {user.lastName}
                      {user.venue && ` (${user.venue.code})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Selezione tipo assenza */}
            <div className="space-y-2">
              <Label>Tipo Assenza *</Label>
              <Select
                value={createForm.leaveTypeId}
                onValueChange={(value) => setCreateForm(prev => ({ ...prev, leaveTypeId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona tipo" />
                </SelectTrigger>
                <SelectContent>
                  {leaveTypes?.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: type.color || '#6B7280' }}
                        />
                        {type.name} ({type.code})
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                        !createForm.startDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {createForm.startDate
                        ? format(parseISO(createForm.startDate), 'dd/MM/yyyy')
                        : 'Seleziona...'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={createForm.startDate ? parseISO(createForm.startDate) : undefined}
                      onSelect={(date) => date && setCreateForm(prev => ({ ...prev, startDate: format(date, 'yyyy-MM-dd') }))}
                      locale={it}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Data Fine *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !createForm.endDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {createForm.endDate
                        ? format(parseISO(createForm.endDate), 'dd/MM/yyyy')
                        : 'Seleziona...'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={createForm.endDate ? parseISO(createForm.endDate) : undefined}
                      onSelect={(date) => date && setCreateForm(prev => ({ ...prev, endDate: format(date, 'yyyy-MM-dd') }))}
                      locale={it}
                      disabled={(date) =>
                        createForm.startDate ? date < parseISO(createForm.startDate) : false
                      }
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Giornata parziale */}
            <div className="flex items-center justify-between">
              <Label>Giornata parziale</Label>
              <Switch
                checked={createForm.isPartialDay}
                onCheckedChange={(checked) => setCreateForm(prev => ({ ...prev, isPartialDay: checked }))}
              />
            </div>

            {createForm.isPartialDay && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Ora Inizio *</Label>
                  <Input
                    type="time"
                    value={createForm.startTime}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, startTime: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ora Fine *</Label>
                  <Input
                    type="time"
                    value={createForm.endTime}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, endTime: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {/* Note */}
            <div className="space-y-2">
              <Label>Note (opzionale)</Label>
              <Textarea
                value={createForm.notes}
                onChange={(e) => setCreateForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Aggiungi eventuali note..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeCreateDialog}>
              Annulla
            </Button>
            <Button
              onClick={handleCreateSubmit}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Aggiungi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog modifica richiesta (admin) */}
      <Dialog open={showEditDialog} onOpenChange={(open) => !open && closeEditDialog()}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Modifica Richiesta</DialogTitle>
            <DialogDescription>
              {editingRequest && (
                <>
                  Modifica la richiesta di {editingRequest.user.firstName} {editingRequest.user.lastName}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data inizio</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !editForm.startDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editForm.startDate
                        ? format(parseISO(editForm.startDate), 'dd/MM/yyyy')
                        : 'Seleziona...'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={editForm.startDate ? parseISO(editForm.startDate) : undefined}
                      onSelect={(date) => date && setEditForm({ ...editForm, startDate: format(date, 'yyyy-MM-dd') })}
                      locale={it}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Data fine</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !editForm.endDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editForm.endDate
                        ? format(parseISO(editForm.endDate), 'dd/MM/yyyy')
                        : 'Seleziona...'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={editForm.endDate ? parseISO(editForm.endDate) : undefined}
                      onSelect={(date) => date && setEditForm({ ...editForm, endDate: format(date, 'yyyy-MM-dd') })}
                      locale={it}
                      disabled={(date) =>
                        editForm.startDate ? date < parseISO(editForm.startDate) : false
                      }
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tipo assenza</Label>
              <Select
                value={editForm.leaveTypeId}
                onValueChange={(value) => setEditForm({ ...editForm, leaveTypeId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona tipo" />
                </SelectTrigger>
                <SelectContent>
                  {leaveTypes?.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Note opzionali..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeEditDialog}>
              Annulla
            </Button>
            <Button onClick={handleEditSubmit} disabled={editMutation.isPending}>
              {editMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salva modifiche
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog conferma cancellazione (admin) */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annullare questa richiesta?</AlertDialogTitle>
            <AlertDialogDescription>
              {editingRequest && (
                <>
                  Stai per annullare la richiesta di{' '}
                  <strong>{editingRequest.user.firstName} {editingRequest.user.lastName}</strong>
                  {' per '}
                  <strong>{editingRequest.leaveType.name}</strong>
                  {' dal '}
                  {formatDateRange(editingRequest.startDate, editingRequest.endDate)}.
                  {editingRequest.status === 'APPROVED' && (
                    <span className="block mt-2 text-amber-600">
                      Attenzione: questa richiesta è già stata approvata.
                      Il saldo ferie del dipendente verrà ripristinato.
                    </span>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setEditingRequest(null)}>
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Conferma annullamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
