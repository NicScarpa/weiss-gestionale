'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Menu } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { navigazionePerRuolo, type NavItem } from './navigation'

interface MobileNavProps {
  /** Ruolo dell'utente, letto dal server nel layout. */
  role: string
}

/** Voce singola del cassetto: un link diretto oppure il titolo di un gruppo. */
function VoceDiretta({
  href,
  name,
  icon: Icon,
  attiva,
  onNavigate,
}: {
  href: string
  name: string
  icon?: NavItem['icon']
  attiva: boolean
  onNavigate: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={attiva ? 'page' : undefined}
      className={cn(
        // 44px di altezza minima: sotto quella soglia il bersaglio è troppo
        // piccolo per un dito (WCAG 2.5.8).
        'flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        attiva
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground'
      )}
    >
      {Icon && <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />}
      <span className="truncate">{name}</span>
    </Link>
  )
}

/**
 * Navigazione da telefono: la rail e il pannello a comparsa della `Sidebar`
 * vivono di `hover`, che su un touch screen non esiste — si apriva al primo
 * tocco e restava aperto togliendo 320px al contenuto. Qui le stesse voci
 * stanno in un cassetto che si apre da un bottone e si chiude appena si
 * naviga.
 *
 * Le voci arrivano da `navigazionePerRuolo`: la stessa fonte della barra da
 * desktop, così un menu riservato non può comparire da un lato solo.
 */
export function MobileNav({ role }: MobileNavProps) {
  const pathname = usePathname()
  const navItems = useMemo(() => navigazionePerRuolo(role), [role])

  /**
   * Insieme allo stato «aperto» si ricorda su quale rotta lo è: appena il
   * percorso cambia — per un tocco su una voce, per un rimando del server o per
   * il bottone «indietro» — il cassetto risulta chiuso senza bisogno di un
   * effetto che insegua il pathname chiamando `setState`.
   */
  const [cassetto, setCassetto] = useState({ aperto: false, percorso: pathname })
  const aperto = cassetto.aperto && cassetto.percorso === pathname

  const setAperto = (valore: boolean) => setCassetto({ aperto: valore, percorso: pathname })

  return (
    <Sheet open={aperto} onOpenChange={setAperto}>
      {/* Niente SheetTrigger: il bottone deve sparire da tablet in su, e
          `asChild` con la classe di visibilità sul figlio si porta dietro
          anche gli attributi del trigger. */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Apri il menu"
        aria-expanded={aperto}
        onClick={() => setAperto(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <SheetContent side="left" className="w-[85vw] max-w-sm overflow-y-auto p-0">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded bg-slate-900 text-sm font-bold text-white">
              WS
            </span>
            Weiss Cafè
          </SheetTitle>
          <SheetDescription className="sr-only">
            Menu di navigazione principale
          </SheetDescription>
        </SheetHeader>

        <nav className="space-y-6 p-4 pb-10">
          {navItems.map((item) => {
            const chiudi = () => setAperto(false)

            // Voce senza sottosezioni: un solo link.
            if (!item.sections?.length) {
              return item.href ? (
                <VoceDiretta
                  key={item.name}
                  href={item.href}
                  name={item.name}
                  icon={item.icon}
                  attiva={pathname === item.href}
                  onNavigate={chiudi}
                />
              ) : null
            }

            return (
              <div key={item.name} className="space-y-1">
                <p className="flex items-center gap-2 px-3 pb-1 text-sm font-semibold text-foreground">
                  <item.icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                  {item.name}
                </p>
                {item.sections.map((section) => (
                  <div key={section.title} className="space-y-1">
                    <p className="px-3 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {section.title}
                    </p>
                    {section.items.map((subItem) => (
                      <VoceDiretta
                        key={subItem.name}
                        href={subItem.href}
                        name={subItem.name}
                        icon={subItem.icon}
                        attiva={pathname === subItem.href}
                        onNavigate={chiudi}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )
          })}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
