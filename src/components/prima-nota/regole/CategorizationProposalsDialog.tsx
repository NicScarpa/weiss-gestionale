'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, TrendingDown, TrendingUp } from 'lucide-react'

interface Proposal {
  keyword: string
  direction: 'INFLOW' | 'OUTFLOW'
  count: number
  matchingEntryIds: string[]
}

interface CategorizationProposalsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  venueId: string
  budgetCategories: Array<{ id: string; code: string; name: string; color?: string }>
  onProposalApplied: () => void
}

export function CategorizationProposalsDialog({
  open,
  onOpenChange,
  venueId,
  budgetCategories,
  onProposalApplied,
}: CategorizationProposalsDialogProps) {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedCategories, setSelectedCategories] = useState<Record<number, string>>({})
  const [applyingIndex, setApplyingIndex] = useState<number | null>(null)

  const fetchProposals = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/categorization-rules/proposals?venueId=${venueId}`)
      if (!res.ok) throw new Error('Errore nel caricamento proposte')
      const json = await res.json()
      setProposals(json.proposals || [])
      setSelectedCategories({})
    } catch (error) {
      console.error('Errore caricamento proposte:', error)
      toast.error('Impossibile caricare le proposte')
    } finally {
      setIsLoading(false)
    }
  }, [venueId])

  useEffect(() => {
    if (open) fetchProposals()
  }, [open, fetchProposals])

  const handleApply = async (index: number) => {
    const proposal = proposals[index]
    const categoryId = selectedCategories[index]
    if (!categoryId) return

    setApplyingIndex(index)
    try {
      const res = await fetch('/api/categorization-rules/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: proposal.keyword,
          direction: proposal.direction,
          budgetCategoryId: categoryId,
          matchingEntryIds: proposal.matchingEntryIds,
          venueId,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore applicazione proposta')
      }

      const category = budgetCategories.find(c => c.id === categoryId)
      toast.success(`Regola creata: "${proposal.keyword}" -> ${category?.name || 'categoria'}`)

      // Rimuovi la proposta applicata dalla lista
      setProposals(prev => prev.filter((_, i) => i !== index))
      setSelectedCategories(prev => {
        const next = { ...prev }
        delete next[index]
        return next
      })
      onProposalApplied()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore sconosciuto'
      toast.error(message)
    } finally {
      setApplyingIndex(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[750px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Proposte di categorizzazione</DialogTitle>
          <DialogDescription>
            Movimenti ricorrenti non ancora categorizzati. Assegna una categoria per creare automaticamente una regola.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-8 w-36" />
                <Skeleton className="h-8 w-24" />
              </div>
            ))}
          </div>
        ) : proposals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Nessuna proposta disponibile.</p>
            <p className="text-sm mt-1">Tutti i movimenti ricorrenti sono gia categorizzati.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Se la descrizione contiene</TableHead>
                <TableHead>Tipo movimento</TableHead>
                <TableHead>Risultati</TableHead>
                <TableHead>Assegna la categoria</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {proposals.map((proposal, index) => (
                <TableRow key={`${proposal.keyword}-${proposal.direction}`}>
                  <TableCell>
                    <span className="font-medium text-sm">{proposal.keyword}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {proposal.direction === 'INFLOW' ? (
                        <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <TrendingDown className="h-3.5 w-3.5 text-red-600" />
                      )}
                      <span className="text-sm">
                        {proposal.direction === 'INFLOW' ? 'In entrata' : 'In uscita'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      <Search className="h-3 w-3 mr-1" />
                      {proposal.count} risultati
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={selectedCategories[index] || ''}
                      onValueChange={(value) =>
                        setSelectedCategories(prev => ({ ...prev, [index]: value }))
                      }
                    >
                      <SelectTrigger className="w-[180px] h-8 text-xs">
                        <SelectValue placeholder="Scegli categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        {budgetCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            <div className="flex items-center gap-2">
                              {cat.color && (
                                <div
                                  className="h-3 w-3 rounded-full shrink-0"
                                  style={{ backgroundColor: cat.color }}
                                />
                              )}
                              <span>{cat.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      onClick={() => handleApply(index)}
                      disabled={!selectedCategories[index] || applyingIndex === index}
                    >
                      {applyingIndex === index ? 'Applicando...' : 'Categorizza'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  )
}
