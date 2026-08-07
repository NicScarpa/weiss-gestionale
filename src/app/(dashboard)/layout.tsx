import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

/**
 * Sezioni della dashboard accessibili anche allo staff.
 * La chiusura cassa la compila chi lavora in sala a fine turno: è il flusso
 * previsto dal prodotto. La validazione, che genera le scritture contabili,
 * resta riservata ad admin e manager (vedi /api/chiusure/[id]/validate).
 */
const STAFF_ALLOWED_PATHS = ['/chiusura-cassa']

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  // Se l'utente non è autenticato, reindirizza al login
  if (!session?.user) {
    redirect('/login')
  }

  if (session.user.role === 'staff') {
    const pathname = (await headers()).get('x-pathname') ?? ''
    const allowed = STAFF_ALLOWED_PATHS.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`)
    )
    if (!allowed) {
      redirect('/portale')
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto bg-background p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
