import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

interface AppShellProps {
  /**
   * Ruolo letto dal server con `auth()`. Sidebar e cassetto mobile ci
   * costruiscono il menu: passarlo come prop, invece di leggerlo con
   * `useSession()`, evita che al primo render — quando la sessione lato client
   * non è ancora arrivata — allo staff compaia per un istante il menu completo.
   */
  role: string
  children: React.ReactNode
}

/**
 * Telaio dell'applicazione gestionale: rail di navigazione, header e area di
 * contenuto. Lo usano due gruppi di rotte con autorizzazioni diverse —
 * `(dashboard)`, riservata ad admin e manager, e `(chiusura)`, aperta anche
 * allo staff — e sta qui perché la cornice resti una sola.
 */
export function AppShell({ role, children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={role} />
      {/* `min-w-0`: senza, un figlio largo (una tabella, una riga di bottoni)
          allarga questa colonna flex oltre lo schermo invece di scorrere
          dentro il proprio contenitore. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header role={role} />
        <main className="flex-1 overflow-auto bg-background p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
