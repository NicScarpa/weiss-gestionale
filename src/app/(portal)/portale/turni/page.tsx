'use client'

import { ShiftCalendarView } from '@/components/portal/ShiftCalendarView'

export default function PortalTurniPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">I Miei Turni</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Visualizza il calendario dei tuoi turni programmati
        </p>
      </div>

      <ShiftCalendarView />
    </div>
  )
}
