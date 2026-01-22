'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Plus, Trash2, Edit, GripVertical, Wand2, ChevronRight, Loader2, Link2 } from 'lucide-react'
import { AccountMappingManager } from './AccountMappingManager'

import { logger } from '@/lib/logger'
interface BudgetCategory {
  id: string
  code: string
  name: string
  categoryType: 'REVENUE' | 'COST' | 'KPI' | 'TAX' | 'INVESTMENT' | 'VAT'
  color: string | null
  icon: string | null
  benchmarkPercentage: number | null
  benchmarkComparison: 'LESS_THAN' | 'GREATER_THAN' | 'EQUAL'
  alertThresholdPercent: number | null
  description: string | null
  isSystem: boolean
  isActive: boolean
  parentId: string | null
  displayOrder: number
  parent?: { id: string; code: string; name: string } | null
  children?: BudgetCategory[]
  accountMappings?: Array<{
    account: { id: string; code: string; name: string; type: string }
    includeInBudget: boolean
  }>
  _count?: { accountMappings: number; budgetLines: number }
}

interface Account {
  id: string
  code: string
  name: string
  type: string
  category: string | null
}

interface Venue {
  id: string
  name: string
  code: string
}

const CATEGORY_TYPE_LABELS: Record<string, string> = {
  REVENUE: 'Ricavi',
  COST: 'Costi',
  KPI: 'KPI',
  TAX: 'Imposte',
  INVESTMENT: 'Investimenti',
  VAT: 'IVA',
}

const CATEGORY_TYPE_COLORS: Record<string, string> = {
  REVENUE: 'bg-green-100 text-green-800',
  COST: 'bg-red-100 text-red-800',
  KPI: 'bg-blue-100 text-blue-800',
  TAX: 'bg-purple-100 text-purple-800',
  INVESTMENT: 'bg-amber-100 text-amber-800',
  VAT: 'bg-gray-100 text-gray-800',
}

export function BudgetCategoryManagement() {
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [hierarchy, setHierarchy] = useState<BudgetCategory[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [selectedVenueId, setSelectedVenueId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editCategory, setEditCategory] = useState<BudgetCategory | null>(null)
  const [unmappedAccounts, setUnmappedAccounts] = useState<Account[]>([])

  // Form state
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    categoryType: 'COST' as BudgetCategory['categoryType'],
    parentId: '',
    color: '#3B82F6',
    benchmarkPercentage: '',
    benchmarkComparison: 'LESS_THAN' as BudgetCategory['benchmarkComparison'],
    alertThresholdPercent: '10',
    description: '',
  })

  useEffect(() => {
    fetchVenues()
  }, [])

  useEffect(() => {
    if (selectedVenueId) {
      fetchCategories()
      fetchUnmappedAccounts()
    }
  }, [selectedVenueId])

  const fetchVenues = async () => {
    try {
      const res = await fetch('/api/venues')
      const data = await res.json()
      // API returns { venues: [...] } or array directly
      const venuesList = Array.isArray(data) ? data : (data.venues || [])
      setVenues(venuesList)
      if (venuesList.length > 0 && !selectedVenueId) {
        setSelectedVenueId(venuesList[0].id)
      }
    } catch (error) {
      logger.error('Errore caricamento sedi', error)
      setVenues([])
    }
  }

  const fetchCategories = async () => {
    if (!selectedVenueId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/budget-categories?venueId=${selectedVenueId}&includeInactive=true`)
      const data = await res.json()
      setCategories(data.categories || [])
      setHierarchy(data.hierarchy || [])
    } catch (error) {
      logger.error('Errore caricamento categorie', error)
      toast.error('Impossibile caricare le categorie')
    } finally {
      setLoading(false)
    }
  }

  const fetchUnmappedAccounts = async () => {
    if (!selectedVenueId) return
    try {
      const res = await fetch(`/api/budget-categories/mappings?venueId=${selectedVenueId}&unmappedOnly=true`)
      const data = await res.json()
      setUnmappedAccounts(data.unmappedAccounts || [])
    } catch (error) {
      logger.error('Errore caricamento conti', error)
    }
  }

  const seedCategories = async () => {
    if (!selectedVenueId) return
    setSeeding(true)
    try {
      const res = await fetch('/api/budget-categories/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId: selectedVenueId, skipExisting: false }),
      })
      const data = await res.json()

      if (res.ok) {
        toast.success(`${data.created?.length || 0} categorie create con successo`)
        fetchCategories()
      } else {
        throw new Error(data.error)
      }
    } catch (error) {
      toast.error('Impossibile creare le categorie predefinite')
    } finally {
      setSeeding(false)
    }
  }

  const handleSubmit = async () => {
    if (!selectedVenueId) return

    try {
      const payload = {
        venueId: selectedVenueId,
        code: formData.code,
        name: formData.name,
        categoryType: formData.categoryType,
        parentId: formData.parentId || null,
        color: formData.color,
        benchmarkPercentage: formData.benchmarkPercentage ? parseFloat(formData.benchmarkPercentage) : null,
        benchmarkComparison: formData.benchmarkComparison,
        alertThresholdPercent: formData.alertThresholdPercent ? parseFloat(formData.alertThresholdPercent) : 10,
        description: formData.description || null,
      }

      const url = editCategory
        ? `/api/budget-categories/${editCategory.id}`
        : '/api/budget-categories'

      const res = await fetch(url, {
        method: editCategory ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (res.ok) {
        toast.success(`${formData.name} salvata con successo`)
        setShowAddDialog(false)
        setEditCategory(null)
        resetForm()
        fetchCategories()
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      toast.error(error.message || 'Impossibile salvare la categoria')
    }
  }

  const handleDelete = async (category: BudgetCategory) => {
    if (category.isSystem) {
      toast.error('Le categorie di sistema non possono essere eliminate')
      return
    }

    if (!confirm(`Eliminare la categoria "${category.name}"?`)) return

    try {
      const res = await fetch(`/api/budget-categories/${category.id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        toast.success(`${category.name} eliminata con successo`)
        fetchCategories()
      } else {
        const data = await res.json()
        throw new Error(data.error)
      }
    } catch (error: any) {
      toast.error(error.message || 'Impossibile eliminare la categoria')
    }
  }

  const openEditDialog = (category: BudgetCategory) => {
    setEditCategory(category)
    setFormData({
      code: category.code,
      name: category.name,
      categoryType: category.categoryType,
      parentId: category.parentId || '',
      color: category.color || '#3B82F6',
      benchmarkPercentage: category.benchmarkPercentage?.toString() || '',
      benchmarkComparison: category.benchmarkComparison,
      alertThresholdPercent: category.alertThresholdPercent?.toString() || '10',
      description: category.description || '',
    })
    setShowAddDialog(true)
  }

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      categoryType: 'COST',
      parentId: '',
      color: '#3B82F6',
      benchmarkPercentage: '',
      benchmarkComparison: 'LESS_THAN',
      alertThresholdPercent: '10',
      description: '',
    })
  }

  const renderCategoryItem = (category: BudgetCategory, depth = 0) => (
    <div key={category.id} className={`border-b last:border-b-0 ${depth > 0 ? 'ml-6 border-l pl-4' : ''}`}>
      <div className="flex items-center justify-between py-3 hover:bg-muted/50 px-2 rounded">
        <div className="flex items-center gap-3">
          <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
          {category.color && (
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: category.color }}
            />
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{category.name}</span>
              <Badge variant="outline" className="text-xs">{category.code}</Badge>
              <Badge className={`text-xs ${CATEGORY_TYPE_COLORS[category.categoryType]}`}>
                {CATEGORY_TYPE_LABELS[category.categoryType]}
              </Badge>
              {category.isSystem && (
                <Badge variant="secondary" className="text-xs">Sistema</Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              {category.benchmarkPercentage && (
                <span>
                  Target: {category.benchmarkPercentage}%
                  {category.benchmarkComparison === 'LESS_THAN' ? ' max' : ' min'}
                </span>
              )}
              {category._count && (
                <span className="ml-3">
                  {category._count.accountMappings} conti mappati
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => openEditDialog(category)}
          >
            <Edit className="h-4 w-4" />
          </Button>
          {!category.isSystem && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDelete(category)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      </div>
      {category.children && category.children.length > 0 && (
        <div className="pl-4">
          {category.children.map(child => renderCategoryItem(child, depth + 1))}
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      <Tabs defaultValue="categories" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="categories" className="flex items-center gap-2">
            <Wand2 className="h-4 w-4" />
            Categorie
          </TabsTrigger>
          <TabsTrigger value="mapping" className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Mapping Conti
          </TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Categorie Budget</CardTitle>
                  <CardDescription>
                    Configura le categorie per raggruppare i conti nel budget
                  </CardDescription>
                </div>
                <div className="flex items-center gap-4">
                  <Select value={selectedVenueId} onValueChange={setSelectedVenueId}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Seleziona sede" />
                    </SelectTrigger>
                    <SelectContent>
                      {venues.map(venue => (
                        <SelectItem key={venue.id} value={venue.id}>
                          {venue.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-12">
              <Wand2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Nessuna categoria configurata</h3>
              <p className="text-muted-foreground mb-4">
                Inizia con le categorie predefinite o creane di nuove
              </p>
              <div className="flex items-center justify-center gap-4">
                <Button onClick={seedCategories} disabled={seeding}>
                  {seeding ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creazione...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4 mr-2" />
                      Crea categorie predefinite
                    </>
                  )}
                </Button>
                <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline" onClick={() => { resetForm(); setEditCategory(null); }}>
                      <Plus className="h-4 w-4 mr-2" />
                      Crea manualmente
                    </Button>
                  </DialogTrigger>
                </Dialog>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {categories.length} categorie configurate
                  {unmappedAccounts.length > 0 && (
                    <span className="text-amber-600 ml-2">
                      ({unmappedAccounts.length} conti non mappati)
                    </span>
                  )}
                </p>
                <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                  <DialogTrigger asChild>
                    <Button onClick={() => { resetForm(); setEditCategory(null); }}>
                      <Plus className="h-4 w-4 mr-2" />
                      Nuova categoria
                    </Button>
                  </DialogTrigger>
                </Dialog>
              </div>

              <Tabs defaultValue="hierarchy" className="w-full">
                <TabsList>
                  <TabsTrigger value="hierarchy">Vista gerarchica</TabsTrigger>
                  <TabsTrigger value="list">Lista completa</TabsTrigger>
                </TabsList>

                <TabsContent value="hierarchy" className="border rounded-lg mt-4">
                  {hierarchy.map(cat => renderCategoryItem(cat))}
                </TabsContent>

                <TabsContent value="list" className="mt-4">
                  <div className="border rounded-lg">
                    {categories
                      .sort((a, b) => a.displayOrder - b.displayOrder)
                      .map(cat => (
                        <div key={cat.id} className="flex items-center justify-between p-3 border-b last:border-b-0 hover:bg-muted/50">
                          <div className="flex items-center gap-3">
                            {cat.color && (
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: cat.color }}
                              />
                            )}
                            <span className="font-medium">{cat.name}</span>
                            <Badge variant="outline" className="text-xs">{cat.code}</Badge>
                            {cat.parent && (
                              <span className="text-xs text-muted-foreground">
                                in {cat.parent.name}
                              </span>
                            )}
                          </div>
                          <Badge className={`text-xs ${CATEGORY_TYPE_COLORS[cat.categoryType]}`}>
                            {CATEGORY_TYPE_LABELS[cat.categoryType]}
                          </Badge>
                        </div>
                      ))}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mapping" className="mt-4">
          <AccountMappingManager />
        </TabsContent>
      </Tabs>

      {/* Dialog per aggiungere/modificare categoria */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editCategory ? 'Modifica categoria' : 'Nuova categoria'}
            </DialogTitle>
            <DialogDescription>
              {editCategory
                ? 'Modifica i dettagli della categoria budget'
                : 'Crea una nuova categoria per raggruppare i conti'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">Codice</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase().replace(/\s+/g, '_') })}
                  placeholder="FOOD_COST"
                  disabled={editCategory?.isSystem}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Food Cost"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="categoryType">Tipo</Label>
                <Select
                  value={formData.categoryType}
                  onValueChange={(v) => setFormData({ ...formData, categoryType: v as any })}
                  disabled={editCategory?.isSystem}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REVENUE">Ricavi</SelectItem>
                    <SelectItem value="COST">Costi</SelectItem>
                    <SelectItem value="KPI">KPI</SelectItem>
                    <SelectItem value="TAX">Imposte</SelectItem>
                    <SelectItem value="INVESTMENT">Investimenti</SelectItem>
                    <SelectItem value="VAT">IVA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="parentId">Categoria padre</Label>
                <Select
                  value={formData.parentId}
                  onValueChange={(v) => setFormData({ ...formData, parentId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Nessuna (root)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nessuna (root)</SelectItem>
                    {categories
                      .filter(c => !c.parentId && c.id !== editCategory?.id)
                      .map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="color">Colore</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-10 h-10 rounded border cursor-pointer"
                  />
                  <Input
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="flex-1"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="benchmark">Benchmark %</Label>
                <Input
                  id="benchmark"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={formData.benchmarkPercentage}
                  onChange={(e) => setFormData({ ...formData, benchmarkPercentage: e.target.value })}
                  placeholder="30"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="comparison">Confronto</Label>
                <Select
                  value={formData.benchmarkComparison}
                  onValueChange={(v) => setFormData({ ...formData, benchmarkComparison: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LESS_THAN">Minore di</SelectItem>
                    <SelectItem value="GREATER_THAN">Maggiore di</SelectItem>
                    <SelectItem value="EQUAL">Uguale a</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrizione</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descrizione opzionale della categoria..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Annulla
            </Button>
            <Button onClick={handleSubmit}>
              {editCategory ? 'Salva modifiche' : 'Crea categoria'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default BudgetCategoryManagement
