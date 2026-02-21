'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { formatCurrency } from '@/lib/constants'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { FileText, Ban, Users, Info, Loader2, UploadIcon } from 'lucide-react'
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { CaricaFattureDialog } from '@/components/fatture/CaricaFattureDialog'

interface MonthlyData {
  mese: string
  ricavi: number
  costi: number
  aCredito: number
  aDebito: number
}

interface InvoiceStats {
  monthly: MonthlyData[]
  totals: {
    ricavi: number
    costi: number
    differenza: number
    ivaCredito: number
    ivaDebito: number
    ivaNetta: number
  }
  topClienti: Array<{ nome: string; totale: number }>
  topFornitori: Array<{ nome: string; totale: number }>
}

function EmptyState({ message = "Nessun dato disponibile per il periodo selezionato" }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground space-y-2 opacity-50">
      <Ban className="w-8 h-8" />
      <p className="text-sm font-medium">{message}</p>
    </div>
  )
}

export default function FattureSituazionePage() {
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [stats, setStats] = useState<InvoiceStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadStats = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/invoices/stats?year=${year}`)
      if (!res.ok) throw new Error('Errore nel caricamento')
      const data = await res.json()
      setStats(data)
    } catch (error) {
      console.error('Errore caricamento statistiche fatture:', error)
      toast.error('Impossibile caricare le statistiche')
      setStats(null)
    } finally {
      setIsLoading(false)
    }
  }, [year])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const hasMonthlyData = stats?.monthly.some(m => m.ricavi > 0 || m.costi > 0)
  const hasIvaData = stats?.monthly.some(m => m.aCredito > 0 || m.aDebito > 0)

  return (
    <>
      <CaricaFattureDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportComplete={loadStats}
      />
      <div className="space-y-6">
        {/* Filters Header */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Anno</span>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-[100px] h-9 text-sm font-medium border-none shadow-none focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2026">2026</SelectItem>
                  <SelectItem value="2025">2025</SelectItem>
                  <SelectItem value="2024">2024</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Divisione</span>
              <Select defaultValue="tutte">
                <SelectTrigger className="w-[150px] h-9 text-sm font-medium border-none shadow-none focus:ring-0">
                  <SelectValue placeholder="Tutte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tutte">Tutte le divisioni</SelectItem>
                  <SelectItem value="cucina">Cucina</SelectItem>
                  <SelectItem value="sala">Sala</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={() => setImportDialogOpen(true)}
            variant="outline"
            size="sm"
          >
            <UploadIcon className="h-4 w-4 mr-2" />
            Carica fatture
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Imponibile Card */}
          <Card className="border-none shadow-sm overflow-hidden bg-white">
            <CardContent className="p-0">
              <div className="p-6 pb-2">
                <h3 className="text-sm font-semibold text-muted-foreground mb-4">Imponibile</h3>
                <div className="h-[200px] w-full">
                  {isLoading ? (
                    <Skeleton className="h-full w-full" />
                  ) : !hasMonthlyData ? (
                    <EmptyState />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats!.monthly} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="mese" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(val) => `${val / 1000}k`} />
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                        <Bar dataKey="ricavi" fill="#29A382" radius={[4, 4, 0, 0]} barSize={12} />
                        <Bar dataKey="costi" fill="#E55C5C" radius={[4, 4, 0, 0]} barSize={12} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
              <div className="bg-slate-50/50 border-t grid grid-cols-3 divide-x p-4">
                <div className="px-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase opacity-70">Ricavi</p>
                  <p className="text-lg font-bold text-[#29A382]">{formatCurrency(stats?.totals.ricavi || 0)}</p>
                </div>
                <div className="px-4">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase opacity-70">Costi</p>
                  <p className="text-lg font-bold text-[#E55C5C]">{formatCurrency(stats?.totals.costi || 0)}</p>
                </div>
                <div className="px-4">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase opacity-70">Differenza</p>
                  <p className={`text-lg font-bold ${(stats?.totals.differenza || 0) >= 0 ? 'text-[#29A382]' : 'text-[#E55C5C]'}`}>
                    {formatCurrency(stats?.totals.differenza || 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* IVA Card */}
          <Card className="border-none shadow-sm overflow-hidden bg-white">
            <CardContent className="p-0">
              <div className="p-6 pb-2">
                <div className="flex items-center gap-1.5 mb-4">
                  <h3 className="text-sm font-semibold text-muted-foreground">Calcolo IVA</h3>
                  <TooltipProvider>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <button className="text-muted-foreground hover:text-foreground transition-colors cursor-help">
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[250px] bg-[#1e293b] text-white border-none p-3 shadow-xl">
                        <p className="leading-relaxed">
                          Basato sugli importi IVA (escluse autofatture).
                          Confrontati con il tuo commercialista per i calcoli ufficiali
                        </p>
                      </TooltipContent>
                    </UITooltip>
                  </TooltipProvider>
                </div>
                <div className="h-[200px] w-full">
                  {isLoading ? (
                    <Skeleton className="h-full w-full" />
                  ) : !hasIvaData ? (
                    <EmptyState />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats!.monthly} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="mese" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(val) => `${val / 100}€`} />
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                        <Bar dataKey="aCredito" fill="#29A382" radius={[4, 4, 0, 0]} barSize={12} />
                        <Bar dataKey="aDebito" fill="#E55C5C" radius={[4, 4, 0, 0]} barSize={12} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
              <div className="bg-slate-50/50 border-t grid grid-cols-3 divide-x p-4">
                <div className="px-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase opacity-70">A credito</p>
                  <p className="text-lg font-bold text-[#29A382]">{formatCurrency(stats?.totals.ivaCredito || 0)}</p>
                </div>
                <div className="px-4">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase opacity-70">A debito</p>
                  <p className="text-lg font-bold text-[#E55C5C]">{formatCurrency(stats?.totals.ivaDebito || 0)}</p>
                </div>
                <div className="px-4">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase opacity-70">IVA netta</p>
                  <p className={`text-lg font-bold ${(stats?.totals.ivaNetta || 0) >= 0 ? 'text-[#29A382]' : 'text-[#E55C5C]'}`}>
                    {formatCurrency(stats?.totals.ivaNetta || 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Clienti e Fornitori */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-12">
          {/* Clienti Table */}
          <Card className="border-none shadow-sm bg-white">
            <div className="p-4 border-b">
              <h3 className="text-sm font-semibold">Clienti</h3>
            </div>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : !stats?.topClienti.length ? (
                <div className="flex flex-col items-center justify-center min-h-[250px] p-8 text-center text-muted-foreground">
                  <Users className="w-12 h-12 mb-4 opacity-20" />
                  <p className="text-sm font-medium">Nessun dato per i clienti</p>
                  <p className="text-xs opacity-70 mt-1">I dati verranno visualizzati non appena verranno registrate le prime fatture attive.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {stats.topClienti.map((cliente, i) => (
                    <div key={cliente.nome} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                        <span className="text-sm font-medium">{cliente.nome}</span>
                      </div>
                      <span className="text-sm font-semibold text-[#29A382]">{formatCurrency(cliente.totale)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Fornitori Table */}
          <Card className="border-none shadow-sm bg-white">
            <div className="p-4 border-b">
              <h3 className="text-sm font-semibold">Fornitori</h3>
            </div>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : !stats?.topFornitori.length ? (
                <div className="flex flex-col items-center justify-center min-h-[250px] p-8 text-center text-muted-foreground">
                  <FileText className="w-12 h-12 mb-4 opacity-20" />
                  <p className="text-sm font-medium">Nessun dato per i fornitori</p>
                  <p className="text-xs opacity-70 mt-1">I dati verranno visualizzati non appena verranno importate o create le fatture passive.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {stats.topFornitori.map((fornitore, i) => (
                    <div key={fornitore.nome} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                        <span className="text-sm font-medium">{fornitore.nome}</span>
                      </div>
                      <span className="text-sm font-semibold text-[#E55C5C]">{formatCurrency(fornitore.totale)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
