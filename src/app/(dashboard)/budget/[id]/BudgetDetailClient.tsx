'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  Pencil,
  LayoutDashboard,
  Table as TableIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCurrency } from '@/lib/constants'
import { toast } from 'sonner'
import {
  type BudgetLine,
  type MonthKey,
  MONTH_KEYS,
  MONTH_LABELS,
  BUDGET_STATUS_LABELS,
  BUDGET_STATUS_COLORS,
  type BudgetStatus,
} from '@/types/budget'
import { calculateAnnualTotal, emptyMonthlyValues } from '@/lib/budget-utils'
import { BudgetDashboard } from '@/components/budget'

import { logger } from '@/lib/logger'
interface Account {
  id: string
  code: string
  name: string
  type: string
}

interface BudgetDetailClientProps {
  budgetId: string
  venue: { id: string; name: string; code: string }
  year: number
  budgetName: string
  budgetStatus: BudgetStatus
  accounts: Account[]
  isEditing: boolean
  canEdit: boolean
}

export function BudgetDetailClient({
  budgetId,
  venue,
  year,
  budgetName,
  budgetStatus,
  accounts,
  isEditing: initialEditing,
  canEdit,
}: BudgetDetailClientProps) {
  const [lines, setLines] = useState<BudgetLine[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(initialEditing)
  const [activeTab, setActiveTab] = useState<string>('dashboard')

  // Dialog per aggiungere riga
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [newLineAccountId, setNewLineAccountId] = useState('')

  // Fetch lines
  const fetchLines = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/budget/${budgetId}/lines`)
      if (!res.ok) throw new Error('Errore nel caricamento')
      const data = await res.json()
      setLines(data.data)
    } catch (error) {
      logger.error('Errore fetch lines', error)
      toast.error('Errore nel caricamento delle righe')
    } finally {
      setLoading(false)
    }
  }, [budgetId])

  useEffect(() => {
    fetchLines()
  }, [fetchLines])

  // Conti disponibili (non ancora usati)
  const availableAccounts = accounts.filter(
    (acc) => !lines.some((l) => l.accountId === acc.id)
  )

  // Raggruppa per tipo
  const ricaviLines = lines.filter((l) => l.account?.type === 'RICAVO')
  const costiLines = lines.filter((l) => l.account?.type === 'COSTO')

  // Calcola totali
  const totalRicavi = ricaviLines.reduce((sum, l) => sum + l.annualTotal, 0)
  const totalCosti = costiLines.reduce((sum, l) => sum + l.annualTotal, 0)
  const totalBudget = totalRicavi + totalCosti

  // Update line value
  const handleValueChange = (lineId: string, month: MonthKey, value: number) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.id === lineId) {
          const updated = { ...line, [month]: value }
          updated.annualTotal = calculateAnnualTotal(updated)
          return updated
        }
        return line
      })
    )
  }

  // Add new line
  const handleAddLine = async () => {
    if (!newLineAccountId) {
      toast.error('Seleziona un conto')
      return
    }

    try {
      const emptyLine = {
        accountId: newLineAccountId,
        ...emptyMonthlyValues(),
      }

      const res = await fetch(`/api/budget/${budgetId}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: [emptyLine] }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Errore nell\'aggiunta')
      }

      toast.success('Riga aggiunta')
      setAddDialogOpen(false)
      setNewLineAccountId('')
      fetchLines()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Errore nell\'aggiunta')
    }
  }

  // Delete line
  const handleDeleteLine = async (accountId: string) => {
    if (!confirm('Eliminare questa riga?')) return

    try {
      const res = await fetch(`/api/budget/${budgetId}/lines?accountId=${accountId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Errore nell\'eliminazione')
      }

      toast.success('Riga eliminata')
      fetchLines()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Errore nell\'eliminazione')
    }
  }

  // Save all changes
  const handleSave = async () => {
    setSaving(true)
    try {
      const linesToSave = lines.map((line) => ({
        accountId: line.accountId,
        jan: line.jan || 0,
        feb: line.feb || 0,
        mar: line.mar || 0,
        apr: line.apr || 0,
        may: line.may || 0,
        jun: line.jun || 0,
        jul: line.jul || 0,
        aug: line.aug || 0,
        sep: line.sep || 0,
        oct: line.oct || 0,
        nov: line.nov || 0,
        dec: line.dec || 0,
        notes: line.notes,
      }))

      const res = await fetch(`/api/budget/${budgetId}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: linesToSave }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Errore nel salvataggio')
      }

      toast.success('Budget salvato')
      setIsEditing(false)
      fetchLines()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  // Render table section
  const renderSection = (title: string, sectionLines: BudgetLine[], type: string) => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span>{title}</span>
          <Badge variant={type === 'RICAVO' ? 'default' : 'secondary'}>
            {formatCurrency(
              sectionLines.reduce((sum, l) => sum + l.annualTotal, 0)
            )}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background z-10 min-w-[200px]">
                  Conto
                </TableHead>
                {MONTH_KEYS.map((m) => (
                  <TableHead key={m} className="text-right min-w-[90px]">
                    {MONTH_LABELS[m]}
                  </TableHead>
                ))}
                <TableHead className="text-right font-bold min-w-[100px]">
                  Totale
                </TableHead>
                {isEditing && <TableHead className="w-[50px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sectionLines.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isEditing ? 15 : 14}
                    className="text-center text-muted-foreground py-4"
                  >
                    Nessun conto {type === 'RICAVO' ? 'ricavo' : 'costo'} definito
                  </TableCell>
                </TableRow>
              ) : (
                sectionLines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="sticky left-0 bg-background z-10 font-medium">
                      <div className="flex flex-col">
                        <span>{line.account?.code}</span>
                        <span className="text-xs text-muted-foreground">
                          {line.account?.name}
                        </span>
                      </div>
                    </TableCell>
                    {MONTH_KEYS.map((m) => (
                      <TableCell key={m} className="text-right p-1">
                        {isEditing ? (
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line[m] || ''}
                            onChange={(e) =>
                              handleValueChange(
                                line.id,
                                m,
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-full text-right h-8"
                          />
                        ) : (
                          <span className={line[m] > 0 ? '' : 'text-muted-foreground'}>
                            {line[m] > 0 ? formatCurrency(line[m]) : '-'}
                          </span>
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-bold">
                      {formatCurrency(line.annualTotal)}
                    </TableCell>
                    {isEditing && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleDeleteLine(line.accountId)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/budget">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{budgetName}</h1>
              <Badge className={BUDGET_STATUS_COLORS[budgetStatus]}>
                {BUDGET_STATUS_LABELS[budgetStatus]}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {venue.name} ({venue.code}) - Anno {year}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit && activeTab === 'editor' && (
            <>
              {isEditing ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsEditing(false)
                      fetchLines()
                    }}
                  >
                    Annulla
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? (
                      <>
                        <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Salvataggio...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Salva
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <Button onClick={() => setIsEditing(true)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Modifica
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex gap-1 p-1 bg-muted/50 rounded-lg h-auto w-fit border-none">
          <TabsTrigger
            value="dashboard"
            className="px-4 py-2 rounded-full data-[state=active]:bg-black data-[state=active]:text-white transition-all shadow-none border-none text-sm font-medium flex items-center gap-2"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger
            value="editor"
            className="px-4 py-2 rounded-full data-[state=active]:bg-black data-[state=active]:text-white transition-all shadow-none border-none text-sm font-medium flex items-center gap-2"
          >
            <TableIcon className="h-4 w-4" />
            Editor Righe
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="mt-6">
          <BudgetDashboard budgetId={budgetId} venueName={venue.name} />
        </TabsContent>

        {/* Editor Tab */}
        <TabsContent value="editor" className="mt-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Totale Ricavi
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(totalRicavi)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {ricaviLines.length} conti
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Totale Costi
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {formatCurrency(totalCosti)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {costiLines.length} conti
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Totale Budget
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(totalBudget)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {lines.length} righe totali
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Add Line Button */}
          {isEditing && availableAccounts.length > 0 && (
            <Button variant="outline" onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Aggiungi Conto
            </Button>
          )}

          {/* Loading */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <>
              {/* Ricavi Section */}
              {renderSection('Ricavi', ricaviLines, 'RICAVO')}

              {/* Costi Section */}
              {renderSection('Costi', costiLines, 'COSTO')}
            </>
          )}

          {/* Add Line Dialog */}
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Aggiungi Conto al Budget</DialogTitle>
                <DialogDescription>
                  Seleziona un conto da aggiungere al budget
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Conto</Label>
                  <Select value={newLineAccountId} onValueChange={setNewLineAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona conto" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          <span className="flex items-center gap-2">
                            <Badge variant={acc.type === 'RICAVO' ? 'default' : 'secondary'} className="text-xs">
                              {acc.type === 'RICAVO' ? 'R' : 'C'}
                            </Badge>
                            {acc.code} - {acc.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                  Annulla
                </Button>
                <Button onClick={handleAddLine} disabled={!newLineAccountId}>
                  Aggiungi
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  )
}
