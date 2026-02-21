'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  Users,
  Search,
  Settings,
  UserPlus,
  Filter,
  UserCheck,
  UserX,
  Trash2,
  Mail,
  X,
  AlertTriangle,
  Lock,
  Loader2,
  ChevronDown,
  Link2,
  Copy,
  Check,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

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
  contractType: 'TEMPO_DETERMINATO' | 'TEMPO_INDETERMINATO' | 'LAVORO_INTERMITTENTE' | 'LAVORATORE_OCCASIONALE' | 'LIBERO_PROFESSIONISTA' | null
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

export default function StaffPage() {
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [filterVenue, setFilterVenue] = useState<string>('all')
  const [filterContract, setFilterContract] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // Selezione bulk
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Dialog states
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    action: 'activate' | 'deactivate' | null
  }>({ open: false, action: null })
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteStep, setDeleteStep] = useState<'confirm' | 'password'>('confirm')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')

  // Create/Invite dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [inviteStep, setInviteStep] = useState<'choose' | 'invite-link'>('choose')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [inviteLinkLoading, setInviteLinkLoading] = useState(false)
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false)

  const router = useRouter()
  const queryClient = useQueryClient()

  const { data: staffData, isLoading } = useQuery({
    queryKey: ['staff-list'],
    queryFn: async () => {
      const res = await fetch('/api/staff?showInactive=true')
      if (!res.ok) throw new Error('Errore nel caricamento staff')
      return res.json()
    },
  })

  const { data: venuesData } = useQuery({
    queryKey: ['venues'],
    queryFn: async () => {
      const res = await fetch('/api/venues')
      if (!res.ok) throw new Error('Errore nel caricamento sedi')
      return res.json()
    },
  })

  const staffList: StaffMember[] = staffData?.data || []
  const venues = venuesData?.venues || []

  // Filtra staff
  const filteredStaff = staffList.filter(staff => {
    const searchLower = search.toLowerCase()
    const matchesSearch =
      !search ||
      staff.firstName.toLowerCase().includes(searchLower) ||
      staff.lastName.toLowerCase().includes(searchLower) ||
      staff.email.toLowerCase().includes(searchLower)

    const matchesActive = showInactive ? !staff.isActive : staff.isActive
    const matchesVenue = filterVenue === 'all' || staff.venue?.id === filterVenue
    const matchesContract = filterContract === 'all' || staff.contractType === filterContract

    return matchesSearch && matchesActive && matchesVenue && matchesContract
  })

  // Paginazione
  const totalPages = Math.ceil(filteredStaff.length / pageSize)
  const paginatedStaff = filteredStaff.slice((page - 1) * pageSize, page * pageSize)

  // Reset selezione inline nei setter dei filtri
  const resetSelection = useCallback(() => setSelectedIds(new Set()), [])

  // Toggle selezione singola
  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Toggle seleziona tutti (della pagina corrente)
  const toggleSelectAll = () => {
    const allPageIds = paginatedStaff.map(s => s.id)
    const allSelected = allPageIds.every(id => selectedIds.has(id))

    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        allPageIds.forEach(id => next.delete(id))
        return next
      })
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev)
        allPageIds.forEach(id => next.add(id))
        return next
      })
    }
  }

  // Seleziona tutti i dipendenti filtrati (non solo la pagina corrente)
  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredStaff.map(s => s.id)))
  }

  const allPageSelected = paginatedStaff.length > 0 && paginatedStaff.every(s => selectedIds.has(s.id))
  const somePageSelected = paginatedStaff.some(s => selectedIds.has(s.id))

  // Mutation bulk
  const bulkMutation = useMutation({
    mutationFn: async ({ ids, action }: { ids: string[]; action: string }) => {
      const res = await fetch('/api/staff/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Errore nell\'esecuzione dell\'azione')
      }
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['staff-list'] })
      setSelectedIds(new Set())

      const actionLabels: Record<string, string> = {
        activate: 'attivati',
        deactivate: 'disattivati',
        delete: 'eliminati',
        invite: 'invitati',
      }
      toast.success(`${data.count} dipendenti ${actionLabels[data.action] || 'aggiornati'}`)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleBulkAction = (action: 'activate' | 'deactivate') => {
    setConfirmDialog({ open: true, action })
  }

  const confirmBulkAction = () => {
    if (!confirmDialog.action) return
    bulkMutation.mutate({
      ids: Array.from(selectedIds),
      action: confirmDialog.action,
    })
    setConfirmDialog({ open: false, action: null })
  }

  const handleBulkDelete = () => {
    setDeleteDialogOpen(true)
    setDeleteStep('confirm')
    setDeletePassword('')
    setDeleteError('')
  }

  const handleDeleteConfirm = async () => {
    if (deleteStep === 'confirm') {
      setDeleteStep('password')
      setDeleteError('')
      return
    }

    if (!deletePassword.trim()) {
      setDeleteError('Inserisci la password')
      return
    }

    try {
      // Verifica password
      const verifyRes = await fetch('/api/auth/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      })
      const verifyData = await verifyRes.json()

      if (!verifyRes.ok || !verifyData.valid) {
        setDeleteError('Password non corretta')
        return
      }

      // Esegui eliminazione bulk
      bulkMutation.mutate({
        ids: Array.from(selectedIds),
        action: 'delete',
      })
      setDeleteDialogOpen(false)
    } catch {
      setDeleteError('Errore di connessione')
    }
  }

  const handleBulkInvite = () => {
    bulkMutation.mutate({
      ids: Array.from(selectedIds),
      action: 'invite',
    })
  }

  const selectedStaff = staffList.filter(s => selectedIds.has(s.id))

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
  }

  const getContractBadge = (type: string | null) => {
    switch (type) {
      case 'TEMPO_DETERMINATO':
        return <Badge variant="default">T. Determinato</Badge>
      case 'TEMPO_INDETERMINATO':
        return <Badge className="bg-green-100 text-green-700">T. Indeterminato</Badge>
      case 'LAVORO_INTERMITTENTE':
        return <Badge variant="secondary">Intermittente</Badge>
      case 'LAVORATORE_OCCASIONALE':
        return <Badge variant="outline">Occasionale</Badge>
      case 'LIBERO_PROFESSIONISTA':
        return <Badge className="bg-blue-100 text-blue-700">Libero Prof.</Badge>
      default:
        return <Badge variant="outline">N/D</Badge>
    }
  }

  const getShiftBadge = (shift: string | null) => {
    switch (shift) {
      case 'MORNING':
        return <Badge className="bg-amber-100 text-amber-700">Mattina</Badge>
      case 'EVENING':
        return <Badge className="bg-purple-100 text-purple-700">Sera</Badge>
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Gestione Personale
          </h1>
          <p className="text-muted-foreground">
            Gestisci dipendenti, vincoli e pianificazione turni
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/staff/vincoli-relazionali">
            <Button variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              Vincoli Relazionali
            </Button>
          </Link>
          <Button onClick={() => { setCreateDialogOpen(true); setInviteStep('choose') }}>
            <UserPlus className="h-4 w-4 mr-2" />
            Crea dipendente
          </Button>
        </div>
      </div>

      {/* Filtri */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtri
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex flex-wrap gap-4 flex-1">
              <div className="relative w-full sm:w-[300px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cerca dipendente..."
                  value={search}
                  onChange={e => {
                    setSearch(e.target.value)
                    setPage(1)
                    resetSelection()
                  }}
                  className="pl-9"
                />
              </div>

<Select value={filterContract} onValueChange={(v) => {
                setFilterContract(v)
                setPage(1)
                resetSelection()
              }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Tutti i contratti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i contratti</SelectItem>
                  <SelectItem value="TEMPO_DETERMINATO">T. Determinato</SelectItem>
                  <SelectItem value="TEMPO_INDETERMINATO">T. Indeterminato</SelectItem>
                  <SelectItem value="LAVORO_INTERMITTENTE">Intermittente</SelectItem>
                  <SelectItem value="LAVORATORE_OCCASIONALE">Occasionale</SelectItem>
                  <SelectItem value="LIBERO_PROFESSIONISTA">Libero Prof.</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Tabs
              value={showInactive ? 'inactive' : 'active'}
              onValueChange={(v) => {
                setShowInactive(v === 'inactive')
                resetSelection()
              }}
            >
              <TabsList className="flex gap-1 p-1 bg-muted/50 rounded-lg h-auto w-fit border-none">
                <TabsTrigger
                  value="active"
                  className="px-4 py-2 rounded-full data-[state=active]:bg-black data-[state=active]:text-white transition-all shadow-none border-none text-sm font-medium"
                >
                  Attivi
                </TabsTrigger>
                <TabsTrigger
                  value="inactive"
                  className="px-4 py-2 rounded-full data-[state=active]:bg-black data-[state=active]:text-white transition-all shadow-none border-none text-sm font-medium"
                >
                  Inattivi
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Tabella staff */}
      <Card>
        <CardHeader>
          <CardTitle>
            Dipendenti
            <Badge variant="secondary" className="ml-2">
              {filteredStaff.length}
            </Badge>
          </CardTitle>
          <CardDescription>
            Clicca su un dipendente per visualizzare il profilo completo
          </CardDescription>
        </CardHeader>

        {/* Barra azioni bulk - stile Sesame HR */}
        {selectedIds.size > 0 && (
          <div className="mx-6 mb-4 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-blue-900">
                Hai selezionato <strong>{selectedIds.size}</strong> dei <strong>{filteredStaff.length}</strong> dipendenti.
              </span>
              {selectedIds.size < filteredStaff.length ? (
                <button
                  onClick={selectAllFiltered}
                  className="text-blue-600 hover:text-blue-800 underline underline-offset-2 font-medium"
                >
                  Seleziona tutta l&apos;azienda
                </button>
              ) : (
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-blue-600 hover:text-blue-800 underline underline-offset-2 font-medium"
                >
                  Deseleziona tutto
                </button>
              )}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  disabled={bulkMutation.isPending}
                >
                  Azioni in blocco
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!showInactive && (
                  <DropdownMenuItem onClick={() => handleBulkAction('deactivate')}>
                    <UserX className="h-4 w-4 mr-2" />
                    Disattiva utente
                  </DropdownMenuItem>
                )}
                {showInactive && (
                  <DropdownMenuItem onClick={() => handleBulkAction('activate')}>
                    <UserCheck className="h-4 w-4 mr-2" />
                    Attiva utente
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={handleBulkDelete}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Elimina utente
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleBulkInvite}>
                  <Mail className="h-4 w-4 mr-2" />
                  Invita utente
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Caricamento...
            </div>
          ) : filteredStaff.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nessun dipendente trovato
            </div>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={allPageSelected ? true : somePageSelected ? 'indeterminate' : false}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Seleziona tutti"
                      />
                    </TableHead>
                    <TableHead>Dipendente</TableHead>
                    <TableHead>Contratto</TableHead>
                    <TableHead>Turno</TableHead>
                    <TableHead>Stato</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedStaff.map(staff => (
                    <TableRow
                      key={staff.id}
                      className={cn(selectedIds.has(staff.id) && 'bg-muted/30')}
                    >
                      <TableCell>
                        <div onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(staff.id)}
                            onCheckedChange={() => toggleSelection(staff.id)}
                            aria-label={`Seleziona ${staff.firstName} ${staff.lastName}`}
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>
                              {getInitials(staff.firstName, staff.lastName)}
                            </AvatarFallback>
                          </Avatar>
                          <Link
                            href={`/staff/${staff.id}`}
                            className="font-medium hover:underline hover:text-primary transition-colors"
                          >
                            {staff.firstName} {staff.lastName}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell>{getContractBadge(staff.contractType)}</TableCell>
                      <TableCell>
                        {getShiftBadge(staff.defaultShift) || (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {staff.isActive ? (
                          <Badge className="bg-green-100 text-green-700">Attivo</Badge>
                        ) : (
                          <Badge variant="secondary">Inattivo</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Paginazione */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Mostra</span>
                  <Select
                    value={pageSize.toString()}
                    onValueChange={(v) => {
                      setPageSize(parseInt(v))
                      setPage(1)
                      resetSelection()
                    }}
                  >
                    <SelectTrigger className="w-[80px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="500">500</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground">
                    per pagina ({filteredStaff.length} totali)
                  </span>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Precedente
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Pagina {page} di {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Successiva
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AlertDialog per Attiva/Disattiva */}
      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog({ open, action: open ? confirmDialog.action : null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog.action === 'activate' ? 'Attiva' : 'Disattiva'} {selectedIds.size} dipendent{selectedIds.size === 1 ? 'e' : 'i'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.action === 'activate'
                ? 'I dipendenti selezionati verranno riattivati e potranno accedere al sistema.'
                : 'I dipendenti selezionati verranno disattivati. Non potranno accedere al sistema ma i dati storici verranno mantenuti.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkAction}>
              {confirmDialog.action === 'activate' ? 'Attiva' : 'Disattiva'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Crea dipendente / Invita */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => {
        setCreateDialogOpen(open)
        if (!open) {
          setTimeout(() => {
            setInviteStep('choose')
            setInviteLink(null)
            setInviteLinkCopied(false)
          }, 200)
        }
      }}>
        <DialogContent className="max-w-md">
          {inviteStep === 'choose' ? (
            <>
              <DialogHeader>
                <DialogTitle>Crea dipendente</DialogTitle>
                <DialogDescription>
                  Scegli come aggiungere un nuovo dipendente
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 py-4">
                <button
                  onClick={() => {
                    setCreateDialogOpen(false)
                    router.push('/staff/nuovo')
                  }}
                  className="flex items-start gap-4 p-4 rounded-lg border border-border hover:border-primary hover:bg-muted/50 transition-all text-left"
                >
                  <div className="rounded-full bg-muted p-3">
                    <UserPlus className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">Crealo tu</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Compila tu tutti i dati del dipendente
                    </p>
                  </div>
                </button>

                <button
                  onClick={async () => {
                    setInviteStep('invite-link')
                    setInviteLinkLoading(true)
                    try {
                      const res = await fetch('/api/staff/invite')
                      const data = await res.json()
                      if (!res.ok) throw new Error(data.error)
                      setInviteLink(data.url)
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Errore nel generare il link')
                    } finally {
                      setInviteLinkLoading(false)
                    }
                  }}
                  className="flex items-start gap-4 p-4 rounded-lg border border-border hover:border-primary hover:bg-muted/50 transition-all text-left"
                >
                  <div className="rounded-full bg-muted p-3">
                    <Link2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">Invita tramite link</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Genera un link da condividere manualmente
                    </p>
                  </div>
                </button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Link per l&apos;invito</DialogTitle>
                <DialogDescription>
                  Condividi questo link con il nuovo dipendente per permettergli di registrarsi
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {inviteLinkLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Generazione link...</span>
                  </div>
                ) : inviteLink ? (
                  <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
                    <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-sm truncate select-all font-mono">
                      {inviteLink}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(inviteLink)
                        setInviteLinkCopied(true)
                        toast.success('Link copiato!')
                        setTimeout(() => setInviteLinkCopied(false), 2000)
                      }}
                    >
                      {inviteLinkCopied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={async () => {
                        setInviteLinkLoading(true)
                        try {
                          const res = await fetch('/api/staff/invite', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'regenerate' }),
                          })
                          const data = await res.json()
                          if (!res.ok) throw new Error(data.error)
                          setInviteLink(data.url)
                          setInviteLinkCopied(false)
                          toast.success('Link rigenerato!')
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : 'Errore nella rigenerazione')
                        } finally {
                          setInviteLinkLoading(false)
                        }
                      }}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Impossibile generare il link. Riprova.
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setInviteStep('choose')
                    setInviteLink(null)
                    setInviteLinkCopied(false)
                  }}
                >
                  Indietro
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Elimina con conferma password */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open)
        if (!open) {
          setTimeout(() => {
            setDeleteStep('confirm')
            setDeletePassword('')
            setDeleteError('')
          }, 200)
        }
      }}>
        <DialogContent showCloseButton={!bulkMutation.isPending} className="max-w-md">
          {deleteStep === 'confirm' ? (
            <>
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
                <AlertTriangle className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <DialogTitle className="text-red-900 text-lg">
                    Elimina {selectedIds.size} dipendent{selectedIds.size === 1 ? 'e' : 'i'}?
                  </DialogTitle>
                  <DialogDescription className="text-red-700/80 text-sm">
                    Questa azione disattivera i dipendenti selezionati. I dati storici verranno mantenuti.
                  </DialogDescription>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-muted-foreground">
                  Dipendenti da eliminare ({selectedIds.size}):
                </Label>
                <div className="max-h-[240px] overflow-y-auto border rounded-md">
                  <div className="p-2 space-y-1">
                    {selectedStaff.map((staff) => (
                      <div
                        key={staff.id}
                        className="flex items-center gap-2 p-2 rounded-sm bg-muted/30 hover:bg-muted/50"
                      >
                        <X className="h-4 w-4 text-red-500 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm">
                            {staff.firstName} {staff.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {staff.email}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  I dipendenti verranno solo disattivati. Tutti i dati storici (turni, presenze, registrazioni) rimarranno collegati.
                </p>
              </div>

              <DialogFooter className="gap-2 mt-2">
                <Button
                  variant="outline"
                  onClick={() => setDeleteDialogOpen(false)}
                  className="flex-1"
                >
                  Annulla
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteConfirm}
                  className="flex-1"
                >
                  Elimina
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5 text-muted-foreground" />
                  Conferma Password
                </DialogTitle>
                <DialogDescription className="pt-2">
                  Inserisci la tua password per confermare l&apos;eliminazione di{' '}
                  <strong>{selectedIds.size} dipendent{selectedIds.size === 1 ? 'e' : 'i'}</strong>.
                </DialogDescription>
              </DialogHeader>

              <div className="py-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="bulk-delete-password">Password amministratore</Label>
                  <Input
                    id="bulk-delete-password"
                    type="password"
                    value={deletePassword}
                    onChange={(e) => {
                      setDeletePassword(e.target.value)
                      setDeleteError('')
                    }}
                    placeholder="Inserisci la password..."
                    className={cn(
                      'h-11',
                      deleteError && 'border-red-500 focus-visible:ring-red-500'
                    )}
                    disabled={bulkMutation.isPending}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !bulkMutation.isPending) {
                        handleDeleteConfirm()
                      }
                    }}
                  />
                  {deleteError && (
                    <p className="text-sm text-red-600 flex items-center gap-1">
                      <X className="h-3.5 w-3.5" />
                      {deleteError}
                    </p>
                  )}
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDeleteStep('confirm')}
                  disabled={bulkMutation.isPending}
                  className="flex-1"
                >
                  Indietro
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteConfirm}
                  disabled={bulkMutation.isPending || !deletePassword.trim()}
                  className="flex-1"
                >
                  {bulkMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Eliminazione...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Conferma Elimina
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
