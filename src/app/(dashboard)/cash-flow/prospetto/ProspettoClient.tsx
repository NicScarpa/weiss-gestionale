'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ProspettoTable } from '@/components/cashflow/ProspettoTable'
import { ControlliQuadratura } from '@/components/cashflow/ControlliQuadratura'
import type { Prospetto } from '@/lib/cashflow/prospetto'
import type { EsitoControllo } from '@/lib/cashflow/controlli'

interface Risposta {
  prospetto: Prospetto
  controlli: EsitoControllo[]
}

export function ProspettoClient({ annoIniziale }: { annoIniziale: number }) {
  const [anno, setAnno] = useState(annoIniziale)

  // React Query come nel resto del progetto (vedi src/app/(dashboard)/cash-flow/page.tsx):
  // l'anno sta nella chiave, quindi cambiarlo rifà la richiesta e i risultati già
  // visti restano in cache invece di essere richiesti da capo.
  const { data: dati, error: errore, isLoading: caricamento } = useQuery({
    queryKey: ['cashflow', 'prospetto', anno],
    queryFn: async (): Promise<Risposta> => {
      const risposta = await fetch(`/api/cashflow/prospetto?anno=${anno}`)
      if (!risposta.ok) {
        const corpo = await risposta.json().catch(() => ({}))
        throw new Error(corpo.error ?? 'Impossibile caricare il prospetto di cash flow')
      }
      return risposta.json()
    },
  })

  const anni = Array.from({ length: 5 }, (_, i) => annoIniziale - i)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Prospetto di cash flow</h1>
        <Select value={String(anno)} onValueChange={(v) => setAnno(Number(v))}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {anni.map((a) => (
              <SelectItem key={a} value={String(a)}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {errore && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {errore instanceof Error ? errore.message : 'Errore nel caricamento del prospetto'}
        </div>
      )}

      {dati && <ControlliQuadratura controlli={dati.controlli} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Solo movimenti che toccano cassa o banca. Entrate positive, uscite negative.
          </CardTitle>
        </CardHeader>
        <CardContent>
          {caricamento && <p className="text-sm text-muted-foreground">Caricamento…</p>}
          {dati && (
            <ProspettoTable
              righe={dati.prospetto.righe}
              cassaIniziale={dati.prospetto.cassaIniziale}
              cassaFinale={dati.prospetto.cassaFinale}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
