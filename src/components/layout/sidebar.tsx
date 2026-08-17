'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useState, useEffect, useMemo } from 'react'

import { motion, AnimatePresence } from 'framer-motion'
import { navigazionePerRuolo, VOCE_IN_FONDO } from './navigation'

interface SidebarProps {
  /** Ruolo dell'utente, letto dal server nel layout. */
  role: string
}

export function Sidebar({ role }: SidebarProps) {
  const navItems = useMemo(() => navigazionePerRuolo(role), [role])
  const isStaff = role === 'staff'
  const pathname = usePathname()
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [isSidebarHovered, setIsSidebarHovered] = useState(false)
  const [scaduteCount, setScaduteCount] = useState(0)

  // Fetch scadenze scadute per badge. Lo staff non ha la voce Scadenzario e
  // l'API gli risponde 403: la chiamata sarebbe solo rumore nei log.
  useEffect(() => {
    if (isStaff) return

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
  }, [pathname, isStaff]) // Ricarica quando cambia pagina

  // Determina quale voce principale è attiva basandosi sul pathname.
  // Si guarda `navItems`, cioè il menu del ruolo: leggendo la lista completa,
  // per lo staff sulla chiusura cassa risultava attiva «Prima Nota» e il
  // pannello a comparsa ne mostrava tutte le sottovoci.
  const activeItem = useMemo(() => {
    for (const item of navItems) {
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
  }, [pathname, navItems])

  const currentDisplayItem = hoveredItem || activeItem
  const activeNavigation = navItems.find(item => item.name === currentDisplayItem)
  const hasSubSections = activeNavigation?.sections && activeNavigation.sections.length > 0

  return (
    // Da telefono la barra non c'è: rail (64px) e pannello a comparsa (256px)
    // sono elementi di un flex row, quindi rubavano fino a 320 dei 390px dello
    // schermo al contenuto, che finiva incolonnato una parola per riga. Su
    // mobile la navigazione sta nel cassetto dell'header (`MobileNav`).
    <div
      className="hidden md:flex h-full relative"
      onMouseEnter={() => setIsSidebarHovered(true)}
      onMouseLeave={() => { setIsSidebarHovered(false); setHoveredItem(null) }}
    >
      {/* Rail Sidebar (Livello 1 - Icone) */}
      <aside className="w-16 h-full bg-slate-900 flex flex-col items-center py-4 z-50 border-r border-slate-800">
        <div className="mb-8 px-2 overflow-hidden text-center">
          {/* Il quadrato del logo resta bianco in entrambi i temi: la sigla
              sopra dev'essere scura sempre, non seguire il tema. */}
          <div className="w-8 h-8 mx-auto bg-white rounded flex items-center justify-center text-slate-900 font-bold text-sm">
            WS
          </div>
        </div>

        <nav className="flex-1 w-full flex flex-col px-2">
          <div className="space-y-2">
            {navItems.filter(item => item.name !== VOCE_IN_FONDO).map((item) => {
              const isActive = activeItem === item.name
              const isHovered = hoveredItem === item.name
              const showBadge = item.name === 'Scadenzario' && scaduteCount > 0

              // L'icona è l'unico contenuto del controllo: senza aria-label la
              // rail è una fila di link vuoti per screen reader
              const label = showBadge
                ? `${item.name}, ${scaduteCount} scadute`
                : item.name

              const railClass = cn(
                "w-full aspect-square flex items-center justify-center rounded-lg transition-all relative group",
                isActive || isHovered
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )

              const railContent = (
                <>
                  <item.icon aria-hidden="true" className="h-5 w-5" />
                  {showBadge && (
                    <span
                      aria-hidden="true"
                      className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white"
                    >
                      {scaduteCount > 99 ? '99+' : scaduteCount}
                    </span>
                  )}
                  {(isActive || isHovered) && (
                    <motion.div
                      layoutId="activeIndicator"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-r-full"
                    />
                  )}
                </>
              )

              return item.href ? (
                <Link
                  key={item.name}
                  href={item.href}
                  aria-label={label}
                  aria-current={isActive ? 'page' : undefined}
                  onMouseEnter={() => setHoveredItem(item.name)}
                  className={railClass}
                >
                  {railContent}
                </Link>
              ) : (
                // Voci senza pagina propria (Personale): un link a "#" non
                // porta da nessuna parte, servono ad aprire il sottomenu
                <button
                  key={item.name}
                  type="button"
                  aria-label={label}
                  aria-expanded={isHovered}
                  onMouseEnter={() => setHoveredItem(item.name)}
                  onClick={() => setHoveredItem(item.name)}
                  className={railClass}
                >
                  {railContent}
                </button>
              )
            })}
          </div>

          {/* Impostazioni - ancorato in basso */}
          <div className="mt-auto pb-2">
            {navItems.filter(item => item.name === VOCE_IN_FONDO).map((item) => {
              const isActive = activeItem === item.name
              const isHovered = hoveredItem === item.name

              return (
                <Link
                  key={item.name}
                  href={item.href || '#'}
                  aria-label={item.name}
                  aria-current={isActive ? 'page' : undefined}
                  onMouseEnter={() => setHoveredItem(item.name)}
                  className={cn(
                    "w-full aspect-square flex items-center justify-center rounded-lg transition-all relative group",
                    isActive || isHovered
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:bg-slate-800 hover:text-white"
                  )}
                >
                  <item.icon aria-hidden="true" className="h-5 w-5" />
                  {(isActive || isHovered) && (
                    <motion.div
                      layoutId="activeIndicator"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-r-full"
                    />
                  )}
                </Link>
              )
            })}
          </div>
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
            className="h-full bg-card border-r z-40 overflow-hidden shadow-xl"
          >
            <div className="w-64 py-6 px-4 whitespace-nowrap">
              <h2 className="text-xl font-bold text-foreground mb-8 px-2">
                {activeNavigation.name}
              </h2>

              <div className="space-y-8">
                {activeNavigation.sections?.map((section) => (
                  <div key={section.title}>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">
                      {section.title}
                    </h3>
                    <div className="space-y-1 text-sm">
                      {section.items.map((subItem) => {
                        const isSubActive = pathname === subItem.href
                        return (
                          <Link
                            key={subItem.name}
                            href={subItem.href}
                            // Come per la rail: la voce attiva del sottomenu si
                            // distingueva solo dal colore di sfondo, che per uno
                            // screen reader non esiste.
                            aria-current={isSubActive ? 'page' : undefined}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2 rounded-md font-medium transition-colors",
                              isSubActive
                                ? "bg-accent text-accent-foreground"
                                : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground"
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
