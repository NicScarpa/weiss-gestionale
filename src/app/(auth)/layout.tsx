import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  // Se l'utente è già autenticato, reindirizza alla dashboard
  if (session?.user) {
    redirect('/')
  }

  return <>{children}</>
}
