'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Plus, Pencil, Trash2, Loader2, Search, TrendingUp, TrendingDown, Wallet, CreditCard } from 'lucide-react'
import { toast } from 'sonner'

import { logger } from '@/lib/logger'
type AccountType = 'RICAVO' | 'COSTO' | 'ATTIVO' | 'PASSIVO'

interface Account {
  id: string
  code: string
  name: string
  type: AccountType
  category: string | null
  parentId: string | null
  parent: {
    id: string
    code: string
    name: string
  } | null
  isActive: boolean
  _count: {
    expenses: number
    journalEntries: number
  }
}

const ACCOUNT_TYPES: { value: AccountType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'RICAVO', label: 'Ricavi', icon: TrendingUp },
  { value: 'COSTO', label: 'Costi', icon: TrendingDown },
  { value: 'ATTIVO', label: 'Attivita', icon: Wallet },
  { value: 'PASSIVO', label: 'Passivita', icon: CreditCard },
]

const initialFormData = {
  code: '',
  name: '',
  type: 'COSTO' as AccountType,
  category: '',
  parentId: '',
  isActive: true,
}

export function AccountManagement() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null)
  const [saving, setSaving] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<AccountType>('COSTO')
  const [formData, setFormData] = useState(initialFormData)

  // Carica lista conti
  const fetchAccounts = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/accounts?full=true&includeInactive=${showInactive}`)
      if (!res.ok) throw new Error('Errore nel caricamento')
      const data = await res.json()
      setAccounts(data.accounts || [])
    } catch (error) {
      logger.error('Errore', error)
      toast.error('Errore nel caricamento dei conti')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    queueMicrotask(() => fetchAccounts())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive])

  // Filtra conti per tipo e ricerca
  const filteredAccounts = accounts.filter(
    (a) =>
      a.type === activeTab &&
      (a.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.name.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  // Conti per select parent (solo stesso tipo)
  const parentAccounts = accounts.filter(
    (a) => a.type === formData.type && a.isActive && a.id !== editingAccount?.id
  )

  // Conta per tipo
  const countByType = (type: AccountType) =>
    accounts.filter((a) => a.type === type).length

  // Apri dialog per nuovo conto
  const handleNew = () => {
    setEditingAccount(null)
    setFormData({ ...initialFormData, type: activeTab })
    setIsDialogOpen(true)
  }

  // Apri dialog modifica
  const handleEdit = (account: Account) => {
    setEditingAccount(account)
    setFormData({
      code: account.code,
      name: account.name,
      type: account.type,
      category: account.category || '',
      parentId: account.parentId || '',
      isActive: account.isActive,
    })
    setIsDialogOpen(true)
  }

  // Conferma eliminazione
  const handleDeleteConfirm = (account: Account) => {
    setAccountToDelete(account)
    setIsDeleteDialogOpen(true)
  }

  // Salva conto
  const handleSave = async () => {
    if (!formData.code.trim() || !formData.name.trim()) {
      toast.error('Codice e nome sono obbligatori')
      return
    }

    try {
      setSaving(true)

      const payload = {
        ...(editingAccount && { id: editingAccount.id }),
        code: formData.code.trim(),
        name: formData.name.trim(),
        type: formData.type,
        category: formData.category.trim() || null,
        parentId: formData.parentId || null,
        isActive: formData.isActive,
      }

      const res = await fetch('/api/accounts', {
        method: editingAccount ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Errore nel salvataggio')
      }

      toast.success(editingAccount ? 'Conto aggiornato' : 'Conto creato')
      setIsDialogOpen(false)
      setEditingAccount(null)
      fetchAccounts()
    } catch (error: unknown) {
      logger.error('Errore', error)
      toast.error(error instanceof Error ? error.message : 'Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  // Elimina conto
  const handleDelete = async () => {
    if (!accountToDelete) return

    try {
      setSaving(true)
      const res = await fetch(`/api/accounts?id=${accountToDelete.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Errore nell\'eliminazione')
      }

      const result = await res.json()
      toast.success(result.message)
      setIsDeleteDialogOpen(false)
      setAccountToDelete(null)
      fetchAccounts()
    } catch (error: unknown) {
      logger.error('Errore', error)
      toast.error(error instanceof Error ? error.message : 'Errore nell\'eliminazione')
    } finally {
      setSaving(false)
    }
  }

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
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca conto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="show-inactive-accounts"
              checked={showInactive}
              onCheckedChange={setShowInactive}
            />
            <Label htmlFor="show-inactive-accounts" className="text-sm">
              Mostra inattivi
            </Label>
          </div>
        </div>
        <Button onClick={handleNew}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Conto
        </Button>
      </div>

      {/* Tabs per tipo */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AccountType)}>
        <TabsList className="grid w-full grid-cols-4">
          {ACCOUNT_TYPES.map((type) => {
            const Icon = type.icon
            return (
              <TabsTrigger key={type.value} value={type.value} className="gap-2">
                <Icon className="h-4 w-4" />
                {type.label} ({countByType(type.value)})
              </TabsTrigger>
            )
          })}
        </TabsList>

        {ACCOUNT_TYPES.map((type) => (
          <TabsContent key={type.value} value={type.value}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <type.icon className="h-5 w-5" />
                  {type.label} ({filteredAccounts.length})
                </CardTitle>
                <CardDescription>
                  {type.value === 'RICAVO' && 'Conti per ricavi e vendite'}
                  {type.value === 'COSTO' && 'Conti per costi e spese'}
                  {type.value === 'ATTIVO' && 'Conti patrimoniali attivi'}
                  {type.value === 'PASSIVO' && 'Conti patrimoniali passivi'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filteredAccounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {searchQuery
                      ? 'Nessun conto trovato'
                      : `Nessun conto di tipo ${type.label.toLowerCase()} configurato`}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {filteredAccounts.map((account) => (
                      <div
                        key={account.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-xs">
                              {account.code}
                            </Badge>
                            <span className="font-medium">{account.name}</span>
                            {!account.isActive && (
                              <Badge variant="secondary">Inattivo</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            {account.category && (
                              <span>Categoria: {account.category}</span>
                            )}
                            {account.parent && (
                              <span>
                                Padre: {account.parent.code} - {account.parent.name}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-sm text-muted-foreground">
                            {account._count.journalEntries > 0 && (
                              <span>{account._count.journalEntries} movimenti</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(account)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteConfirm(account)}
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
          </TabsContent>
        ))}
      </Tabs>

      {/* Dialog Crea/Modifica */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingAccount ? 'Modifica Conto' : 'Nuovo Conto'}
            </DialogTitle>
            <DialogDescription>
              {editingAccount
                ? 'Modifica le informazioni del conto'
                : 'Inserisci i dati del nuovo conto'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Codice e Nome */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="account-code">Codice *</Label>
                <Input
                  id="account-code"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value })
                  }
                  placeholder="es. 601"
                  className="font-mono"
                  maxLength={20}
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="account-name">Nome *</Label>
                <Input
                  id="account-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="es. Acquisti Merce"
                />
              </div>
            </div>

            {/* Tipo */}
            <div className="space-y-2">
              <Label htmlFor="account-type">Tipo *</Label>
              <Select
                value={formData.type}
                onValueChange={(value: AccountType) =>
                  setFormData({ ...formData, type: value, parentId: '' })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Categoria */}
            <div className="space-y-2">
              <Label htmlFor="account-category">Categoria</Label>
              <Input
                id="account-category"
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                placeholder="es. Materie Prime"
              />
              <p className="text-xs text-muted-foreground">
                Raggruppamento per report
              </p>
            </div>

            {/* Conto Padre */}
            <div className="space-y-2">
              <Label htmlFor="account-parent">Conto Padre</Label>
              <Select
                value={formData.parentId || '__none__'}
                onValueChange={(value) =>
                  setFormData({ ...formData, parentId: value === '__none__' ? '' : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nessuno (conto principale)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nessuno</SelectItem>
                  {parentAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Stato Attivo */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Stato</Label>
                <p className="text-sm text-muted-foreground">
                  {formData.isActive ? 'Attivo' : 'Inattivo'}
                </p>
              </div>
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isActive: checked })
                }
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
            <AlertDialogTitle>Elimina Conto</AlertDialogTitle>
            <AlertDialogDescription>
              {accountToDelete?._count.journalEntries &&
              accountToDelete._count.journalEntries > 0 ? (
                <>
                  Il conto <strong>{accountToDelete?.code} - {accountToDelete?.name}</strong> ha{' '}
                  {accountToDelete?._count.journalEntries} movimenti associati.
                  Verra disattivato invece che eliminato.
                </>
              ) : (
                <>
                  Sei sicuro di voler eliminare il conto{' '}
                  <strong>{accountToDelete?.code} - {accountToDelete?.name}</strong>?
                  Questa azione non puo essere annullata.
                </>
              )}
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
              ) : accountToDelete?._count.journalEntries &&
                accountToDelete._count.journalEntries > 0 ? (
                'Disattiva'
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
