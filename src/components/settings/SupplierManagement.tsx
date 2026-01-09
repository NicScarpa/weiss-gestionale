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
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Truck, Plus, Pencil, Trash2, Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'

interface Account {
  id: string
  code: string
  name: string
}

interface Supplier {
  id: string
  name: string
  vatNumber: string | null
  address: string | null
  defaultAccountId: string | null
  defaultAccount: Account | null
  isActive: boolean
}

const initialFormData = {
  name: '',
  vatNumber: '',
  address: '',
  defaultAccountId: 'none',
  isActive: true,
}

export function SupplierManagement() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null)
  const [saving, setSaving] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [formData, setFormData] = useState(initialFormData)

  // Carica lista fornitori
  const fetchSuppliers = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/suppliers?full=true&includeInactive=${showInactive}`)
      if (!res.ok) throw new Error('Errore nel caricamento')
      const data = await res.json()
      setSuppliers(data.suppliers || [])
    } catch (error) {
      console.error('Errore:', error)
      toast.error('Errore nel caricamento dei fornitori')
    } finally {
      setLoading(false)
    }
  }

  // Carica conti per select
  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounts?type=COSTO')
      if (!res.ok) throw new Error('Errore nel caricamento conti')
      const data = await res.json()
      setAccounts(data.accounts || [])
    } catch (error) {
      console.error('Errore:', error)
    }
  }

  useEffect(() => {
    fetchSuppliers()
    fetchAccounts()
  }, [showInactive])

  // Filtra fornitori per ricerca
  const filteredSuppliers = suppliers.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.vatNumber?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Apri dialog per nuovo fornitore
  const handleNew = () => {
    setEditingSupplier(null)
    setFormData(initialFormData)
    setIsDialogOpen(true)
  }

  // Apri dialog modifica
  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier)
    setFormData({
      name: supplier.name,
      vatNumber: supplier.vatNumber || '',
      address: supplier.address || '',
      defaultAccountId: supplier.defaultAccountId || 'none',
      isActive: supplier.isActive,
    })
    setIsDialogOpen(true)
  }

  // Conferma eliminazione
  const handleDeleteConfirm = (supplier: Supplier) => {
    setSupplierToDelete(supplier)
    setIsDeleteDialogOpen(true)
  }

  // Salva fornitore
  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Nome obbligatorio')
      return
    }

    try {
      setSaving(true)

      const payload = {
        ...(editingSupplier && { id: editingSupplier.id }),
        name: formData.name.trim(),
        vatNumber: formData.vatNumber.trim() || null,
        address: formData.address.trim() || null,
        defaultAccountId: formData.defaultAccountId === 'none' ? null : formData.defaultAccountId,
        isActive: formData.isActive,
      }

      const res = await fetch('/api/suppliers', {
        method: editingSupplier ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Errore nel salvataggio')
      }

      toast.success(editingSupplier ? 'Fornitore aggiornato' : 'Fornitore creato')
      setIsDialogOpen(false)
      setEditingSupplier(null)
      fetchSuppliers()
    } catch (error: any) {
      console.error('Errore:', error)
      toast.error(error.message || 'Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  // Elimina fornitore
  const handleDelete = async () => {
    if (!supplierToDelete) return

    try {
      setSaving(true)
      const res = await fetch(`/api/suppliers?id=${supplierToDelete.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Errore nell\'eliminazione')
      }

      toast.success('Fornitore disattivato')
      setIsDeleteDialogOpen(false)
      setSupplierToDelete(null)
      fetchSuppliers()
    } catch (error: any) {
      console.error('Errore:', error)
      toast.error(error.message || 'Errore nell\'eliminazione')
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
              placeholder="Cerca fornitore..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="show-inactive-suppliers"
              checked={showInactive}
              onCheckedChange={setShowInactive}
            />
            <Label htmlFor="show-inactive-suppliers" className="text-sm">
              Mostra inattivi
            </Label>
          </div>
        </div>
        <Button onClick={handleNew}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Fornitore
        </Button>
      </div>

      {/* Lista Fornitori */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Fornitori ({filteredSuppliers.length})
          </CardTitle>
          <CardDescription>
            Anagrafica fornitori per uscite e fatture
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredSuppliers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {searchQuery ? 'Nessun fornitore trovato' : 'Nessun fornitore configurato'}
            </p>
          ) : (
            <div className="space-y-2">
              {filteredSuppliers.map((supplier) => (
                <div
                  key={supplier.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{supplier.name}</span>
                      {!supplier.isActive && (
                        <Badge variant="secondary">Inattivo</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      {supplier.vatNumber && (
                        <span className="font-mono">P.IVA: {supplier.vatNumber}</span>
                      )}
                      {supplier.defaultAccount && (
                        <span>
                          Conto: {supplier.defaultAccount.code} - {supplier.defaultAccount.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(supplier)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteConfirm(supplier)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
              {editingSupplier ? 'Modifica Fornitore' : 'Nuovo Fornitore'}
            </DialogTitle>
            <DialogDescription>
              {editingSupplier
                ? 'Modifica le informazioni del fornitore'
                : 'Inserisci i dati del nuovo fornitore'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Nome */}
            <div className="space-y-2">
              <Label htmlFor="supplier-name">Nome *</Label>
              <Input
                id="supplier-name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="es. Metro Italia"
              />
            </div>

            {/* P.IVA */}
            <div className="space-y-2">
              <Label htmlFor="vatNumber">Partita IVA</Label>
              <Input
                id="vatNumber"
                value={formData.vatNumber}
                onChange={(e) =>
                  setFormData({ ...formData, vatNumber: e.target.value })
                }
                placeholder="es. 12345678901"
                className="font-mono"
              />
            </div>

            {/* Indirizzo */}
            <div className="space-y-2">
              <Label htmlFor="supplier-address">Indirizzo</Label>
              <Input
                id="supplier-address"
                value={formData.address}
                onChange={(e) =>
                  setFormData({ ...formData, address: e.target.value })
                }
                placeholder="Via Roma 1, Milano"
              />
            </div>

            {/* Conto Default */}
            <div className="space-y-2">
              <Label htmlFor="defaultAccount">Conto di Costo Default</Label>
              <Select
                value={formData.defaultAccountId}
                onValueChange={(value) =>
                  setFormData({ ...formData, defaultAccountId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona conto..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessuno</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Conto utilizzato automaticamente nelle uscite
              </p>
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
            <AlertDialogTitle>Disattiva Fornitore</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler disattivare il fornitore{' '}
              <strong>{supplierToDelete?.name}</strong>?
              Il fornitore non sara piu visibile nelle selezioni.
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
                  Disattivazione...
                </>
              ) : (
                'Disattiva'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
