'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { CalendarCheck, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatHoursMinutes } from '@/lib/attendance/format-hours'

/**
 * Le ore del mese in corso, in sintesi, nella home del portale. Il dettaglio
 * giorno per giorno sta in /portale/cartellino: questa card serve solo a far
 * sapere a colpo d'occhio "a quanto sono".
 */

interface TotaliCartellino {
  totals: { total: number; overtime: number }
  contractHoursWeek: number | null
}

export function MonthHoursCard() {
  const oggi = new Date()
  const month = oggi.getMonth() + 1
  const year = oggi.getFullYear()

  const { data, isLoading } = useQuery<TotaliCartellino>({
    queryKey: ['cartellino', 'me', month, year],
    queryFn: async () => {
      const res = await fetch(`/api/cartellino?month=${month}&year=${year}`)
      if (!res.ok) throw new Error('Errore nel caricamento delle ore del mese')
      const corpo = await res.json()
      return corpo.data
    },
  })

  if (isLoading) {
    return <Skeleton className="h-20 w-full rounded-2xl" />
  }

  if (!data) {
    return null
  }

  return (
    <Link href="/portale/cartellino">
      <Card className="rounded-2xl border-gray-100 transition-colors hover:bg-gray-50">
        <CardContent className="flex items-center gap-3 py-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100">
            <CalendarCheck className="h-5 w-5 text-gray-700" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-900">Ore del mese</div>
            <div className="text-xs text-gray-500">
              {formatHoursMinutes(data.totals.total)} lavorate
              {data.totals.overtime > 0 &&
                ` · ${formatHoursMinutes(data.totals.overtime)} di straordinario`}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </CardContent>
      </Card>
    </Link>
  )
}
