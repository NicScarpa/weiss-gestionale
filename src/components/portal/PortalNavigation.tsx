'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Calendar, Palmtree, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  {
    href: '/portale',
    label: 'Home',
    icon: Home,
  },
  {
    href: '/portale/turni',
    label: 'Turni',
    icon: Calendar,
  },
  {
    href: '/portale/ferie',
    label: 'Ferie',
    icon: Palmtree,
  },
  {
    href: '/portale/profilo',
    label: 'Profilo',
    icon: User,
  },
]

export function PortalNavigation() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t shadow-lg">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/portale' && pathname.startsWith(item.href))

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center min-w-[64px] h-full px-3 transition-colors',
                isActive
                  ? 'text-amber-600'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              <item.icon className={cn(
                'h-6 w-6 mb-1',
                isActive && 'stroke-2'
              )} />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
