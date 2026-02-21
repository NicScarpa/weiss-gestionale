'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Receipt,
  BookOpen,
  FileText,
  BarChart3,
  Settings,
  Users,
  CreditCard,
  RefreshCw,
  CalendarClock,
  ListChecks,
} from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useState, useEffect, useMemo } from 'react'

import { motion, AnimatePresence } from 'framer-motion'

// Navigazione principale (Rail)
const navigationItems = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  {
    name: 'Prima Nota',
    href: '/prima-nota/movimenti',
    icon: BookOpen,
    sections: [
      {
        title: 'Contabilità',
        items: [
          { name: 'Movimenti', href: '/prima-nota/movimenti', icon: BookOpen },
          { name: 'Pagamenti', href: '/prima-nota/pagamenti', icon: CreditCard },
          { name: 'Regole', href: '/prima-nota/regole', icon: ListChecks },
          { name: 'Riconciliazione', href: '/riconciliazione', icon: RefreshCw },
          { name: 'Chiusure Cassa', href: '/chiusura-cassa', icon: Receipt },
        ],
      },
    ],
  },
  {
    name: 'Fatturazione',
    href: '/fatture',
    icon: FileText,
    sections: [
      {
        title: 'Documenti',
        items: [
          { name: 'Fatture', href: '/fatture' },
          { name: 'Prodotti', href: '/prodotti' },
        ],
      },
      {
        title: 'Configurazione',
        items: [
          { name: 'Fornitori', href: '/anagrafiche/fornitori' },
          { name: 'Clienti', href: '/anagrafiche/clienti' }
        ]
      }
    ],
  },
  {
    name: 'Budget',
    href: '/budget',
    icon: BarChart3,
    sections: [
      {
        title: 'Analisi',
        items: [
          { name: 'Situazione', href: '/budget' },
          { name: 'Report', href: '/report' },
        ],
      },
      {
        title: 'Configurazione',
        items: [
          { name: 'Settings Budget', href: '/impostazioni/budget' },
        ]
      }
    ],
  },
  {
    name: 'Personale',
    icon: Users,
    sections: [
      {
        title: 'Anagrafiche',
        items: [
          { name: 'Dipendenti', href: '/anagrafiche/personale' },
          { name: 'Livelli di Accesso', href: '/anagrafiche/utenti' },
        ],
      },
      {
        title: 'Gestione',
        items: [
          { name: 'Turni', href: '/turni' },
          { name: 'Ferie/Permessi', href: '/ferie-permessi' },
          { name: 'Presenze', href: '/presenze' },
        ],
      },
    ],
  },
  {
    name: 'Scadenzario',
    href: '/scadenzario',
    icon: CalendarClock,
  },
  {
    name: 'Impostazioni',
    href: '/impostazioni/generali',
    icon: Settings,
    sections: [
      {
        title: 'Configurazione',
        items: [
          { name: 'Generali', href: '/impostazioni/generali' },
          { name: 'Piano dei conti', href: '/impostazioni/conti' },
          { name: 'Banche e Conti', href: '/impostazioni/banche-e-conti' },
          { name: 'Budget', href: '/impostazioni/budget' },
        ],
      },
      {
        title: 'Anagrafiche',
        items: [
          { name: 'Anagrafiche', href: '/anagrafiche' },
        ],
      },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [isSidebarHovered, setIsSidebarHovered] = useState(false)
  const [scaduteCount, setScaduteCount] = useState(0)

  // Fetch scadenze scadute per badge
  useEffect(() => {
    const fetchScadute = async () => {
      try {
        const resp = await fetch('/api/scadenzario/summary')
        if (resp.ok) {
          const data = await resp.json()
          setScaduteCount(data.totaleScadute || 0)
        }
      } catch {
        // Non-critical, ignora errori
      }
    }
    fetchScadute()
  }, [pathname]) // Ricarica quando cambia pagina

  // Determina quale voce principale è attiva basandosi sul pathname
  const activeItem = useMemo(() => {
    for (const item of navigationItems) {
      if (item.href === pathname) return item.name
      if (item.sections) {
        for (const section of item.sections) {
          for (const subItem of section.items) {
            if (pathname.startsWith(subItem.href)) return item.name
          }
        }
      }
    }
    return null
  }, [pathname])

  const currentDisplayItem = hoveredItem || activeItem
  const activeNavigation = navigationItems.find(item => item.name === currentDisplayItem)
  const hasSubSections = activeNavigation?.sections && activeNavigation.sections.length > 0

  return (
    <div
      className="flex h-full relative"
      onMouseEnter={() => setIsSidebarHovered(true)}
      onMouseLeave={() => { setIsSidebarHovered(false); setHoveredItem(null) }}
    >
      {/* Rail Sidebar (Livello 1 - Icone) */}
      <aside className="w-16 h-full bg-slate-900 flex flex-col items-center py-4 z-50 border-r border-slate-800">
        <div className="mb-8 px-2 overflow-hidden text-center">
          <div className="w-8 h-8 mx-auto bg-white rounded flex items-center justify-center text-slate-900 font-bold text-sm">
            WS
          </div>
        </div>

        <nav className="flex-1 w-full space-y-2 px-2">
          {navigationItems.map((item) => {
            const isActive = activeItem === item.name
            const isHovered = hoveredItem === item.name
            const showBadge = item.name === 'Scadenzario' && scaduteCount > 0

            return (
              <Tooltip key={item.name}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href || '#'}
                    onMouseEnter={() => setHoveredItem(item.name)}
                    className={cn(
                      "w-full aspect-square flex items-center justify-center rounded-lg transition-all relative group",
                      isActive || isHovered
                        ? "bg-slate-800 text-white"
                        : "text-slate-400 hover:bg-slate-800 hover:text-white"
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    {showBadge && (
                      <span className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                        {scaduteCount > 99 ? '99+' : scaduteCount}
                      </span>
                    )}
                    {(isActive || isHovered) && (
                      <motion.div
                        layoutId="activeIndicator"
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-r-full"
                      />
                    )}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10} className="bg-slate-900 border-slate-800 text-white">
                  {item.name}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </nav>
      </aside>

      {/* Flyout Panel (Livello 2 - Sottovoci) */}
      <AnimatePresence>
        {isSidebarHovered && hasSubSections && activeNavigation && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 256, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="h-full bg-white border-r border-slate-200 z-40 overflow-hidden shadow-xl"
          >
            <div className="w-64 py-6 px-4 whitespace-nowrap">
              <h2 className="text-xl font-bold text-slate-900 mb-8 px-2">
                {activeNavigation.name}
              </h2>

              <div className="space-y-8">
                {activeNavigation.sections?.map((section) => (
                  <div key={section.title}>
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-2">
                      {section.title}
                    </h3>
                    <div className="space-y-1 text-sm">
                      {section.items.map((subItem) => {
                        const isSubActive = pathname === subItem.href
                        return (
                          <Link
                            key={subItem.name}
                            href={subItem.href}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2 rounded-md font-medium transition-colors",
                              isSubActive
                                ? "bg-slate-100 text-slate-900"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                            )}
                          >
                            <span>{subItem.name}</span>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  )
}
