'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Building2, Users, Truck, UserPlus, Building } from 'lucide-react'
import { Card } from '@/components/ui/card'

// Navigazione Anagrafiche
const anagraficheNavigation = [
  { name: 'Clienti', href: '/anagrafiche/clienti', icon: Building2 },
  { name: 'Fornitori', href: '/anagrafiche/fornitori', icon: Truck },
  { name: 'Personale', href: '/anagrafiche/personale', icon: Users },
  { name: 'Utenti', href: '/anagrafiche/utenti', icon: UserPlus },
]

export default function AnagraficheLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  // Trova l'anagrafica attuale basandosi sul pathname
  const activeTab = anagraficheNavigation.find(
    tab => pathname === tab.href || pathname.startsWith(tab.href + '/')
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Building className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Anagrafiche</h1>
        </div>
        <p className="text-muted-foreground">
          Gestisci le anagrafiche di clienti, fornitori, personale e utenti
        </p>
      </div>

      {/* Tab Navigation */}
      <Card>
        <div className="border-b">
          <nav className="flex flex-wrap gap-1" aria-label="Navigazione anagrafiche">
            {anagraficheNavigation.map((tab) => {
              const isActive = pathname === tab.href ||
                (tab.href !== '/anagrafiche/clienti' && pathname.startsWith(tab.href + '/'))

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-md transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <tab.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.name}</span>
                </Link>
              )
            })}
          </nav>
        </div>
      </Card>

      {/* Page Content */}
      <div className="min-h-[calc(100vh-12rem)]">
        {children}
      </div>
    </div>
  )
}
