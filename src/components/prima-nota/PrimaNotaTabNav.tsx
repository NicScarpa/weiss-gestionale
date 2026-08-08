'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export function PrimaNotaTabNav() {
  const pathname = usePathname()
  const activeTab = pathname?.split('/').pop() || 'movimenti'
  const stripRef = useRef<HTMLDivElement>(null)
  const [restaDaScorrere, setRestaDaScorrere] = useState(false)

  const tabs = [
    { value: 'movimenti', label: 'Movimenti' },
    { value: 'pagamenti', label: 'Pagamenti' },
    { value: 'regole', label: 'Regole' },
  ] as const

  // Sotto sm le tre tab non ci stanno: la sfumatura sul bordo destro è l'unico
  // indizio che ce n'è dell'altra, visto che gli scrollbar overlay dei telefoni
  // non si vedono da fermi
  useEffect(() => {
    const strip = stripRef.current
    if (!strip) return

    const aggiorna = () =>
      setRestaDaScorrere(strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1)

    aggiorna()
    strip.addEventListener('scroll', aggiorna, { passive: true })
    window.addEventListener('resize', aggiorna)
    return () => {
      strip.removeEventListener('scroll', aggiorna)
      window.removeEventListener('resize', aggiorna)
    }
  }, [])

  // Cambiando sezione la tab attiva può essere fuori dalla parte visibile
  useEffect(() => {
    stripRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [pathname])

  return (
    <div
      ref={stripRef}
      className={cn(
        'flex gap-2 p-1 bg-muted/50 rounded-lg overflow-x-auto',
        restaDaScorrere &&
          '[mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)]'
      )}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.value
        return (
          <Link
            key={tab.value}
            href={tab.value === 'movimenti' ? '/prima-nota' : tab.value === 'pagamenti' ? '/prima-nota/pagamenti' : '/prima-nota/regole'}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap shrink-0',
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
