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
      {/* Header con gradiente viola e wave */}
      <header className="relative bg-gradient-to-br from-portal-gradient-start to-portal-gradient-end">
        <div className="flex items-center justify-between px-5 pt-12 pb-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
              <span className="text-base font-bold text-white">{initials}</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-white">
                {session.user.firstName} {session.user.lastName}
              </h1>
              <p className="text-sm text-white/70">Weiss Srl</p>
            </div>
          </div>
          <button className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
            <Bell className="h-5 w-5 text-white" />
          </button>
        </div>
        {/* Wave SVG organica */}
        <svg
          className="absolute bottom-0 left-0 w-full"
          viewBox="0 0 1440 60"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
          style={{ height: '30px', display: 'block' }}
        >
          <path
            d="M0 0C240 50 480 60 720 40C960 20 1200 50 1440 30V60H0V0Z"
            fill="#F9FAFB"
          />
        </svg>
      </header>

      {/* Contenuto principale con overlap leggero sotto la wave */}
      <main className="-mt-4 flex-1 pb-24 px-4 py-5 relative z-10">
        {children}
      </main>

      {/* Navigation bottom */}
      <PortalNavigation />
    </div>
  )
}
