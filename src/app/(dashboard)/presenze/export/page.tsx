'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, subMonths } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ChevronLeft,
  Download,
  FileSpreadsheet,
  AlertTriangle,
  Users,
  Clock,
  Calendar,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

interface Venue {
  id: string
  name: string
  code: string
}

interface PayrollPreview {
  totalUsers: number
  totalHours: number
  totalLeaveDays: number
  estimatedCost: number
  hasWarnings: boolean
  warningsCount: number
}

const MONTHS = [
  { value: 1, label: 'Gennaio' },
  { value: 2, label: 'Febbraio' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Aprile' },
  { value: 5, label: 'Maggio' },
  { value: 6, label: 'Giugno' },
  { value: 7, label: 'Luglio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Settembre' },
  { value: 10, label: 'Ottobre' },
  { value: 11, label: 'Novembre' },
  { value: 12, label: 'Dicembre' },
]

// Genera anni (ultimi 3 + anno corrente)
function getYears() {
  const currentYear = new Date().getFullYear()
  return [currentYear, currentYear - 1, currentYear - 2]
}

export default function ExportPage() {
  const lastMonth = subMonths(new Date(), 1)
  const [selectedMonth, setSelectedMonth] = useState<number>(
    lastMonth.getMonth() + 1
  )
  const [selectedYear, setSelectedYear] = useState<number>(
    lastMonth.getFullYear()
  )
  const [selectedVenueId, setSelectedVenueId] = useState<string>('all')
  const [includeLeaves, setIncludeLeaves] = useState<boolean>(true)
  const [includeSummary, setIncludeSummary] = useState<boolean>(true)
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv'>('xlsx')
  const [isExporting, setIsExporting] = useState(false)

  // Fetch venues
  const { data: venues } = useQuery<Venue[]>({
    queryKey: ['venues-list'],
    queryFn: async () => {
      const response = await fetch('/api/venues')
      if (!response.ok) throw new Error('Errore caricamento sedi')
      const data = await response.json()
      return data.data || []
    },
  })

  // Fetch preview data (simple count/stats)
  const { data: previewData, isLoading: isPreviewLoading } =
    useQuery<PayrollPreview>({
      queryKey: [
        'payroll-preview',
        selectedMonth,
        selectedYear,
        selectedVenueId,
      ],
      queryFn: async () => {
        // Per ora restituisce dati mock - in futuro si può creare un endpoint preview
        // Questo serve solo per mostrare un'anteprima rapida
        const params = new URLSearchParams({
          month: selectedMonth.toString(),
          year: selectedYear.toString(),
          format: 'xlsx', // non importa, non scarica
        })
        if (selectedVenueId !== 'all') {
          params.append('venueId', selectedVenueId)
        }

        // Per semplicità, facciamo una chiamata per contare i record
        const countResponse = await fetch(
          `/api/attendance/records?month=${selectedMonth}&year=${selectedYear}${selectedVenueId !== 'all' ? `&venueId=${selectedVenueId}` : ''}&limit=1`
        )
        if (!countResponse.ok) throw new Error('Errore')
        const countData = await countResponse.json()

        return {
          totalUsers: 0, // Lo calcoleremo quando avremo endpoint dedicato
          totalHours: 0,
          totalLeaveDays: 0,
          estimatedCost: 0,
          hasWarnings: false,
          warningsCount: 0,
        }
      },
      enabled: true,
    })

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const params = new URLSearchParams({
        month: selectedMonth.toString(),
        year: selectedYear.toString(),
        format: exportFormat,
        includeLeaves: includeLeaves.toString(),
        includeSummary: includeSummary.toString(),
      })
      if (selectedVenueId !== 'all') {
        params.append('venueId', selectedVenueId)
      }

      const response = await fetch(`/api/attendance/export/payroll?${params}`)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Errore export')
      }

      // Download file
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url

      const monthName = MONTHS.find((m) => m.value === selectedMonth)?.label || ''
      link.download = `presenze-${monthName.toLowerCase()}-${selectedYear}.${exportFormat}`

      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.success('Export completato', {
        description: `File ${exportFormat.toUpperCase()} scaricato`,
      })
    } catch (error) {
      toast.error('Errore durante l\'export', {
        description: (error as Error).message,
      })
    } finally {
      setIsExporting(false)
    }
  }

  const selectedMonthName = MONTHS.find((m) => m.value === selectedMonth)?.label

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/presenze">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Export Presenze per Paghe
          </h1>
          <p className="text-muted-foreground">
            Genera il file mensile per l'elaborazione delle buste paga
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Selezione parametri */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Periodo
              </CardTitle>
              <CardDescription>
                Seleziona il mese da esportare
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-3 gap-4">
                {/* Mese */}
                <div className="space-y-2">
                  <Label htmlFor="month">Mese</Label>
                  <Select
                    value={selectedMonth.toString()}
                    onValueChange={(v) => setSelectedMonth(parseInt(v))}
                  >
                    <SelectTrigger id="month">
                      <SelectValue placeholder="Seleziona mese" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((month) => (
                        <SelectItem
                          key={month.value}
                          value={month.value.toString()}
                        >
                          {month.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Anno */}
                <div className="space-y-2">
                  <Label htmlFor="year">Anno</Label>
                  <Select
                    value={selectedYear.toString()}
                    onValueChange={(v) => setSelectedYear(parseInt(v))}
                  >
                    <SelectTrigger id="year">
                      <SelectValue placeholder="Seleziona anno" />
                    </SelectTrigger>
                    <SelectContent>
                      {getYears().map((year) => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Sede */}
                <div className="space-y-2">
                  <Label htmlFor="venue">Sede</Label>
                  <Select
                    value={selectedVenueId}
                    onValueChange={setSelectedVenueId}
                  >
                    <SelectTrigger id="venue">
                      <SelectValue placeholder="Tutte le sedi" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutte le sedi</SelectItem>
                      {venues?.map((venue) => (
                        <SelectItem key={venue.id} value={venue.id}>
                          {venue.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Opzioni export */}
              <div className="space-y-4">
                <Label>Opzioni Export</Label>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="includeLeaves"
                      checked={includeLeaves}
                      onCheckedChange={(checked) =>
                        setIncludeLeaves(checked === true)
                      }
                    />
                    <Label
                      htmlFor="includeLeaves"
                      className="text-sm font-normal cursor-pointer"
                    >
                      Includi assenze (ferie, malattie, permessi)
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="includeSummary"
                      checked={includeSummary}
                      onCheckedChange={(checked) =>
                        setIncludeSummary(checked === true)
                      }
                    />
                    <Label
                      htmlFor="includeSummary"
                      className="text-sm font-normal cursor-pointer"
                    >
                      Includi foglio riepilogo mensile
                    </Label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Formato file</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={exportFormat === 'xlsx' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setExportFormat('xlsx')}
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Excel (.xlsx)
                    </Button>
                    <Button
                      variant={exportFormat === 'csv' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setExportFormat('csv')}
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      CSV
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Info formato */}
          <Card>
            <CardHeader>
              <CardTitle>Informazioni Export</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-sm">
                <div>
                  <h4 className="font-medium mb-1">Contenuto del file</h4>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1">
                    <li>Matricola, cognome, nome dipendente</li>
                    <li>Data, ora entrata, ora uscita</li>
                    <li>Ore ordinarie, straordinario, notturne, festive</li>
                    <li>Codici assenza (FE, MA, ROL, etc.)</li>
                    <li>Note e anomalie</li>
                  </ul>
                </div>

                {exportFormat === 'xlsx' && includeSummary && (
                  <div>
                    <h4 className="font-medium mb-1">Fogli Excel</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1">
                      <li>
                        <strong>Dettaglio:</strong> Tutte le giornate lavorate
                      </li>
                      <li>
                        <strong>Riepilogo:</strong> Totali mensili per
                        dipendente
                      </li>
                      <li>
                        <strong>Avvisi:</strong> Anomalie non risolte (se
                        presenti)
                      </li>
                    </ul>
                  </div>
                )}

                <div>
                  <h4 className="font-medium mb-1">Calcolo ore</h4>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1">
                    <li>
                      <strong>Ordinarie:</strong> Fino al monte ore contratto
                    </li>
                    <li>
                      <strong>Straordinario:</strong> Oltre monte ore
                    </li>
                    <li>
                      <strong>Notturne:</strong> Fascia 22:00-06:00
                    </li>
                    <li>
                      <strong>Festive:</strong> Domeniche e festività italiane
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Riepilogo e azione */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Riepilogo Export</CardTitle>
              <CardDescription>
                {selectedMonthName} {selectedYear}
                {selectedVenueId !== 'all' &&
                  venues &&
                  ` - ${venues.find((v) => v.id === selectedVenueId)?.name}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-muted p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Periodo
                  </span>
                  <span className="font-medium">
                    {selectedMonthName} {selectedYear}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    Formato
                  </span>
                  <Badge variant="secondary">
                    {exportFormat.toUpperCase()}
                  </Badge>
                </div>

                {includeLeaves && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Assenze
                    </span>
                    <Badge variant="outline">Incluse</Badge>
                  </div>
                )}

                {includeSummary && exportFormat === 'xlsx' && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Riepilogo
                    </span>
                    <Badge variant="outline">Incluso</Badge>
                  </div>
                )}
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={handleExport}
                disabled={isExporting}
              >
                {isExporting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Generazione in corso...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Scarica {exportFormat.toUpperCase()}
                  </>
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Il file verrà generato con i dati aggiornati al momento del
                download
              </p>
            </CardContent>
          </Card>

          {/* Quick actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Accesso rapido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                size="sm"
                asChild
              >
                <Link href="/presenze">
                  <Clock className="h-4 w-4 mr-2" />
                  Gestione Presenze
                </Link>
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                size="sm"
                asChild
              >
                <Link href="/presenze/anomalie">
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Anomalie
                </Link>
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                size="sm"
                asChild
              >
                <Link href="/staff">
                  <Users className="h-4 w-4 mr-2" />
                  Anagrafica Staff
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
