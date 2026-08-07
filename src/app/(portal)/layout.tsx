import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { PortalNavigation } from '@/components/portal/PortalNavigation'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { ThemeToggle } from '@/components/theme/theme-toggle'

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  // Se l'utente non è autenticato, reindirizza al login
  if (!session?.user) {
    redirect('/login')
  }

  const initials = `${session.user.firstName?.[0] ?? ''}${session.user.lastName?.[0] ?? ''}`

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header minimale */}
      <header className="bg-card border-b">
        <div className="flex items-center justify-between px-5 pt-12 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground">
              <span className="text-base font-bold text-background">{initials}</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground">
                {session.user.firstName} {session.user.lastName}
              </h1>
              <p className="text-sm text-muted-foreground">Weiss Srl</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell />
          </div>
        </div>
      </header>

      {/* Contenuto principale */}
      <main className="flex-1 pb-24 px-4 py-5">
        {children}
      </main>

      {/* Navigation bottom */}
      <PortalNavigation />
    </div>
  )
}
