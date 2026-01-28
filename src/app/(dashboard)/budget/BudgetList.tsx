'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Eye,
  Pencil,
  Trash2,
  Calculator,
  AlertTriangle,
  BarChart3,
  FileText,
  CheckCircle,
  Archive,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { formatCurrency } from '@/lib/constants'
import { toast } from 'sonner'
import {
  BUDGET_STATUS_LABELS,
  BUDGET_STATUS_COLORS,
  type BudgetStatus,
} from '@/types/budget'
import { getAvailableYears } from '@/lib/budget-utils'

import { logger } from '@/lib/logger'
interface Budget {
  id: string
  year: number
  name?: string
  status: BudgetStatus
  venue: {
    id: string
    name: string
    code: string
  }
  createdBy?: {
    firstName: string
    lastName: string
  }
  createdAt: string
  totalBudget: number
  lineCount: number
  alertsCount: number
}

interface BudgetListProps {
  venueId?: string
  isAdmin: boolean
}

export function BudgetList({ venueId, isAdmin }: BudgetListProps) {
  const router = useRouter()
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)
  const [yearFilter, setYearFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const availableYears = getAvailableYears()

  // Fetch budgets
  const fetchBudgets = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (venueId) params.set('venueId', venueId)
      if (yearFilter !== 'all') params.set('year', yearFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const res = await fetch(`/api/budget?${params.toString()}`)
      if (!res.ok) throw new Error('Errore nel caricamento')

      const data = await res.json()
      setBudgets(data.data)
    } catch (error) {
      logger.error('Errore fetch budgets', error)
      toast.error('Errore nel caricamento dei budget')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBudgets()
  }, [venueId, yearFilter, statusFilter])

  // Delete budget
  const handleDelete = async () => {
    if (!deleteId) return

    try {
      const res = await fetch(`/api/budget/${deleteId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Errore eliminazione')
      }
      toast.success('Budget eliminato')
      setDeleteId(null)
      fetchBudgets()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Errore eliminazione')
    }
  }

  // Update status
  const handleStatusChange = async (id: string, newStatus: BudgetStatus) => {
    try {
      const res = await fetch(`/api/budget/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Errore aggiornamento')
      }
      toast.success(`Budget ${BUDGET_STATUS_LABELS[newStatus].toLowerCase()}`)
      fetchBudgets()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Errore aggiornamento')
    }
  }

  // Status badge
  const getStatusBadge = (status: BudgetStatus) => {
    const Icon = status === 'DRAFT' ? FileText : status === 'ACTIVE' ? CheckCircle : Archive
    return (
      <Badge className={`gap-1 ${BUDGET_STATUS_COLORS[status]}`}>
        <Icon className="h-3 w-3" />
        {BUDGET_STATUS_LABELS[status]}
      </Badge>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Budget</h1>
          <p className="text-muted-foreground">
            Gestione budget annuali e confronto con consuntivo
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/budget/confronto">
              <BarChart3 className="h-4 w-4 mr-2" />
              Confronto
            </Link>
          </Button>
          <Button asChild>
            <Link href="/budget/nuovo">
              <Plus className="h-4 w-4 mr-2" />
              Nuovo Budget
            </Link>
          </Button>
        </div>
      </div>

      {/* Filtri */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtri</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Anno" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli anni</SelectItem>
                {availableYears.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Stato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati</SelectItem>
                <SelectItem value="DRAFT">Bozza</SelectItem>
                <SelectItem value="ACTIVE">Attivo</SelectItem>
                <SelectItem value="ARCHIVED">Archiviato</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista Budget */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Anno</TableHead>
                {isAdmin && <TableHead>Sede</TableHead>}
                <TableHead>Nome</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="text-right">Totale Budget</TableHead>
                <TableHead className="text-center">Righe</TableHead>
                <TableHead className="text-center">Alert</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 8 : 7} className="text-center py-8">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      Caricamento...
                    </div>
                  </TableCell>
                </TableRow>
              ) : budgets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 8 : 7} className="text-center py-8 text-muted-foreground">
                    Nessun budget trovato
                  </TableCell>
                </TableRow>
              ) : (
                budgets.map((budget) => (
                  <TableRow key={budget.id}>
                    <TableCell className="font-medium">{budget.year}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <Badge variant="outline">{budget.venue.code}</Badge>
                      </TableCell>
                    )}
                    <TableCell>{budget.name || `Budget ${budget.year}`}</TableCell>
                    <TableCell>{getStatusBadge(budget.status)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(budget.totalBudget)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{budget.lineCount}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {budget.alertsCount > 0 ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {budget.alertsCount}
                        </Badge>
                      ) : (
                        <Badge variant="outline">0</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <span className="sr-only">Azioni</span>
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <circle cx="12" cy="12" r="1" />
                              <circle cx="12" cy="5" r="1" />
                              <circle cx="12" cy="19" r="1" />
                            </svg>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/budget/${budget.id}`}>
                              <Eye className="h-4 w-4 mr-2" />
                              Visualizza
                            </Link>
                          </DropdownMenuItem>
                          {budget.status !== 'ARCHIVED' && (
                            <DropdownMenuItem asChild>
                              <Link href={`/budget/${budget.id}?edit=true`}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Modifica
                              </Link>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {budget.status === 'DRAFT' && (
                            <DropdownMenuItem
                              onClick={() => handleStatusChange(budget.id, 'ACTIVE')}
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Attiva
                            </DropdownMenuItem>
                          )}
                          {budget.status === 'ACTIVE' && (
                            <DropdownMenuItem
                              onClick={() => handleStatusChange(budget.id, 'ARCHIVED')}
                            >
                              <Archive className="h-4 w-4 mr-2" />
                              Archivia
                            </DropdownMenuItem>
                          )}
                          {budget.status === 'DRAFT' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeleteId(budget.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Elimina
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina Budget</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare questo budget? Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
