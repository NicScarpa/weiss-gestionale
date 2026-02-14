'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export function PrimaNotaTabNav() {
  const pathname = usePathname()
  const activeTab = pathname?.split('/').pop() || 'movimenti'

  const tabs = [
    { value: 'movimenti', label: 'Movimenti' },
    { value: 'pagamenti', label: 'Pagamenti' },
    { value: 'regole', label: 'Regole' },
  ] as const

  return (
    <div className="flex gap-2 p-1 bg-muted/50 rounded-lg">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.value
        return (
          <Link
            key={tab.value}
            href={tab.value === 'movimenti' ? '/prima-nota' : tab.value === 'pagamenti' ? '/prima-nota/pagamenti' : '/prima-nota/regole'}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-medium transition-colors',
              isActive
                ? 'bg-black text-white shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
