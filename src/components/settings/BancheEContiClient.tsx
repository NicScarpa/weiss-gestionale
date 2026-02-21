'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Archive, Loader2, Building2, Banknote, Wifi } from 'lucide-react'
import { toast } from 'sonner'

type AccountType = 'CASH' | 'BANK'

interface BankAccount {
  id: string
  name: string
  accountType: AccountType
  bankName: string | null
  iban: string | null
  bic: string | null
  initialBalance: number
  currency: string
  isDefault: boolean
  isActive: boolean
  color: string | null
  notes: string | null
  openBankingReady: boolean
}

const PRESET_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
]

const initialFormData = {
  name: '',
  accountType: 'BANK' as AccountType,
  bankName: '',
  iban: '',
  bic: '',
  initialBalance: 0,
  currency: 'EUR',
  isDefault: false,
  color: PRESET_COLORS[0],
  notes: '',
}

export function BancheEContiClient() {
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null)
  const [deletingAccount, setDeletingAccount] = useState<BankAccount | null>(null)
  const [formData, setFormData] = useState(initialFormData)
  const [activeTab, setActiveTab] = useState<string>('BANK')
  const [showInactive, setShowInactive] = useState(false)

  const fetchAccounts = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (showInactive) params.set('includeInactive', 'true')
      const res = await fetch(`/api/bank-accounts?${params}`)
      if (!res.ok) throw new Error('Errore nel caricamento')
      const data = await res.json()
      setAccounts(data.accounts)
    } catch {
      toast.error('Errore nel caricamento dei conti')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAccounts()
  }, [showInactive]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredAccounts = accounts.filter((a) => a.accountType === activeTab)

  const openCreate = (type: AccountType) => {
    setEditingAccount(null)
    setFormData({ ...initialFormData, accountType: type })
    setDialogOpen(true)
  }

  const openEdit = (account: BankAccount) => {
    setEditingAccount(account)
    setFormData({
      name: account.name,
      accountType: account.accountType,
      bankName: account.bankName || '',
      iban: account.iban || '',
      bic: account.bic || '',
      initialBalance: account.initialBalance,
      currency: account.currency,
      isDefault: account.isDefault,
      color: account.color || PRESET_COLORS[0],
      notes: account.notes || '',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Il nome è obbligatorio')
      return
    }

    try {
      setSaving(true)
      const payload = {
        ...formData,
        bankName: formData.bankName || null,
        iban: formData.iban || null,
        bic: formData.bic || null,
        notes: formData.notes || null,
        ...(editingAccount && { id: editingAccount.id }),
      }

      const res = await fetch('/api/bank-accounts', {
        method: editingAccount ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nel salvataggio')
      }

      toast.success(editingAccount ? 'Conto aggiornato' : 'Conto creato')
      setDialogOpen(false)
      fetchAccounts()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  const handleArchive = async () => {
    if (!deletingAccount) return
    try {
      const res = await fetch(`/api/bank-accounts?id=${deletingAccount.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Errore nell\'archiviazione')
      toast.success('Conto archiviato')
      setDeleteDialogOpen(false)
      setDeletingAccount(null)
      fetchAccounts()
    } catch {
      toast.error('Errore nell\'archiviazione del conto')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filtri */}
      <div className="flex items-center justify-between">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="BANK" className="gap-2">
              <Building2 className="h-4 w-4" />
              Conti Bancari
              <Badge variant="secondary" className="ml-1">
                {accounts.filter((a) => a.accountType === 'BANK' && a.isActive).length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="CASH" className="gap-2">
              <Banknote className="h-4 w-4" />
              Conti Cassa
              <Badge variant="secondary" className="ml-1">
                {accounts.filter((a) => a.accountType === 'CASH' && a.isActive).length}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={showInactive}
              onCheckedChange={setShowInactive}
              id="show-inactive"
            />
            <Label htmlFor="show-inactive" className="text-sm text-muted-foreground">
              Mostra archiviati
            </Label>
          </div>
          <Button onClick={() => openCreate(activeTab as AccountType)}>
            <Plus className="h-4 w-4 mr-2" />
            Nuovo conto
          </Button>
        </div>
      </div>

      {/* Lista conti */}
      {filteredAccounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              {activeTab === 'BANK' ? (
                <Building2 className="h-6 w-6 text-muted-foreground" />
              ) : (
                <Banknote className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <h3 className="text-lg font-medium mb-1">
              Nessun conto {activeTab === 'BANK' ? 'bancario' : 'cassa'}
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              Aggiungi il tuo primo conto {activeTab === 'BANK' ? 'bancario' : 'cassa'} per iniziare.
            </p>
            <Button onClick={() => openCreate(activeTab as AccountType)}>
              <Plus className="h-4 w-4 mr-2" />
              Aggiungi conto
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAccounts.map((account) => (
            <Card
              key={account.id}
              className={`relative overflow-hidden transition-opacity ${!account.isActive ? 'opacity-50' : ''}`}
            >
              {account.color && (
                <div
                  className="absolute top-0 left-0 w-1 h-full"
                  style={{ backgroundColor: account.color }}
                />
              )}
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{account.name}</CardTitle>
                    {account.isDefault && (
                      <Badge variant="default" className="text-xs">Default</Badge>
                    )}
                    {!account.isActive && (
                      <Badge variant="outline" className="text-xs">Archiviato</Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(account)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {account.isActive && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => { setDeletingAccount(account); setDeleteDialogOpen(true) }}
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {account.accountType === 'BANK' && account.bankName && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Banca</span>
                    <span className="font-medium">{account.bankName}</span>
                  </div>
                )}
                {account.accountType === 'BANK' && account.iban && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IBAN</span>
                    <span className="font-mono text-xs">{account.iban}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Saldo iniziale</span>
                  <span className="font-medium">
                    {new Intl.NumberFormat('it-IT', { style: 'currency', currency: account.currency }).format(account.initialBalance)}
                  </span>
                </div>
                {account.notes && (
                  <p className="text-xs text-muted-foreground pt-1 border-t">{account.notes}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Open Banking Placeholder */}
      {activeTab === 'BANK' && (
        <Card className="border-dashed">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                <Wifi className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <CardTitle className="text-base">Open Banking</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Connetti i tuoi conti bancari per importare automaticamente i movimenti.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="text-xs">Coming Soon</Badge>
          </CardContent>
        </Card>
      )}

      {/* Dialog crea/modifica */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingAccount ? 'Modifica conto' : 'Nuovo conto'}
            </DialogTitle>
            <DialogDescription>
              {formData.accountType === 'BANK'
                ? 'Inserisci i dati del conto bancario.'
                : 'Inserisci i dati del conto cassa.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={formData.accountType === 'BANK' ? 'es. Conto corrente principale' : 'es. Cassa principale'}
              />
            </div>

            {!editingAccount && (
              <div className="space-y-2">
                <Label>Tipo conto</Label>
                <Select
                  value={formData.accountType}
                  onValueChange={(v) => setFormData({ ...formData, accountType: v as AccountType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BANK">Conto Bancario</SelectItem>
                    <SelectItem value="CASH">Conto Cassa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {formData.accountType === 'BANK' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="bankName">Nome banca</Label>
                  <Input
                    id="bankName"
                    value={formData.bankName}
                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    placeholder="es. Intesa Sanpaolo"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="iban">IBAN</Label>
                  <Input
                    id="iban"
                    value={formData.iban}
                    onChange={(e) => setFormData({ ...formData, iban: e.target.value.toUpperCase() })}
                    placeholder="IT60X0542811101000000123456"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bic">BIC / SWIFT</Label>
                  <Input
                    id="bic"
                    value={formData.bic}
                    onChange={(e) => setFormData({ ...formData, bic: e.target.value.toUpperCase() })}
                    placeholder="BCITITMM"
                    className="font-mono"
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="initialBalance">Saldo iniziale</Label>
              <Input
                id="initialBalance"
                type="number"
                step="0.01"
                value={formData.initialBalance}
                onChange={(e) => setFormData({ ...formData, initialBalance: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div className="space-y-2">
              <Label>Colore</Label>
              <div className="flex gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${formData.color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setFormData({ ...formData, color: c })}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Note</Label>
              <Input
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Note opzionali"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="isDefault">Conto predefinito</Label>
              <Switch
                id="isDefault"
                checked={formData.isDefault}
                onCheckedChange={(v) => setFormData({ ...formData, isDefault: v })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingAccount ? 'Salva' : 'Crea'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog conferma archiviazione */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archivia conto</AlertDialogTitle>
            <AlertDialogDescription>
              Vuoi archiviare il conto &quot;{deletingAccount?.name}&quot;? Il conto non verrà eliminato ma non sarà più visibile nelle operazioni quotidiane.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive}>
              Archivia
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
