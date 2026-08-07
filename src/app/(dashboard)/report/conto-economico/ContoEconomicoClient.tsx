'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Calendar, ChevronDown, ChevronRight, Download, Scale, TrendingDown, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { buildAccountTree } from '@/lib/accounts/build-account-tree'
import type { RigaContoEconomico, TotaliContoEconomico } from '@/lib/report/conto-economico'
import {
  determinaColonne,
  sommaRighe,
  senzaContoPerRiga,
  haSenzaConto,
  buildCsvMatrix,
  type ColonnaReport,
} from '@/lib/report/conto-economico-view'

interface CostCenterInfo {
  id: string
  code: string
  name: string
}

interface ContoEconomicoResponse {
  period: { from: string; to: string }
  costCenters: CostCenterInfo[]
  rows: RigaContoEconomico[]
  senzaContoNetto: Record<string, number>
  totals: TotaliContoEconomico
  totalsPerColonna: Record<string, TotaliContoEconomico>
}

type QuickPeriod = 'thisYear' | 'lastYear' | 'last6Months' | 'last3Months' | 'thisMonth'

const periodLabels: Record<QuickPeriod, string> = {
  thisYear: 'Anno corrente',
  lastYear: 'Anno scorso',
  last6Months: 'Ultimi 6 mesi',
  last3Months: 'Ultimi 3 mesi',
  thisMonth: 'Mese corrente',
}

function getDateRange(period: QuickPeriod) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  switch (period) {
    case 'thisYear':
      return { from: `${year}-01-01`, to: `${year}-12-31` }
    case 'lastYear':
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` }
    case 'last6Months': {
      const sixMonthsAgo = new Date(year, month - 6, 1)
      return { from: sixMonthsAgo.toISOString().split('T')[0], to: now.toISOString().split('T')[0] }
    }
    case 'last3Months': {
      const threeMonthsAgo = new Date(year, month - 3, 1)
      return { from: threeMonthsAgo.toISOString().split('T')[0], to: now.toISOString().split('T')[0] }
    }
    case 'thisMonth':
      return { from: `${year}-${String(month + 1).padStart(2, '0')}-01`, to: now.toISOString().split('T')[0] }
  }
}

/** Da 'yyyy-MM-dd' a 'dd/MM/yyyy': manipolazione di stringa, nessun `new Date()` che rischi il fuso orario. */
function formatDateIt(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value)

/** Cella della tabella: uno zero si legge come assenza di movimento, non come "zero euro esatti". */
function Cella({ value, className = '' }: { value: number; className?: string }) {
  if (value === 0) {
    return <TableCell className={`text-right text-muted-foreground ${className}`}>–</TableCell>
  }
  return <TableCell className={`text-right ${className}`}>{formatCurrency(value)}</TableCell>
}

export function ContoEconomicoClient() {
  const [quickPeriod, setQuickPeriod] = useState<QuickPeriod>('thisYear')
  const [data, setData] = useState<ContoEconomicoResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedMastri, setExpandedMastri] = useState<Set<string>>(new Set())
  const [expandedGruppi, setExpandedGruppi] = useState<Set<string>>(new Set())

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)

      try {
        const range = getDateRange(quickPeriod)
        const params = new URLSearchParams()
        params.set('dateFrom', range.from)
        params.set('dateTo', range.to)

        const response = await fetch(`/api/report/conto-economico?${params}`)
        if (!response.ok) {
          throw new Error('Errore nel caricamento dei dati')
        }

        const result = await response.json()
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Errore sconosciuto')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [quickPeriod])

  const colonne = useMemo(
    () => (data ? determinaColonne(data.costCenters, data.rows, data.senzaContoNetto) : []),
    [data]
  )
  const righeRicavi = useMemo(() => data?.rows.filter((r) => r.type === 'RICAVO') ?? [], [data])
  const righeCosti = useMemo(() => data?.rows.filter((r) => r.type === 'COSTO') ?? [], [data])
  const alberoRicavi = useMemo(() => buildAccountTree(righeRicavi), [righeRicavi])
  const alberoCosti = useMemo(() => buildAccountTree(righeCosti), [righeCosti])
  const senzaContoRiga = useMemo(
    () => (data ? senzaContoPerRiga(data.senzaContoNetto) : {}),
    [data]
  )
  const mostraSenzaConto = haSenzaConto(senzaContoRiga)
  const totaleSenzaConto = useMemo(
    () => Object.values(senzaContoRiga).reduce((somma, v) => somma + v, 0),
    [senzaContoRiga]
  )

  const toggleMastro = (key: string) => {
    setExpandedMastri((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleGruppo = (key: string) => {
    setExpandedGruppi((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const exportCSV = () => {
    if (!data) return

    const matrice = buildCsvMatrix({
      colonne,
      ricavi: righeRicavi,
      costi: righeCosti,
      totalsPerColonna: data.totalsPerColonna,
      totals: data.totals,
      senzaContoRiga,
    })

    const csvContent = matrice.map((riga) => riga.join(';')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `conto-economico-${data.period.from}-${data.period.to}.csv`
    link.click()
  }

  const colSpanTotale = colonne.length + 2

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/report">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Conto Economico per Centro</h1>
            <p className="text-muted-foreground">
              Ricavi, costi e margine per attività (Weiss, Villa Varda, stand stagionali, struttura)
            </p>
          </div>
        </div>
        <Button onClick={exportCSV} disabled={!data || loading} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Esporta CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Select value={quickPeriod} onValueChange={(v) => setQuickPeriod(v as QuickPeriod)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(periodLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {data && (
              <Badge variant="outline" className="ml-auto">
                {formatDateIt(data.period.from)} - {formatDateIt(data.period.to)}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardContent className="pt-6">
              <Skeleton className="h-[400px] w-full" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Data Display */}
      {!loading && data && (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <CardDescription>Ricavi</CardDescription>
                </div>
                <CardTitle className="text-2xl text-green-600">{formatCurrency(data.totals.ricavi)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-600" />
                  <CardDescription>Costi</CardDescription>
                </div>
                <CardTitle className="text-2xl text-red-600">{formatCurrency(data.totals.costi)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-muted-foreground" />
                  <CardDescription>Margine</CardDescription>
                </div>
                <CardTitle className={`text-2xl ${data.totals.margine >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(data.totals.margine)}
                </CardTitle>
              </CardHeader>
              {mostraSenzaConto && (
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground">
                    Esclude i movimenti senza conto: se non coincide con la banca, la differenza è lì sotto.
                  </p>
                </CardContent>
              )}
            </Card>
          </div>

          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle>Dettaglio per voce e centro</CardTitle>
              <CardDescription>
                Righe mastro ed espandibili in gruppo e voce. Clicca per espandere/comprimere.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Voce</TableHead>
                    {colonne.map((c) => (
                      <TableHead key={c.key} className="text-right">
                        {c.label}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Totale</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/60 hover:bg-muted/60">
                    <TableCell colSpan={colSpanTotale} className="font-bold">
                      RICAVI
                    </TableCell>
                  </TableRow>
                  <RigheAlbero
                    tree={alberoRicavi}
                    sectionKey="RICAVO"
                    colonne={colonne}
                    expandedMastri={expandedMastri}
                    expandedGruppi={expandedGruppi}
                    toggleMastro={toggleMastro}
                    toggleGruppo={toggleGruppo}
                  />
                  <TableRow className="font-bold border-t-2">
                    <TableCell>Totale Ricavi</TableCell>
                    {colonne.map((c) => (
                      <Cella key={c.key} value={data.totalsPerColonna[c.key]?.ricavi ?? 0} className="font-bold" />
                    ))}
                    <Cella value={data.totals.ricavi} className="font-bold" />
                  </TableRow>

                  <TableRow className="bg-muted/60 hover:bg-muted/60">
                    <TableCell colSpan={colSpanTotale} className="font-bold">
                      COSTI
                    </TableCell>
                  </TableRow>
                  <RigheAlbero
                    tree={alberoCosti}
                    sectionKey="COSTO"
                    colonne={colonne}
                    expandedMastri={expandedMastri}
                    expandedGruppi={expandedGruppi}
                    toggleMastro={toggleMastro}
                    toggleGruppo={toggleGruppo}
                  />
                  <TableRow className="font-bold border-t-2">
                    <TableCell>Totale Costi</TableCell>
                    {colonne.map((c) => (
                      <Cella key={c.key} value={data.totalsPerColonna[c.key]?.costi ?? 0} className="font-bold" />
                    ))}
                    <Cella value={data.totals.costi} className="font-bold" />
                  </TableRow>

                  {mostraSenzaConto && (
                    <TableRow className="italic text-muted-foreground">
                      <TableCell>Movimenti senza conto (netto)</TableCell>
                      {colonne.map((c) => (
                        <Cella key={c.key} value={senzaContoRiga[c.key] ?? 0} />
                      ))}
                      <Cella value={totaleSenzaConto} />
                    </TableRow>
                  )}

                  <TableRow className="font-bold border-t-2 bg-muted/40 hover:bg-muted/40">
                    <TableCell>MARGINE</TableCell>
                    {colonne.map((c) => (
                      <Cella key={c.key} value={data.totalsPerColonna[c.key]?.margine ?? 0} className="font-bold" />
                    ))}
                    <Cella value={data.totals.margine} className="font-bold" />
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {data.rows.length === 0 && (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                <p>Nessun movimento nel periodo selezionato.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

interface RigheAlberoProps {
  tree: ReturnType<typeof buildAccountTree<RigaContoEconomico>>
  sectionKey: string
  colonne: ColonnaReport[]
  expandedMastri: Set<string>
  expandedGruppi: Set<string>
  toggleMastro: (key: string) => void
  toggleGruppo: (key: string) => void
}

/** Righe mastro → gruppo → voce di una sezione (RICAVI o COSTI), default compresso. */
function RigheAlbero({
  tree,
  sectionKey,
  colonne,
  expandedMastri,
  expandedGruppi,
  toggleMastro,
  toggleGruppo,
}: RigheAlberoProps) {
  if (tree.length === 0) {
    return (
      <TableRow>
        <TableCell colSpan={colonne.length + 2} className="text-center text-muted-foreground">
          Nessuna voce nel periodo selezionato
        </TableCell>
      </TableRow>
    )
  }

  return (
    <>
      {tree.map((mastro) => {
        const mastroKey = `${sectionKey}::${mastro.mastroCode ?? '—'}`
        const mastroExpanded = expandedMastri.has(mastroKey)
        const vociMastro = mastro.gruppi.flatMap((g) => g.voci)
        const subMastro = sommaRighe(vociMastro, colonne)

        return (
          <Fragment key={mastroKey}>
            <TableRow className="cursor-pointer bg-muted/20" onClick={() => toggleMastro(mastroKey)}>
              <TableCell className="font-semibold">
                <span className="flex items-center gap-2">
                  {mastroExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="font-mono text-xs text-muted-foreground">{mastro.mastroCode ?? '—'}</span>
                  {mastro.mastroNome ?? 'Altri conti'}
                </span>
              </TableCell>
              {colonne.map((c) => (
                <Cella key={c.key} value={subMastro.amounts[c.key] ?? 0} className="font-semibold" />
              ))}
              <Cella value={subMastro.total} className="font-semibold" />
            </TableRow>

            {mastroExpanded &&
              mastro.gruppi.map((gruppo) => {
                const gruppoKey = `${mastroKey}::${gruppo.gruppoCode ?? '—'}`

                // Gruppo sintetico (mastro non articolato in gruppi): le voci
                // scendono di un solo livello rispetto al mastro, senza riga propria.
                if (gruppo.gruppoCode === null) {
                  return (
                    <Fragment key={gruppoKey}>
                      {gruppo.voci.map((voce) => (
                        <VoceRow key={voce.accountId} voce={voce} colonne={colonne} indent={1} />
                      ))}
                    </Fragment>
                  )
                }

                const gruppoExpanded = expandedGruppi.has(gruppoKey)
                const subGruppo = sommaRighe(gruppo.voci, colonne)

                return (
                  <Fragment key={gruppoKey}>
                    <TableRow className="cursor-pointer" onClick={() => toggleGruppo(gruppoKey)}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2 pl-6">
                          {gruppoExpanded ? (
                            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className="font-mono text-xs text-muted-foreground">{gruppo.gruppoCode}</span>
                          {gruppo.gruppoNome}
                        </span>
                      </TableCell>
                      {colonne.map((c) => (
                        <Cella key={c.key} value={subGruppo.amounts[c.key] ?? 0} className="font-medium" />
                      ))}
                      <Cella value={subGruppo.total} className="font-medium" />
                    </TableRow>
                    {gruppoExpanded &&
                      gruppo.voci.map((voce) => (
                        <VoceRow key={voce.accountId} voce={voce} colonne={colonne} indent={2} />
                      ))}
                  </Fragment>
                )
              })}
          </Fragment>
        )
      })}
    </>
  )
}

function VoceRow({ voce, colonne, indent }: { voce: RigaContoEconomico; colonne: ColonnaReport[]; indent: number }) {
  return (
    <TableRow>
      <TableCell className="text-sm">
        <span className="flex items-center gap-2" style={{ paddingLeft: `${indent * 1.5}rem` }}>
          <span className="font-mono text-xs text-muted-foreground">{voce.code}</span>
          {voce.name}
        </span>
      </TableCell>
      {colonne.map((c) => (
        <Cella key={c.key} value={voce.amounts[c.key] ?? 0} className="text-sm" />
      ))}
      <Cella value={voce.total} className="text-sm font-medium" />
    </TableRow>
  )
}
