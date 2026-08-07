'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Clock, Calendar, CalendarCheck, Palmtree, ArrowLeftRight, FileText, Receipt } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  {
    href: '/portale',
    label: 'Home',
    icon: Home,
  },
  {
    href: '/portale/timbra',
    label: 'Timbra',
    icon: Clock,
  },
  {
    href: '/portale/turni',
    label: 'Turni',
    icon: Calendar,
  },
  {
    href: '/portale/cartellino',
    label: 'Cartellino',
    icon: CalendarCheck,
  },
  {
    href: '/portale/ferie',
    label: 'Ferie',
    icon: Palmtree,
  },
  {
    href: '/portale/scambi',
    label: 'Scambi',
    icon: ArrowLeftRight,
  },
  {
    href: '/portale/documenti',
    label: 'Documenti',
    icon: FileText,
  },
  {
    // La chiusura cassa vive nella dashboard: è l'unica sezione fuori dal
    // portale a cui lo staff ha accesso (vedi src/app/(dashboard)/layout.tsx)
    href: '/chiusura-cassa',
    label: 'Chiusura',
    icon: Receipt,
  },
]

export function PortalNavigation() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/portale' && pathname.startsWith(item.href))

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                // flex-1 e niente larghezza minima: con otto voci una barra a
                // larghezza fissa traboccherebbe sugli schermi stretti
                'flex flex-col items-center justify-center flex-1 min-w-0 h-full px-0.5 transition-colors duration-200 sm:px-1',
                isActive
                  ? 'text-gray-900'
                  : 'text-gray-400 hover:text-gray-600'
              )}
            >
              <div className={cn(
                'flex items-center justify-center mb-1 transition-all duration-200',
                isActive
                  ? 'bg-gray-100 rounded-full h-10 w-10'
                  : 'h-5 w-5'
              )}>
                <item.icon className={cn(
                  'h-5 w-5',
                  isActive && 'stroke-[2.5]'
                )} />
              </div>
              {/* A 390px le otto voci hanno ~48px a testa: senza w-full+truncate
                  le etichette lunghe (Documenti, Cartellino) sbordano dalla
                  propria cella e si attaccano a quella accanto */}
              <span className={cn(
                'w-full truncate text-center text-[9px] tracking-tight sm:text-[10px] sm:tracking-normal',
                isActive ? 'font-medium' : 'font-normal'
              )}>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
