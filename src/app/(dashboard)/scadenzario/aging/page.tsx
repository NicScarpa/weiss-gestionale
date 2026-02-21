"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AgingChart } from '@/components/scadenzario/aging-chart'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface AgingBand {
  fascia: string
  conteggio: number
  importo_totale: number
  importo_residuo: number
}

export default function AgingPage() {
  const router = useRouter()
  const [attive, setAttive] = useState<AgingBand[]>([])
  const [passive, setPassive] = useState<AgingBand[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchAging = async () => {
      setIsLoading(true)
      try {
        const resp = await fetch('/api/scadenzario/aging')
        const data = await resp.json()
        if (resp.ok) {
          setAttive(data.attive || [])
          setPassive(data.passive || [])
        }
      } catch (error) {
        console.error('Errore fetch aging:', error)
      }
      setIsLoading(false)
    }
    fetchAging()
  }, [])

  const totaleAttive = attive.reduce((sum, b) => sum + b.importo_residuo, 0)
  const totalePassive = passive.reduce((sum, b) => sum + b.importo_residuo, 0)

  if (isLoading) {
    return (
      <div className="flex-1 p-8">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Caricamento...
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 p-8">
      {/* Header */}
      <div className="space-y-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/scadenzario')}
          className="gap-2 text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Scadenzario
        </Button>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Aging Scadenze
        </h1>
        <p className="text-muted-foreground">
          Analisi delle scadenze per fascia di anzianità
        </p>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribuzione per fascia</CardTitle>
        </CardHeader>
        <CardContent>
          <AgingChart attive={attive} passive={passive} />
        </CardContent>
      </Card>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attive */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span className="text-emerald-700">Da incassare</span>
              <span className="text-sm font-normal text-muted-foreground">
                Totale: {formatCurrency(totaleAttive)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fascia</TableHead>
                  <TableHead className="text-right">N.</TableHead>
                  <TableHead className="text-right">Totale</TableHead>
                  <TableHead className="text-right">Residuo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attive.map((band) => (
                  <TableRow
                    key={band.fascia}
                    className="cursor-pointer hover:bg-emerald-50/50"
                    onClick={() => router.push('/scadenzario?tipo=attiva&stato=aperta')}
                  >
                    <TableCell className="font-medium">{band.fascia}</TableCell>
                    <TableCell className="text-right">{band.conteggio}</TableCell>
                    <TableCell className="text-right">{formatCurrency(band.importo_totale)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(band.importo_residuo)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Passive */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span className="text-rose-700">Da pagare</span>
              <span className="text-sm font-normal text-muted-foreground">
                Totale: {formatCurrency(totalePassive)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fascia</TableHead>
                  <TableHead className="text-right">N.</TableHead>
                  <TableHead className="text-right">Totale</TableHead>
                  <TableHead className="text-right">Residuo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {passive.map((band) => (
                  <TableRow
                    key={band.fascia}
                    className="cursor-pointer hover:bg-rose-50/50"
                    onClick={() => router.push('/scadenzario?tipo=passiva&stato=aperta')}
                  >
                    <TableCell className="font-medium">{band.fascia}</TableCell>
                    <TableCell className="text-right">{band.conteggio}</TableCell>
                    <TableCell className="text-right">{formatCurrency(band.importo_totale)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(band.importo_residuo)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
