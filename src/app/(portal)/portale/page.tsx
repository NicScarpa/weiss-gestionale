'use client'

import { useSession } from 'next-auth/react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Sun, Cloud, Moon } from 'lucide-react'
import { UpcomingShifts } from '@/components/portal/UpcomingShifts'
import { LeaveBalanceCard } from '@/components/portal/LeaveBalanceCard'

function getGreeting(): { text: string; icon: React.ReactNode } {
  const hour = new Date().getHours()
  if (hour < 12) {
    return { text: 'Buongiorno', icon: <Sun className="h-6 w-6 text-amber-500" /> }
  } else if (hour < 18) {
    return { text: 'Buon pomeriggio', icon: <Cloud className="h-6 w-6 text-blue-400" /> }
  } else {
    return { text: 'Buonasera', icon: <Moon className="h-6 w-6 text-indigo-400" /> }
  }
}

export default function PortalDashboardPage() {
  const { data: session } = useSession()
  const greeting = getGreeting()
  const today = format(new Date(), "EEEE d MMMM yyyy", { locale: it })

  return (
    <div className="space-y-6">
      {/* Header di benvenuto */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          {greeting.icon}
          <span className="text-xl font-semibold">
            {greeting.text}, {session?.user?.firstName || 'Utente'}!
          </span>
        </div>
        <p className="text-amber-100 capitalize">{today}</p>
      </div>

      {/* Prossimi turni */}
      <UpcomingShifts />

      {/* Saldo ferie */}
      <LeaveBalanceCard />
    </div>
  )
}
