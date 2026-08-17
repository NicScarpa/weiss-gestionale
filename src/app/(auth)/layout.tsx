import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

/**
 * Rotte che restano raggiungibili anche con una sessione attiva: portano un
 * token nell'URL e servono a impostare una password. Senza questa eccezione un
 * admin già dentro non può nemmeno verificare il link che ha appena inviato, e
 * chi resta loggato su un dispositivo condiviso non può usare il proprio invito.
 */
const ROTTE_CON_TOKEN = ['/reset-password', '/invito']

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  // x-pathname è impostato dal middleware (src/middleware.ts)
  const pathname = (await headers()).get('x-pathname') ?? ''
  const rottaConToken = ROTTE_CON_TOKEN.some((rotta) => pathname.startsWith(rotta))

  // Se l'utente è già autenticato, reindirizza alla dashboard
  if (session?.user && !rottaConToken) {
    redirect('/')
  }

  return <>{children}</>
}
