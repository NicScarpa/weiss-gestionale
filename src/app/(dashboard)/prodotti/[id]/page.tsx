'use client'

import { use } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  CheckCircle,
  History,
  TrendingUp,
  Building2,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface PageProps {
  params: Promise<{ id: string }>
}

interface PriceHistory {
  id: string
  price: string
  quantity: string | null
  totalPrice: string | null
  invoiceNumber: string | null
  invoiceDate: string
  previousPrice: string | null
  priceChange: string | null
  priceChangePct: string | null
  supplier: { id: string; name: string } | null
}

interface PriceAlert {
  id: string
  alertType: string
  oldPrice: string
  newPrice: string
  changePercent: string
  invoiceDate: string
  status: string
  reviewedAt: string | null
  notes: string | null
  supplier: { id: string; name: string } | null
}

interface Product {
  id: string
  name: string
  originalName: string
  code: string | null
  category: string | null
  unit: string | null
  lastPrice: string | null
  lastPriceDate: string | null
  venue: { id: string; name: string; code: string } | null
  priceHistory: PriceHistory[]
  priceAlerts: PriceAlert[]
  stats: {
    avgPrice: string | null
    minPrice: string | null
    maxPrice: string | null
    recordCount: number
  }
  priceBySupplier: {
    supplierId: string
    supplierName: string
    avgPrice: string
    purchaseCount: number
  }[]
}

async function fetchProduct(id: string): Promise<{ data: Product }> {
  const res = await fetch(`/api/products/${id}`)
  if (!res.ok) throw new Error('Prodotto non trovato')
  return res.json()
}

async function updateAlertStatus(
  alertId: string,
  status: string,
  notes?: string
) {
  const res = await fetch(`/api/price-alerts/${alertId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, notes }),
  })
  if (!res.ok) throw new Error('Errore aggiornamento alert')
  return res.json()
}

export default function ProductDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['product', id],
    queryFn: () => fetchProduct(id),
  })

  const alertMutation = useMutation({
    mutationFn: ({ alertId, status }: { alertId: string; status: string }) =>
      updateAlertStatus(alertId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product', id] })
    },
  })

  const product = data?.data

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

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'd MMM yyyy', { locale: it })
  }

  const getAlertTypeLabel = (type: string) => {
    switch (type) {
      case 'INCREASE':
        return 'Aumento'
      case 'DECREASE':
        return 'Diminuzione'
      case 'NEW_PRODUCT':
        return 'Nuovo Prodotto'
      case 'NEW_SUPPLIER':
        return 'Nuovo Fornitore'
      default:
        return type
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="destructive">Da verificare</Badge>
      case 'ACKNOWLEDGED':
        return <Badge variant="secondary">Preso visione</Badge>
      case 'APPROVED':
        return <Badge variant="default">Approvato</Badge>
      case 'DISPUTED':
        return <Badge variant="outline">Contestato</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive">Prodotto non trovato</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          Torna indietro
        </Button>
      </div>
    )
  }

  const pendingAlerts = product.priceAlerts.filter((a) => a.status === 'PENDING')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{product.name}</h1>
          <p className="text-muted-foreground">
            {product.originalName !== product.name && (
              <span className="mr-2">({product.originalName})</span>
            )}
            {product.code && <span className="mr-2">Cod. {product.code}</span>}
            {product.category && (
              <Badge variant="outline" className="ml-2">
                {product.category}
              </Badge>
            )}
          </p>
        </div>
        {pendingAlerts.length > 0 && (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            {pendingAlerts.length} Alert
          </Badge>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ultimo Prezzo</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatPrice(product.lastPrice)}
            </div>
            {product.lastPriceDate && (
              <p className="text-xs text-muted-foreground">
                {formatDate(product.lastPriceDate)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prezzo Medio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatPrice(product.stats.avgPrice)}
            </div>
            <p className="text-xs text-muted-foreground">
              su {product.stats.recordCount} acquisti
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prezzo Min</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatPrice(product.stats.minPrice)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prezzo Max</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {formatPrice(product.stats.maxPrice)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="history" className="space-y-4">
        <TabsList className="flex gap-1 p-1 bg-muted/50 rounded-lg h-auto w-fit border-none">
          <TabsTrigger
            value="history"
            className="px-4 py-2 rounded-full data-[state=active]:bg-black data-[state=active]:text-white transition-all shadow-none border-none text-sm font-medium gap-2"
          >
            <History className="h-4 w-4" />
            Storico Prezzi
          </TabsTrigger>
          <TabsTrigger
            value="suppliers"
            className="px-4 py-2 rounded-full data-[state=active]:bg-black data-[state=active]:text-white transition-all shadow-none border-none text-sm font-medium gap-2"
          >
            <Building2 className="h-4 w-4" />
            Fornitori
          </TabsTrigger>
          <TabsTrigger
            value="alerts"
            className="px-4 py-2 rounded-full data-[state=active]:bg-black data-[state=active]:text-white transition-all shadow-none border-none text-sm font-medium gap-2"
          >
            <AlertTriangle className="h-4 w-4" />
            Alert ({product.priceAlerts.length})
          </TabsTrigger>
        </TabsList>

        {/* Storico Prezzi */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Storico Prezzi</CardTitle>
              <CardDescription>
                Ultime {product.priceHistory.length} variazioni di prezzo
              </CardDescription>
            </CardHeader>
            <CardContent>
              {product.priceHistory.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  Nessuno storico disponibile
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data Fattura</TableHead>
                      <TableHead>Fornitore</TableHead>
                      <TableHead className="text-right">Prezzo</TableHead>
                      <TableHead className="text-right">Variazione</TableHead>
                      <TableHead className="text-right">Quantita</TableHead>
                      <TableHead>Fattura</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {product.priceHistory.map((record) => {
                      const pctNum = record.priceChangePct
                        ? parseFloat(record.priceChangePct)
                        : 0
                      const isIncrease = pctNum > 0
                      const isDecrease = pctNum < 0

                      return (
                        <TableRow key={record.id}>
                          <TableCell>{formatDate(record.invoiceDate)}</TableCell>
                          <TableCell>
                            {record.supplier?.name || (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatPrice(record.price)}
                          </TableCell>
                          <TableCell className="text-right">
                            {record.priceChangePct ? (
                              <div
                                className={`flex items-center justify-end gap-1 ${isIncrease
                                    ? 'text-destructive'
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
                                {formatPercent(record.priceChangePct)}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {record.quantity || '-'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {record.invoiceNumber || '-'}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fornitori */}
        <TabsContent value="suppliers">
          <Card>
            <CardHeader>
              <CardTitle>Confronto Fornitori</CardTitle>
              <CardDescription>
                Prezzo medio per fornitore
              </CardDescription>
            </CardHeader>
            <CardContent>
              {product.priceBySupplier.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  Nessun fornitore registrato
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fornitore</TableHead>
                      <TableHead className="text-right">Prezzo Medio</TableHead>
                      <TableHead className="text-right">Acquisti</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {product.priceBySupplier
                      .sort(
                        (a, b) =>
                          parseFloat(a.avgPrice) - parseFloat(b.avgPrice)
                      )
                      .map((supplier, index) => (
                        <TableRow key={supplier.supplierId}>
                          <TableCell className="font-medium">
                            {supplier.supplierName}
                            {index === 0 && (
                              <Badge
                                variant="secondary"
                                className="ml-2 text-xs"
                              >
                                Migliore
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatPrice(supplier.avgPrice)}
                          </TableCell>
                          <TableCell className="text-right">
                            {supplier.purchaseCount}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alert */}
        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <CardTitle>Alert Variazioni Prezzo</CardTitle>
              <CardDescription>
                Variazioni significative (oltre 5%)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {product.priceAlerts.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  Nessun alert per questo prodotto
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Vecchio</TableHead>
                      <TableHead className="text-right">Nuovo</TableHead>
                      <TableHead className="text-right">Variazione</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {product.priceAlerts.map((alert) => (
                      <TableRow key={alert.id}>
                        <TableCell>
                          <Badge
                            variant={
                              alert.alertType === 'INCREASE'
                                ? 'destructive'
                                : alert.alertType === 'DECREASE'
                                  ? 'default'
                                  : 'secondary'
                            }
                          >
                            {getAlertTypeLabel(alert.alertType)}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(alert.invoiceDate)}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatPrice(alert.oldPrice)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatPrice(alert.newPrice)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={
                              parseFloat(alert.changePercent) > 0
                                ? 'text-destructive'
                                : 'text-green-600'
                            }
                          >
                            {formatPercent(alert.changePercent)}
                          </span>
                        </TableCell>
                        <TableCell>{getStatusBadge(alert.status)}</TableCell>
                        <TableCell>
                          {alert.status === 'PENDING' && (
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  alertMutation.mutate({
                                    alertId: alert.id,
                                    status: 'ACKNOWLEDGED',
                                  })
                                }
                                disabled={alertMutation.isPending}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
