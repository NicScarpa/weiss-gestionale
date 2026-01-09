'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  TrendingUp,
  Package,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'

interface Product {
  id: string
  name: string
  originalName: string
  code: string | null
  category: string | null
  unit: string | null
  lastPrice: string | null
  lastPriceDate: string | null
  lastSupplier: { id: string; name: string } | null
  priceHistoryCount: number
  hasPendingAlert: boolean
  lastPriceChange: {
    previousPrice: string | null
    priceChange: string | null
    priceChangePct: string | null
  } | null
}

interface FilterOptions {
  categories: { name: string; count: number }[]
}

async function fetchProducts(params: {
  search?: string
  category?: string
  limit?: number
  offset?: number
}) {
  const searchParams = new URLSearchParams()
  if (params.search) searchParams.set('search', params.search)
  if (params.category) searchParams.set('category', params.category)
  if (params.limit) searchParams.set('limit', params.limit.toString())
  if (params.offset) searchParams.set('offset', params.offset.toString())

  const res = await fetch(`/api/products?${searchParams}`)
  if (!res.ok) throw new Error('Errore nel recupero dei prodotti')
  return res.json()
}

async function fetchPriceAlertStats() {
  const res = await fetch('/api/price-alerts?limit=1')
  if (!res.ok) throw new Error('Errore nel recupero degli alert')
  return res.json()
}

export default function ProdottiPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)

  const { data, isLoading } = useQuery({
    queryKey: ['products', search, category, page, pageSize],
    queryFn: () =>
      fetchProducts({
        search: search || undefined,
        category: category || undefined,
        limit: pageSize,
        offset: page * pageSize,
      }),
  })

  const { data: alertStats } = useQuery({
    queryKey: ['price-alert-stats'],
    queryFn: fetchPriceAlertStats,
  })

  const products: Product[] = data?.data || []
  const pagination = data?.pagination || { total: 0, hasMore: false }
  const filters: FilterOptions = data?.filters || { categories: [] }
  const pendingAlerts = alertStats?.stats?.pending || 0

  const formatPrice = (price: string | number | null) => {
    if (price === null) return '-'
    const numPrice = typeof price === 'string' ? parseFloat(price) : price
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(numPrice)
  }

  const formatPercent = (pct: string | null) => {
    if (!pct) return null
    const num = parseFloat(pct)
    return `${num > 0 ? '+' : ''}${num.toFixed(1)}%`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Catalogo Prodotti</h1>
          <p className="text-muted-foreground">
            Tracking prezzi articoli dalle fatture elettroniche
          </p>
        </div>
        {pendingAlerts > 0 && (
          <Link href="/prodotti?tab=alerts">
            <Button variant="destructive" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              {pendingAlerts} Alert Prezzi
            </Button>
          </Link>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prodotti Tracciati</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pagination.total}</div>
            <p className="text-xs text-muted-foreground">
              Articoli nel catalogo
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alert Pendenti</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingAlerts}</div>
            <p className="text-xs text-muted-foreground">
              Variazioni prezzo da verificare
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Categorie</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filters.categories.length}</div>
            <p className="text-xs text-muted-foreground">
              Categorie merceologiche
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Cerca prodotto..."
                className="pl-8"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(0)
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select
                value={category}
                onValueChange={(v) => {
                  setCategory(v === 'all' ? '' : v)
                  setPage(0)
                }}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Tutte le categorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le categorie</SelectItem>
                  {filters.categories.map((cat) => (
                    <SelectItem key={cat.name} value={cat.name || ''}>
                      {cat.name || 'Senza categoria'} ({cat.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nessun prodotto trovato
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prodotto</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Ultimo Prezzo</TableHead>
                    <TableHead className="text-right">Variazione</TableHead>
                    <TableHead>Fornitore</TableHead>
                    <TableHead className="text-right">Storico</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => {
                    const pctChange = product.lastPriceChange?.priceChangePct
                    const pctNum = pctChange ? parseFloat(pctChange) : 0
                    const isIncrease = pctNum > 0
                    const isDecrease = pctNum < 0
                    const isSignificant = Math.abs(pctNum) >= 5

                    return (
                      <TableRow key={product.id}>
                        <TableCell>
                          <Link
                            href={`/prodotti/${product.id}`}
                            className="font-medium hover:underline flex items-center gap-2"
                          >
                            {product.name}
                            {product.hasPendingAlert && (
                              <AlertTriangle className="h-4 w-4 text-destructive" />
                            )}
                          </Link>
                          {product.code && (
                            <div className="text-xs text-muted-foreground">
                              {product.code}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {product.category ? (
                            <Badge variant="outline">{product.category}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatPrice(product.lastPrice)}
                          {product.unit && (
                            <span className="text-xs text-muted-foreground ml-1">
                              /{product.unit}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {pctChange ? (
                            <div
                              className={`flex items-center justify-end gap-1 ${
                                isIncrease
                                  ? isSignificant
                                    ? 'text-destructive'
                                    : 'text-orange-500'
                                  : isDecrease
                                    ? 'text-green-600'
                                    : ''
                              }`}
                            >
                              {isIncrease ? (
                                <ArrowUpRight className="h-4 w-4" />
                              ) : isDecrease ? (
                                <ArrowDownRight className="h-4 w-4" />
                              ) : null}
                              {formatPercent(pctChange)}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {product.lastSupplier?.name || (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">
                            {product.priceHistoryCount} prezzi
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Mostra</span>
                  <Select
                    value={pageSize.toString()}
                    onValueChange={(v) => {
                      setPageSize(parseInt(v))
                      setPage(0)
                    }}
                  >
                    <SelectTrigger className="w-[80px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="500">500</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground">
                    per pagina ({pagination.total} totali)
                  </span>
                </div>

                {pagination.total > pageSize && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page - 1)}
                      disabled={page === 0}
                    >
                      Precedente
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Pagina {page + 1} di {Math.ceil(pagination.total / pageSize)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={!pagination.hasMore}
                    >
                      Successivo
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
