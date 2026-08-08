'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Search, X, Save, Loader2, ArrowRight } from 'lucide-react'

import { logger } from '@/lib/logger'
interface Account {
  id: string
  code: string
  name: string
  type: string
  category: string | null
}

interface BudgetCategory {
  id: string
  code: string
  name: string
  categoryType: string
  color: string | null
  parentId: string | null
}

interface Venue {
  id: string
  name: string
  code: string
}

interface MappingApi {
  accountId: string
  budgetCategoryId: string
  account?: Account
}

// Identità stabile per il caso "nessuna modifica in sospeso"
const NESSUNA_MODIFICA: Map<string, string | null> = new Map()

// Componente draggable per un account
function DraggableAccount({ account, onRemove }: { account: Account; onRemove?: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: account.id })

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-2 bg-background border rounded-lg ${
        isDragging ? 'shadow-lg ring-2 ring-primary z-50' : ''
      }`}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{account.code}</span>
          <span className="font-medium truncate">{account.name}</span>
        </div>
      </div>
      <Badge variant="outline" className="text-xs shrink-0">
        {account.type === 'COSTO' ? 'Costo' : 'Ricavo'}
      </Badge>
      {onRemove && (
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRemove}>
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}

// Componente per una categoria droppable
function DroppableCategory({
  category,
  mappedAccounts,
  onRemoveMapping,
}: {
  category: BudgetCategory
  mappedAccounts: Account[]
  onRemoveMapping: (accountId: string) => void
  allAccounts: Map<string, Account>
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `category-${category.id}` })

  return (
    <div
      ref={setNodeRef}
      className={`p-3 border rounded-lg transition-colors ${
        isOver ? 'bg-primary/10 border-primary border-2' : 'bg-muted/30'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        {category.color && (
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: category.color }}
          />
        )}
        <span className="font-medium">{category.name}</span>
        <Badge variant="secondary" className="text-xs">{mappedAccounts.length}</Badge>
      </div>

      <div className="space-y-1 min-h-[40px]">
        {mappedAccounts.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">
            Trascina qui i conti
          </p>
        ) : (
          mappedAccounts.map(account => (
            <div
              key={account.id}
              className="flex items-center gap-2 p-2 bg-background border rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{account.code}</span>
                  <span className="font-medium truncate">{account.name}</span>
                </div>
              </div>
              <Badge variant="outline" className="text-xs shrink-0">
                {account.type === 'COSTO' ? 'Costo' : 'Ricavo'}
              </Badge>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRemoveMapping(account.id)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export function AccountMappingManager() {
  // Sede scelta esplicitamente dall'utente: se manca si usa la prima disponibile
  const [sceltaSede, setSceltaSede] = useState<string>('')
  // Modifiche non ancora salvate, legate alla sede su cui sono state fatte:
  // accountId -> categoryId, oppure null se il conto è stato tolto da una categoria
  const [modifiche, setModifiche] = useState<{ sedeId: string; mappe: Map<string, string | null> } | null>(null)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeAccount, setActiveAccount] = useState<Account | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  )

  const {
    data: rispostaSedi,
    isError: erroreSedi,
    error: dettaglioErroreSedi,
  } = useQuery({
    // Come prima del passaggio a TanStack Query: ogni montaggio ricarica.
    refetchOnMount: 'always',
    staleTime: 0,
    queryKey: ['venues'],
    queryFn: async (): Promise<{ venues?: Venue[] } | Venue[]> => {
      const res = await fetch('/api/venues')
      return res.json()
    },
  })

  useEffect(() => {
    if (erroreSedi) {
      logger.error('Errore caricamento sedi', dettaglioErroreSedi)
    }
  }, [erroreSedi, dettaglioErroreSedi])

  // API returns { venues: [...] } or array directly
  const venues = useMemo(
    () => (Array.isArray(rispostaSedi) ? rispostaSedi : rispostaSedi?.venues || []),
    [rispostaSedi]
  )
  const selectedVenueId = sceltaSede || venues[0]?.id || ''

  const {
    data: datiMapping,
    isPending,
    isFetching,
    isError,
    error: dettaglioErrore,
    refetch: ricaricaDati,
  } = useQuery({
    // Come prima del passaggio a TanStack Query: ogni montaggio ricarica.
    refetchOnMount: 'always',
    staleTime: 0,
    queryKey: ['budget-categories', 'mapping', selectedVenueId],
    enabled: !!selectedVenueId,
    queryFn: async (): Promise<{
      categories: BudgetCategory[]
      mappings: MappingApi[]
      unmappedAccounts: Account[]
    }> => {
      // Carica categorie
      const catRes = await fetch(`/api/budget-categories?venueId=${selectedVenueId}`)
      const catData = await catRes.json()

      // Carica mapping esistenti
      const mapRes = await fetch(`/api/budget-categories/mappings?venueId=${selectedVenueId}`)
      const mapData = await mapRes.json()

      // Carica conti non mappati
      const unmapRes = await fetch(`/api/budget-categories/mappings?venueId=${selectedVenueId}&unmappedOnly=true`)
      const unmapData = await unmapRes.json()

      return {
        categories: catData.categories || [],
        mappings: mapData.mappings || [],
        unmappedAccounts: unmapData.unmappedAccounts || [],
      }
    },
  })

  useEffect(() => {
    if (isError) {
      logger.error('Errore caricamento dati', dettaglioErrore)
      toast.error('Impossibile caricare i dati')
    }
  }, [isError, dettaglioErrore])

  const loading = isPending || isFetching
  const categories = useMemo(() => datiMapping?.categories ?? [], [datiMapping])

  // Le modifiche valgono solo per la sede su cui sono state fatte
  const modificheCorrenti =
    modifiche && modifiche.sedeId === selectedVenueId ? modifiche.mappe : NESSUNA_MODIFICA
  const hasChanges = modificheCorrenti.size > 0

  // Mapping salvati sul server con sopra le modifiche in sospeso
  const mappings = useMemo(() => {
    const result = new Map<string, string>()
    for (const m of datiMapping?.mappings ?? []) {
      result.set(m.accountId, m.budgetCategoryId)
    }
    modificheCorrenti.forEach((categoryId, accountId) => {
      if (categoryId === null) {
        result.delete(accountId)
      } else {
        result.set(accountId, categoryId)
      }
    })
    return result
  }, [datiMapping, modificheCorrenti])

  // Mappa di tutti gli account (unmapped + mapped) per lookup rapido
  const allAccountsMap = useMemo(() => {
    const map = new Map<string, Account>()
    for (const a of datiMapping?.unmappedAccounts ?? []) {
      map.set(a.id, a)
    }
    for (const m of datiMapping?.mappings ?? []) {
      if (m.account) {
        map.set(m.account.id, m.account)
      }
    }
    return map
  }, [datiMapping])

  // I conti senza categoria: quelli non mappati sul server più quelli tolti qui
  const unmappedAccounts = useMemo(
    () => Array.from(allAccountsMap.values()).filter(a => !mappings.has(a.id)),
    [allAccountsMap, mappings]
  )

  // Filtra conti non mappati per ricerca
  const filteredUnmapped = useMemo(() => {
    if (!searchQuery.trim()) return unmappedAccounts
    const q = searchQuery.toLowerCase()
    return unmappedAccounts.filter(
      a => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
    )
  }, [unmappedAccounts, searchQuery])

  // Raggruppa conti mappati per categoria
  const accountsByCategory = useMemo(() => {
    const result = new Map<string, Account[]>()
    categories.forEach(cat => result.set(cat.id, []))

    mappings.forEach((categoryId, accountId) => {
      const account = allAccountsMap.get(accountId)
      if (account && result.has(categoryId)) {
        result.get(categoryId)!.push(account)
      }
    })

    return result
  }, [categories, mappings, allAccountsMap])

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const account = allAccountsMap.get(active.id as string)
    setActiveAccount(account || null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveAccount(null)

    if (!over) return

    const accountId = active.id as string
    const overId = over.id as string

    // Check if dropped on a category
    if (overId.startsWith('category-')) {
      const categoryId = overId.replace('category-', '')

      const nuoveModifiche = new Map(modificheCorrenti)
      nuoveModifiche.set(accountId, categoryId)
      setModifiche({ sedeId: selectedVenueId, mappe: nuoveModifiche })
    }
  }

  const handleRemoveMapping = (accountId: string) => {
    // null segna il conto come tolto dalla sua categoria
    const nuoveModifiche = new Map(modificheCorrenti)
    nuoveModifiche.set(accountId, null)
    setModifiche({ sedeId: selectedVenueId, mappe: nuoveModifiche })
  }

  const saveChanges = async () => {
    if (!selectedVenueId) return
    setSaving(true)

    try {
      const mappingsArray = Array.from(mappings.entries()).map(([accountId, budgetCategoryId]) => ({
        accountId,
        budgetCategoryId,
      }))

      const res = await fetch('/api/budget-categories/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venueId: selectedVenueId,
          mappings: mappingsArray,
        }),
      })

      if (res.ok) {
        toast.success(`${mappingsArray.length} mapping salvati con successo`)
        setModifiche(null)
        ricaricaDati()
      } else {
        const data = await res.json()
        throw new Error(data.error)
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Impossibile salvare i mapping')
    } finally {
      setSaving(false)
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Mapping Conti → Categorie</CardTitle>
            <CardDescription>
              Trascina i conti nelle categorie budget corrispondenti
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <Select
              value={selectedVenueId}
              onValueChange={(v) => {
                // Cambiando sede si riparte dai mapping salvati
                setSceltaSede(v)
                setModifiche(null)
              }}
            >
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
            <Button
              onClick={saveChanges}
              disabled={!hasChanges || saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salva mapping
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {categories.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              Nessuna categoria configurata. Vai alle impostazioni Budget per creare le categorie.
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-2 gap-6">
              {/* Colonna sinistra: conti non mappati */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">Conti da mappare</h3>
                  <Badge variant="secondary">{unmappedAccounts.length}</Badge>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cerca conti..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <ScrollArea className="h-[500px] border rounded-lg p-3">
                  <div className="space-y-2">
                    {filteredUnmapped.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {searchQuery
                          ? 'Nessun conto trovato'
                          : 'Tutti i conti sono mappati!'}
                      </p>
                    ) : (
                      filteredUnmapped.map(account => (
                        <DraggableAccount key={account.id} account={account} />
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Colonna destra: categorie */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">Categorie Budget</h3>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>

                <ScrollArea className="h-[540px]">
                  <div className="space-y-3 pr-4">
                    {categories
                      .filter(c => !c.parentId) // Solo categorie root
                      .map(category => (
                        <div key={category.id} className="space-y-2">
                          <DroppableCategory
                            category={category}
                            mappedAccounts={accountsByCategory.get(category.id) || []}
                            onRemoveMapping={handleRemoveMapping}
                            allAccounts={allAccountsMap}
                          />
                          {/* Sottocategorie */}
                          {categories
                            .filter(c => c.parentId === category.id)
                            .map(subcat => (
                              <div key={subcat.id} className="ml-4">
                                <DroppableCategory
                                  category={subcat}
                                  mappedAccounts={accountsByCategory.get(subcat.id) || []}
                                  onRemoveMapping={handleRemoveMapping}
                                  allAccounts={allAccountsMap}
                                />
                              </div>
                            ))}
                        </div>
                      ))}
                  </div>
                </ScrollArea>
              </div>
            </div>

            {/* Overlay durante il drag */}
            <DragOverlay>
              {activeAccount && (
                <div className="p-2 bg-background border rounded-lg shadow-xl cursor-grabbing">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono text-xs">{activeAccount.code}</span>
                    <span className="font-medium">{activeAccount.name}</span>
                  </div>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </CardContent>
    </Card>
  )
}
