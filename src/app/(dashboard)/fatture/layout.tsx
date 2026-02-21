'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export default function FattureLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  const tabs = [
    { value: '/fatture', label: 'Situazione' },
    { value: '/fatture/ricevute', label: 'Ricevute' },
    { value: '/fatture/emesse', label: 'Emesse' },
    { value: '/fatture/bozze', label: 'Bozze' },
    { value: '/fatture/corrispettivi', label: 'Corrispettivi' },
    { value: '/fatture/esterometro', label: 'Esterometro' },
    { value: '/fatture/importa', label: 'Importa' },
  ]

  const isActive = (href: string) => pathname === href

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg w-fit overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => {
          const isTabActive = isActive(tab.value)
          return (
            <Link
              key={tab.value}
              href={tab.value}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium transition-colors relative whitespace-nowrap',
                isTabActive
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
