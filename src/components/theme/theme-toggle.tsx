'use client'

import { useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'
import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const OPZIONI = [
  { valore: 'light', etichetta: 'Chiaro', Icona: Sun },
  { valore: 'dark', etichetta: 'Scuro', Icona: Moon },
  { valore: 'system', etichetta: 'Sistema', Icona: Monitor },
] as const

const nienteIscrizione = () => () => {}

/**
 * Selettore del tema. Lato server il tema non è conoscibile, quindi il bottone
 * resta neutro finché non è idratato, per non far divergere il markup.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  // false durante il render sul server, true una volta idratato sul client.
  const montato = useSyncExternalStore(
    nienteIscrizione,
    () => true,
    () => false
  )

  const etichettaCorrente = OPZIONI.find((o) => o.valore === theme)?.etichetta ?? 'Sistema'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={className}
          aria-label={montato ? `Tema: ${etichettaCorrente}` : 'Tema'}
        >
          {montato && resolvedTheme === 'dark' ? (
            <Moon className="h-5 w-5" />
          ) : (
            <Sun className="h-5 w-5" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPZIONI.map(({ valore, etichetta, Icona }) => (
          <DropdownMenuItem
            key={valore}
            onClick={() => setTheme(valore)}
            className="cursor-pointer"
            data-attivo={montato && theme === valore ? 'true' : undefined}
          >
            <Icona className="mr-2 h-4 w-4" />
            <span>{etichetta}</span>
            {montato && theme === valore && (
              <span className="ml-auto text-xs text-muted-foreground">attivo</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
