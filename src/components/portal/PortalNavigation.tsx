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
                  ? 'text-portal-primary'
                  : 'text-gray-400 hover:text-gray-600'
              )}
            >
              <div className={cn(
                'flex items-center justify-center mb-1 transition-all duration-200',
                isActive
                  ? 'bg-portal-primary-bg rounded-full h-10 w-10'
                  : 'h-5 w-5'
              )}>
                <item.icon className={cn(
                  'h-5 w-5',
                  isActive && 'stroke-[2.5]'
                )} />
              </div>
              <span className={cn(
                'text-[10px]',
                isActive ? 'font-medium' : 'font-normal'
              )}>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
