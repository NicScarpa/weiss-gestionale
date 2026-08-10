'use client'

import Link from 'next/link'
import { CircleHelp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MonthlyTimesheet } from '@/components/attendance/MonthlyTimesheet'

/**
 * Il cartellino personale nel portale, in sola lettura: le stesse ore che
 * finiranno nell'export paghe, così ognuno può controllare il proprio mese
 * senza chiedere in ufficio.
 */
export default function CartellinoPortalePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Il mio cartellino</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Le ore riconosciute del mese, giorno per giorno
          </p>
        </div>
        <Button variant="outline" size="sm" asChild className="rounded-xl shrink-0">
          <Link href="/portale/correzioni">
            <CircleHelp className="h-4 w-4 mr-1" />
            Manca una timbratura?
          </Link>
        </Button>
      </div>

      <MonthlyTimesheet showName={false} />
    </div>
  )
}
