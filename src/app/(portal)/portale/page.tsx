'use client'

import { useSession } from 'next-auth/react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Sun, Cloud, Moon, Clock, Palmtree, Calendar, ArrowLeftRight } from 'lucide-react'
import Link from 'next/link'
import { UpcomingShifts } from '@/components/portal/UpcomingShifts'
import { LeaveBalanceCard } from '@/components/portal/LeaveBalanceCard'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Buongiorno'
  if (hour < 18) return 'Buon pomeriggio'
  return 'Buonasera'
}

function GreetingIcon({ className }: { className?: string }) {
  const hour = new Date().getHours()
  if (hour < 12) return <Sun className={className} />
  if (hour < 18) return <Cloud className={className} />
  return <Moon className={className} />
}

const quickActions = [
  {
    href: '/portale/timbra',
    label: 'Timbra',
    icon: Clock,
  },
  {
    href: '/portale/ferie',
    label: 'Ferie',
    icon: Palmtree,
  },
  {
    href: '/portale/turni',
    label: 'Turni',
    icon: Calendar,
  },
  {
    href: '/portale/scambi',
    label: 'Scambi',
    icon: ArrowLeftRight,
  },
]

export default function PortalDashboardPage() {
  const { data: session } = useSession()
  const greeting = getGreeting()
  const today = format(new Date(), "EEEE d MMMM", { locale: it })

  return (
    <div className="space-y-6">
      {/* Saluto semplice */}
      <div className="flex items-center gap-2">
        <GreetingIcon className="h-5 w-5 text-portal-primary" />
        <span className="text-lg font-semibold text-gray-900">
          {greeting}, {session?.user?.firstName || 'Utente'}!
        </span>
        <span className="text-sm text-gray-400 capitalize ml-auto">{today}</span>
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-4 gap-3">
        {quickActions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="flex flex-col items-center gap-2 py-3"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-portal-primary-bg">
              <action.icon className="h-6 w-6 text-portal-primary" />
            </div>
            <span className="text-xs font-medium text-gray-700">{action.label}</span>
          </Link>
        ))}
      </div>

      {/* Prossimi turni */}
      <UpcomingShifts />

      {/* Saldo ferie */}
      <LeaveBalanceCard />
    </div>
  )
}
