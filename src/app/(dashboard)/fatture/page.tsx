'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TrendingUp, TrendingDown, FileText, Ban, Users, Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export default function FattureSituazionePage() {
  const [year, setYear] = useState('2026')

  // Inizializziamo con null per indicare che non ci sono dati o sono in caricamento
  // In futuro questi dati verranno caricati da un'API reale
  const stats = null

  const EmptyState = ({ message = "Nessun dato disponibile per il periodo selezionato" }: { message?: string }) => (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground space-y-2 opacity-50">
      <Ban className="w-8 h-8" />
      <p className="text-sm font-medium">{message}</p>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Filters Header */}
      <div className="flex items-center gap-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Anno</span>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-[100px] h-9 text-sm font-medium border-none shadow-none focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2026">2026</SelectItem>
              <SelectItem value="2025">2025</SelectItem>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Imponibile Card */}
        <Card className="border-none shadow-sm overflow-hidden bg-white">
          <CardContent className="p-0">
            <div className="p-6 pb-2">
              <h3 className="text-sm font-semibold text-muted-foreground mb-4">Imponibile</h3>
              <div className="h-[200px] w-full">
                {!stats ? (
                  <EmptyState />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[]} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis dataKey="mese" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(val) => `${val / 1000}k`} />
                      <Tooltip />
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
                <p className="text-lg font-bold text-[#29A382]">{formatCurrency(0)}</p>
              </div>
              <div className="px-4">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase opacity-70">Costi</p>
                <p className="text-lg font-bold text-[#E55C5C]">{formatCurrency(0)}</p>
              </div>
              <div className="px-4">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase opacity-70">Differenza</p>
                <p className="text-lg font-bold text-slate-400">
                  {formatCurrency(0)}
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
                  <Tooltip>
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
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="h-[200px] w-full">
                {!stats ? (
                  <EmptyState />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[]} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis dataKey="mese" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(val) => `${val / 100}€`} />
                      <Tooltip />
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
                <p className="text-lg font-bold text-[#29A382]">{formatCurrency(0)}</p>
              </div>
              <div className="px-4">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase opacity-70">A debito</p>
                <p className="text-lg font-bold text-[#E55C5C]">{formatCurrency(0)}</p>
              </div>
              <div className="px-4">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase opacity-70">IVA netta</p>
                <p className="text-lg font-bold text-slate-400">
                  {formatCurrency(0)}
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
            <div className="flex flex-col items-center justify-center min-h-[250px] p-8 text-center text-muted-foreground">
              <Users className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm font-medium">Nessun dato per i clienti</p>
              <p className="text-xs opacity-70 mt-1">I dati verranno visualizzati non appena verranno registrate le prime fatture attive.</p>
            </div>
          </CardContent>
        </Card>

        {/* Fornitori Table */}
        <Card className="border-none shadow-sm bg-white">
          <div className="p-4 border-b">
            <h3 className="text-sm font-semibold">Fornitori</h3>
          </div>
          <CardContent className="p-0">
            <div className="flex flex-col items-center justify-center min-h-[250px] p-8 text-center text-muted-foreground">
              <FileText className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm font-medium">Nessun dato per i fornitori</p>
              <p className="text-xs opacity-70 mt-1">I dati verranno visualizzati non appena verranno importate o create le fatture passive.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
