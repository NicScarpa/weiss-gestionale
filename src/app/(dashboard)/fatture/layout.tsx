'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export default function FattureLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const stripRef = useRef<HTMLDivElement>(null)
  const [restaDaScorrere, setRestaDaScorrere] = useState(false)

  const tabs = [
    { value: '/fatture', label: 'Situazione' },
    { value: '/fatture/ricevute', label: 'Ricevute' },
    { value: '/fatture/emesse', label: 'Emesse' },
    { value: '/fatture/corrispettivi', label: 'Corrispettivi' },
    { value: '/fatture/memorie', label: 'Memorie' },
  ]

  const isActive = (href: string) => pathname === href

  // Sotto sm le quattro tab non ci stanno: la sfumatura sul bordo destro è
  // l'unico indizio che ce n'è dell'altra, visto che gli scrollbar overlay dei
  // telefoni non si vedono da fermi
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
    <div className="space-y-6">
      {/* max-w-full: senza il tetto, w-fit allarga il contenitore quanto le tab
          e overflow-x-auto non entra mai in funzione, così sotto sm l'ultima
          tab finisce fuori schermo e a scorrere è la pagina intera */}
      <div
        ref={stripRef}
        className={cn(
          'flex items-center gap-1 p-1 bg-muted/50 rounded-lg w-fit max-w-full overflow-x-auto scrollbar-hide',
          restaDaScorrere &&
            '[mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)]'
        )}
      >
        {tabs.map((tab) => {
          const isTabActive = isActive(tab.value)
          return (
            <Link
              key={tab.value}
              href={tab.value}
              aria-current={isTabActive ? 'page' : undefined}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium transition-colors relative whitespace-nowrap shrink-0',
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
