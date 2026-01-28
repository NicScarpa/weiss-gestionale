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
import { DeleteSupplierDialog } from './DeleteSupplierDialog'
import { BulkDeleteSuppliersDialog } from './BulkDeleteSuppliersDialog'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Truck, Plus, Pencil, Trash2, Loader2, Search, X } from 'lucide-react'
import { toast } from 'sonner'

import { logger } from '@/lib/logger'
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
  city: string | null
  province: string | null
  postalCode: string | null
  email: string | null
  iban: string | null
  defaultAccountId: string | null
  defaultAccount: Account | null
  isActive: boolean
}

const initialFormData = {
  name: '',
  vatNumber: '',
  address: '',
  city: '',
  province: '',
  postalCode: '',
  email: '',
  iban: '',
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
  const [selectedSuppliers, setSelectedSuppliers] = useState<Set<string>>(new Set())
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false)

  // Carica lista fornitori
  const fetchSuppliers = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/suppliers?full=true&showOnlyInactive=${showInactive}`)
      if (!res.ok) throw new Error('Errore nel caricamento')
      const data = await res.json()
      setSuppliers(data.suppliers || [])
    } catch (error) {
      logger.error('Errore', error)
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
      logger.error('Errore', error)
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

  // Selezione multipla
  const isAllSelected = filteredSuppliers.length > 0 &&
    filteredSuppliers.every(s => selectedSuppliers.has(s.id))
  const isSomeSelected = filteredSuppliers.some(s => selectedSuppliers.has(s.id))

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedSuppliers(new Set())
    } else {
      setSelectedSuppliers(new Set(filteredSuppliers.map(s => s.id)))
    }
  }

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedSuppliers)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedSuppliers(newSet)
  }

  const clearSelection = () => {
    setSelectedSuppliers(new Set())
  }

  const getSelectedSuppliersList = () => {
    return suppliers.filter(s => selectedSuppliers.has(s.id))
  }

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
      city: supplier.city || '',
      province: supplier.province || '',
      postalCode: supplier.postalCode || '',
      email: supplier.email || '',
      iban: supplier.iban || '',
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
        city: formData.city.trim() || null,
        province: formData.province.trim() || null,
        postalCode: formData.postalCode.trim() || null,
        email: formData.email.trim() || null,
        iban: formData.iban.trim() || null,
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
    } catch (error: unknown) {
      logger.error('Errore', error)
      toast.error(error instanceof Error ? error.message : 'Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  // Callback dopo eliminazione fornitore
  const handleSupplierDeleted = () => {
    toast.success('Fornitore disattivato')
    setIsDeleteDialogOpen(false)
    setSupplierToDelete(null)
    fetchSuppliers()
  }

  // Callback dopo eliminazione multipla
  const handleBulkDeleted = (count: number) => {
    toast.success(`${count} fornitore${count === 1 ? '' : 'i'} disattivat${count === 1 ? 'o' : 'i'}`)
    setIsBulkDeleteDialogOpen(false)
    setSelectedSuppliers(new Set())
    fetchSuppliers()
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

      {/* Barra Selezione */}
      {selectedSuppliers.size > 0 && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">
              {selectedSuppliers.size} fornitore{selectedSuppliers.size === 1 ? '' : 'i'} selezionat{selectedSuppliers.size === 1 ? 'o' : 'i'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              className="h-8 px-2"
            >
              <X className="h-4 w-4 mr-1" />
              Deseleziona
            </Button>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsBulkDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Elimina Selezionati
          </Button>
        </div>
      )}

      {/* Lista Fornitori */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Fornitori ({filteredSuppliers.length})
              </CardTitle>
              <CardDescription>
                Anagrafica fornitori per uscite e fatture
              </CardDescription>
            </div>
            {filteredSuppliers.length > 0 && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="select-all-suppliers"
                  checked={isAllSelected}
                  onCheckedChange={toggleSelectAll}
                  className={isSomeSelected && !isAllSelected ? 'data-[state=checked]:bg-primary/50' : ''}
                />
                <Label htmlFor="select-all-suppliers" className="text-sm cursor-pointer">
                  Seleziona tutti
                </Label>
              </div>
            )}
          </div>
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
                  className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                    selectedSuppliers.has(supplier.id)
                      ? 'bg-primary/10 border border-primary/20'
                      : 'bg-muted/50 hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedSuppliers.has(supplier.id)}
                      onCheckedChange={() => toggleSelect(supplier.id)}
                      aria-label={`Seleziona ${supplier.name}`}
                    />
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{supplier.name}</span>
                        {!supplier.isActive && (
                          <Badge variant="secondary">Inattivo</Badge>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 text-sm text-muted-foreground mt-1">
                        {supplier.vatNumber && (
                          <span className="font-mono">P.IVA: {supplier.vatNumber}</span>
                        )}
                        {(supplier.address || supplier.city) && (
                          <span>
                            {[supplier.address, supplier.postalCode, supplier.city, supplier.province]
                              .filter(Boolean)
                              .join(', ')}
                          </span>
                        )}
                        {supplier.defaultAccount && (
                          <span>
                            Conto: {supplier.defaultAccount.code} - {supplier.defaultAccount.name}
                          </span>
                        )}
                      </div>
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
        <DialogContent className="max-w-2xl">
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

          <div className="grid grid-cols-2 gap-4 py-4">
            {/* Nome */}
            <div className="col-span-2 space-y-2">
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

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                placeholder="amministrazione@fornitore.it"
              />
            </div>

            {/* IBAN */}
            <div className="col-span-2 space-y-2">
              <Label htmlFor="iban">IBAN</Label>
              <Input
                id="iban"
                value={formData.iban}
                onChange={(e) =>
                  setFormData({ ...formData, iban: e.target.value })
                }
                placeholder="IT00 X000 0000 0000 0000 0000 000"
                className="font-mono uppercase"
              />
            </div>

            <div className="col-span-2 border-t my-2" />

            {/* Indirizzo - Via */}
            <div className="col-span-2 space-y-2">
              <Label htmlFor="supplier-address">Indirizzo (Via e Civico)</Label>
              <Input
                id="supplier-address"
                value={formData.address}
                onChange={(e) =>
                  setFormData({ ...formData, address: e.target.value })
                }
                placeholder="Via Roma 1"
              />
            </div>

            {/* Città */}
            <div className="space-y-2">
              <Label htmlFor="city">Città</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) =>
                  setFormData({ ...formData, city: e.target.value })
                }
                placeholder="Milano"
              />
            </div>

            {/* CAP e Provincia */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="postalCode">CAP</Label>
                <Input
                  id="postalCode"
                  value={formData.postalCode}
                  onChange={(e) =>
                    setFormData({ ...formData, postalCode: e.target.value })
                  }
                  placeholder="20100"
                  className="font-mono"
                  maxLength={5}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="province">Provincia</Label>
                <Input
                  id="province"
                  value={formData.province}
                  onChange={(e) =>
                    setFormData({ ...formData, province: e.target.value })
                  }
                  placeholder="MI"
                  className="uppercase"
                  maxLength={2}
                />
              </div>
            </div>

            <div className="col-span-2 border-t my-2" />

            {/* Conto Default */}
            <div className="col-span-2 space-y-2">
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
            <div className="col-span-2 flex items-center justify-between pt-2">
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
      <DeleteSupplierDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        supplier={supplierToDelete}
        onDeleted={handleSupplierDeleted}
      />

      {/* Dialog Eliminazione Multipla */}
      <BulkDeleteSuppliersDialog
        open={isBulkDeleteDialogOpen}
        onOpenChange={setIsBulkDeleteDialogOpen}
        suppliers={getSelectedSuppliersList()}
        onDeleted={handleBulkDeleted}
      />
    </div>
  )
}
