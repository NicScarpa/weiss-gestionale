'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export default function ScadenzarioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  const tabs = [
    { value: '/scadenzario', label: 'Scadenzario' },
    { value: '/scadenzario/ricorrenze', label: 'Ricorrenze' },
    { value: '/scadenzario/regole', label: 'Regole' },
  ]

  const isActive = (href: string) => {
    if (href === '/scadenzario') {
      return pathname === '/scadenzario' || (
        pathname.startsWith('/scadenzario/') &&
        !pathname.startsWith('/scadenzario/ricorrenze') &&
        !pathname.startsWith('/scadenzario/regole')
      )
    }
    return pathname.startsWith(href)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg w-fit">
        {tabs.map((tab) => {
          const tabActive = isActive(tab.value)
          return (
            <Link
              key={tab.value}
              href={tab.value}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium transition-colors relative whitespace-nowrap',
                tabActive
                  ? 'bg-black text-white shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>

      {children}
    </div>
  )
}
