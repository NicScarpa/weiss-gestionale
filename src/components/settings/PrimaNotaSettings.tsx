'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Wallet, Plus, Pencil, Trash2, Loader2, Building2 } from 'lucide-react'
import { toast } from 'sonner'

import { logger } from '@/lib/logger'
interface Venue {
  id: string
  name: string
  code: string
}

interface InitialBalance {
  id: string
  venueId: string
  venue: Venue
  year: number
  cashBalance: number
  bankBalance: number
  notes: string | null
  createdAt: string
  updatedAt: string
}

const currentYear = new Date().getFullYear()

const initialFormData = {
  venueId: '',
  year: currentYear.toString(),
  cashBalance: '0',
  bankBalance: '0',
  notes: '',
}

export function PrimaNotaSettings() {
  const [balances, setBalances] = useState<InitialBalance[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [editingBalance, setEditingBalance] = useState<InitialBalance | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [balanceToDelete, setBalanceToDelete] = useState<InitialBalance | null>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState(initialFormData)

  // Carica venues
  const fetchVenues = async () => {
    try {
      const res = await fetch('/api/venues')
      if (!res.ok) throw new Error('Errore nel caricamento')
      const data = await res.json()
      setVenues(data.venues || [])
    } catch (error) {
      logger.error('Errore', error)
      toast.error('Errore nel caricamento delle sedi')
    }
  }

  // Carica saldi iniziali
  const fetchBalances = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/settings/initial-balances')
      if (!res.ok) throw new Error('Errore nel caricamento')
      const data = await res.json()
      setBalances(data.data || [])
    } catch (error) {
      logger.error('Errore', error)
      toast.error('Errore nel caricamento dei saldi iniziali')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      fetchVenues()
      fetchBalances()
    })
  }, [])

  // Apri dialog per nuovo saldo
  const handleNew = () => {
    setEditingBalance(null)
    setFormData(initialFormData)
    setIsDialogOpen(true)
  }

  // Apri dialog modifica
  const handleEdit = (balance: InitialBalance) => {
    setEditingBalance(balance)
    setFormData({
      venueId: balance.venueId,
      year: balance.year.toString(),
      cashBalance: balance.cashBalance.toString(),
      bankBalance: balance.bankBalance.toString(),
      notes: balance.notes || '',
    })
    setIsDialogOpen(true)
  }

  // Conferma eliminazione
  const handleDeleteConfirm = (balance: InitialBalance) => {
    setBalanceToDelete(balance)
    setIsDeleteDialogOpen(true)
  }

  // Salva saldo
  const handleSave = async () => {
    if (!formData.venueId) {
      toast.error('Seleziona una sede')
      return
    }

    try {
      setSaving(true)

      const payload = {
        venueId: formData.venueId,
        year: parseInt(formData.year),
        cashBalance: parseFloat(formData.cashBalance) || 0,
        bankBalance: parseFloat(formData.bankBalance) || 0,
        notes: formData.notes.trim() || null,
      }

      const res = await fetch('/api/settings/initial-balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Errore nel salvataggio')
      }

      toast.success(editingBalance ? 'Saldo aggiornato' : 'Saldo creato')
      setIsDialogOpen(false)
      setEditingBalance(null)
      fetchBalances()
    } catch (error: unknown) {
      logger.error('Errore', error)
      toast.error(error instanceof Error ? error.message : 'Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  // Elimina saldo
  const handleDelete = async () => {
    if (!balanceToDelete) return

    try {
      setSaving(true)
      const res = await fetch(`/api/settings/initial-balances?id=${balanceToDelete.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Errore nell\'eliminazione')
      }

      toast.success('Saldo eliminato')
      setIsDeleteDialogOpen(false)
      setBalanceToDelete(null)
      fetchBalances()
    } catch (error: unknown) {
      logger.error('Errore', error)
      toast.error(error instanceof Error ? error.message : 'Errore nell\'eliminazione')
    } finally {
      setSaving(false)
    }
  }

  // Formatta valuta
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(value)
  }

  // Genera anni disponibili (5 anni indietro, anno corrente, anno successivo)
  const availableYears = Array.from({ length: 7 }, (_, i) => currentYear - 5 + i)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Controlli */}
      <div className="flex items-center justify-end">
        <Button onClick={handleNew}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Saldo Iniziale
        </Button>
      </div>

      {/* Lista Saldi Iniziali */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Saldi Iniziali ({balances.length})
          </CardTitle>
          <CardDescription>
            Saldi di apertura cassa e banca al 1 gennaio di ogni anno per sede
          </CardDescription>
        </CardHeader>
        <CardContent>
          {balances.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nessun saldo iniziale configurato. Clicca su &quot;Nuovo Saldo Iniziale&quot; per iniziare.
            </p>
          ) : (
            <div className="space-y-2">
              {balances.map((balance) => (
                <div
                  key={balance.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{balance.venue.name}</span>
                        <Badge variant="outline">{balance.year}</Badge>
                      </div>
                      {balance.notes && (
                        <span className="text-sm text-muted-foreground mt-1">
                          {balance.notes}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-right">
                        <div className="text-muted-foreground text-xs">Cassa</div>
                        <div className="font-mono font-medium">
                          {formatCurrency(balance.cashBalance)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-muted-foreground text-xs">Banca</div>
                        <div className="font-mono font-medium">
                          {formatCurrency(balance.bankBalance)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(balance)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteConfirm(balance)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Crea/Modifica */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingBalance ? 'Modifica Saldo Iniziale' : 'Nuovo Saldo Iniziale'}
            </DialogTitle>
            <DialogDescription>
              {editingBalance
                ? 'Modifica i saldi di apertura per questa sede e anno'
                : 'Inserisci i saldi di apertura al 1 gennaio per la sede selezionata'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Sede e Anno */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sede *</Label>
                <Select
                  value={formData.venueId}
                  onValueChange={(v) => setFormData({ ...formData, venueId: v })}
                  disabled={!!editingBalance}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona sede" />
                  </SelectTrigger>
                  <SelectContent>
                    {venues.map((venue) => (
                      <SelectItem key={venue.id} value={venue.id}>
                        {venue.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Anno *</Label>
                <Select
                  value={formData.year}
                  onValueChange={(v) => setFormData({ ...formData, year: v })}
                  disabled={!!editingBalance}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona anno" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableYears.map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Saldi */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cashBalance">Saldo Cassa</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    €
                  </span>
                  <Input
                    id="cashBalance"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.cashBalance}
                    onChange={(e) =>
                      setFormData({ ...formData, cashBalance: e.target.value })
                    }
                    className="pl-7 font-mono"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankBalance">Saldo Banca</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    €
                  </span>
                  <Input
                    id="bankBalance"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.bankBalance}
                    onChange={(e) =>
                      setFormData({ ...formData, bankBalance: e.target.value })
                    }
                    className="pl-7 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Note */}
            <div className="space-y-2">
              <Label htmlFor="notes">Note</Label>
              <Input
                id="notes"
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder="Note opzionali..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={saving}
            >
              Annulla
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvataggio...
                </>
              ) : (
                'Salva'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Conferma Eliminazione */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina Saldo Iniziale</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare il saldo iniziale di{' '}
              <strong>{balanceToDelete?.venue.name}</strong> per l&apos;anno{' '}
              <strong>{balanceToDelete?.year}</strong>?
              <br />
              I movimenti Prima Nota non saranno eliminati, ma i saldi verranno
              ricalcolati senza questo saldo di apertura.

            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={saving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Eliminazione...
                </>
              ) : (
                'Elimina'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
