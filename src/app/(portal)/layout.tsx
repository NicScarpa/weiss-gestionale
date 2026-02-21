import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { PortalNavigation } from '@/components/portal/PortalNavigation'
import { Bell } from 'lucide-react'

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
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header bianco minimale */}
      <header className="bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-5 pt-12 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-900">
              <span className="text-base font-bold text-white">{initials}</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900">
                {session.user.firstName} {session.user.lastName}
              </h1>
              <p className="text-sm text-gray-500">Weiss Srl</p>
            </div>
          </div>
          <button className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100">
            <Bell className="h-5 w-5 text-gray-600" />
          </button>
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
