'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Receipt,
  BookOpen,
  FileText,
  Calculator,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Users,
  Calendar,
  Palmtree,
  Landmark,
  Package,
  ClipboardCheck,
  Truck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState, useEffect } from 'react'

// Navigazione principale (prima dell'accordion)
const mainNavigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Chiusura Cassa', href: '/chiusura-cassa', icon: Receipt },
  { name: 'Prima Nota', href: '/prima-nota', icon: BookOpen },
  { name: 'Riconciliazione', href: '/riconciliazione', icon: Landmark },
  { name: 'Fatture', href: '/fatture', icon: FileText },
  { name: 'Prodotti', href: '/prodotti', icon: Package },
  { name: 'Budget', href: '/budget', icon: Calculator },
  { name: 'Report', href: '/report', icon: BarChart3 },
]

// Sottovoci "Personale"
const personnelNavigation = [
  { name: 'Staff', href: '/staff', icon: Users },
  { name: 'Turni', href: '/turni', icon: Calendar },
  { name: 'Ferie/Permessi', href: '/ferie-permessi', icon: Palmtree },
  { name: 'Presenze', href: '/presenze', icon: ClipboardCheck },
]

// Sottovoci "Impostazioni"
const settingsNavigation = [
  { name: 'Generali', href: '/impostazioni/generali', icon: Settings },
  { name: 'Utenti', href: '/impostazioni/utenti', icon: Users },
  { name: 'Fornitori', href: '/impostazioni/fornitori', icon: Truck },
  { name: 'Piano Conti', href: '/impostazioni/conti', icon: BookOpen },
  { name: 'Budget', href: '/impostazioni/budget', icon: Calculator },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  // Stato accordion Personale
  const isInPersonnelSection = personnelNavigation.some(
    item => pathname === item.href || pathname.startsWith(item.href + '/')
  )
  const [isPersonnelOpen, setIsPersonnelOpen] = useState(isInPersonnelSection)

  // Stato accordion Impostazioni
  const isInSettingsSection = settingsNavigation.some(
    item => pathname === item.href || pathname.startsWith(item.href + '/')
  )
  const [isSettingsOpen, setIsSettingsOpen] = useState(isInSettingsSection)

  // Auto-espandi quando si naviga in sezione Personale
  useEffect(() => {
    if (isInPersonnelSection && !isPersonnelOpen) {
      setIsPersonnelOpen(true)
    }
  }, [pathname, isInPersonnelSection, isPersonnelOpen])

  // Auto-espandi quando si naviga in sezione Impostazioni
  useEffect(() => {
    if (isInSettingsSection && !isSettingsOpen) {
      setIsSettingsOpen(true)
    }
  }, [pathname, isInSettingsSection, isSettingsOpen])

  const renderNavItem = (item: { name: string; href: string; icon: React.ComponentType<{ className?: string }> }, indent = false) => {
    const isActive = pathname === item.href ||
      (item.href !== '/' && pathname.startsWith(item.href + '/'))

    return (
      <Link
        key={item.name}
        href={item.href}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
          indent && !collapsed && "ml-3",
          isActive
            ? "bg-slate-800 text-white"
            : "text-slate-300 hover:bg-slate-800 hover:text-white"
        )}
      >
        <item.icon className={cn("flex-shrink-0", indent ? "h-4 w-4" : "h-5 w-5")} />
        {!collapsed && <span>{item.name}</span>}
      </Link>
    )
  }

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-slate-900 text-white transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-slate-700">
        {!collapsed && (
          <span className="text-lg font-semibold tracking-tight">
            Weiss Cafè
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="text-slate-400 hover:text-white hover:bg-slate-800"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {/* Main navigation */}
        {mainNavigation.map((item) => renderNavItem(item))}

        {/* Personale Accordion */}
        <div className="pt-1">
          <button
            onClick={() => setIsPersonnelOpen(!isPersonnelOpen)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              isInPersonnelSection
                ? "bg-slate-800 text-white"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            )}
          >
            <Users className="h-5 w-5 flex-shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Personale</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform duration-200",
                    isPersonnelOpen ? "rotate-0" : "-rotate-90"
                  )}
                />
              </>
            )}
          </button>

          {/* Sottovoci accordion Personale */}
          <div
            className={cn(
              "overflow-hidden transition-all duration-200",
              isPersonnelOpen && !collapsed ? "max-h-48 opacity-100" : "max-h-0 opacity-0"
            )}
          >
            <div className="mt-1 space-y-1">
              {personnelNavigation.map((item) => renderNavItem(item, true))}
            </div>
          </div>
        </div>

        {/* Impostazioni Accordion */}
        <div className="pt-1">
          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              isInSettingsSection
                ? "bg-slate-800 text-white"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            )}
          >
            <Settings className="h-5 w-5 flex-shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Impostazioni</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform duration-200",
                    isSettingsOpen ? "rotate-0" : "-rotate-90"
                  )}
                />
              </>
            )}
          </button>

          {/* Sottovoci accordion Impostazioni */}
          <div
            className={cn(
              "overflow-hidden transition-all duration-200",
              isSettingsOpen && !collapsed ? "max-h-64 opacity-100" : "max-h-0 opacity-0"
            )}
          >
            <div className="mt-1 space-y-1">
              {settingsNavigation.map((item) => renderNavItem(item, true))}
            </div>
          </div>
        </div>
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="p-4 border-t border-slate-700">
          <p className="text-xs text-slate-400">
            Sistema Gestionale v1.0
          </p>
        </div>
      )}
    </aside>
  )
}
