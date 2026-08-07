import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ContoEconomicoClient } from './ContoEconomicoClient'

export const metadata = {
  title: 'Conto Economico per Centro'
}

export default async function ContoEconomicoPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return (
    <ContoEconomicoClient />
  )
}
