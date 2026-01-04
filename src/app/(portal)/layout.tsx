import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { PortalNavigation } from '@/components/portal/PortalNavigation'

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

  // Verifica che l'utente abbia accesso al portale
  // Admin e manager usano la dashboard, non il portale
  // Ma permettiamo comunque l'accesso per test

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Header fisso */}
      <header className="sticky top-0 z-50 bg-white border-b shadow-sm">
        <div className="flex h-14 items-center px-4">
          <h1 className="text-lg font-semibold text-slate-900">
            Weiss Portale
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-slate-600">
              {session.user.firstName} {session.user.lastName}
            </span>
          </div>
        </div>
      </header>

      {/* Contenuto principale con padding per la nav bottom */}
      <main className="flex-1 pb-20 px-4 py-4">
        {children}
      </main>

      {/* Navigation bottom */}
      <PortalNavigation />
    </div>
  )
}
