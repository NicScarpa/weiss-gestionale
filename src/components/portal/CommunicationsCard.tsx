'use client'

import Link from 'next/link'
import { ChevronRight, Megaphone } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useComunicazioniVisibili } from '@/hooks/useComunicazioni'

/**
 * Le comunicazioni aziendali in sintesi, nella home del portale: quante ne
 * restano da leggere e qual è l'ultima. Il testo intero sta in
 * /portale/comunicazioni — qui serve solo a far sapere che c'è qualcosa.
 */
export function CommunicationsCard() {
  const { data, isLoading } = useComunicazioniVisibili()

  if (isLoading) {
    return <Skeleton className="h-20 w-full rounded-2xl" />
  }

  const comunicazioni = data?.data ?? []
  const nonLette = comunicazioni.filter((c) => !c.letta).length
  // La card resta anche a bacheca vuota: è l'unica strada per arrivarci, e
  // sparire lascerebbe la pagina irraggiungibile.
  const sottotitolo =
    comunicazioni.length === 0
      ? 'Nessuna comunicazione'
      : nonLette > 0
        ? `${nonLette} da leggere · ${comunicazioni[0].title}`
        : comunicazioni[0].title

  return (
    <Link href="/portale/comunicazioni">
      <Card className="rounded-2xl border-gray-100 transition-colors hover:bg-gray-50">
        <CardContent className="flex items-center gap-3 py-4">
          <div
            className={cn(
              'relative flex h-11 w-11 items-center justify-center rounded-xl',
              nonLette > 0 ? 'bg-gray-900' : 'bg-gray-100'
            )}
          >
            <Megaphone
              className={cn(
                'h-5 w-5',
                nonLette > 0 ? 'text-white' : 'text-gray-700'
              )}
            />
            {nonLette > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {nonLette > 9 ? '9+' : nonLette}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-gray-900">Comunicazioni</div>
            <div className="truncate text-xs text-gray-500">{sottotitolo}</div>
          </div>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
        </CardContent>
      </Card>
    </Link>
  )
}
