'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Clock, Calendar, Palmtree, ArrowLeftRight } from 'lucide-react'
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
    href: '/portale/ferie',
    label: 'Ferie',
    icon: Palmtree,
  },
  {
    href: '/portale/scambi',
    label: 'Scambi',
    icon: ArrowLeftRight,
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
              className={cn(
                'flex flex-col items-center justify-center min-w-[64px] h-full px-3 transition-colors duration-200',
                isActive
                  ? 'text-green-500'
                  : 'text-gray-400 hover:text-gray-600'
              )}
            >
              <item.icon className={cn(
                'h-5 w-5 mb-1',
                isActive && 'stroke-[2.5]'
              )} />
              <span className={cn(
                'text-[10px]',
                isActive ? 'font-medium' : 'font-normal'
              )}>{item.label}</span>
              {isActive && (
                <span className="w-1 h-1 rounded-full bg-green-500 mt-0.5" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
