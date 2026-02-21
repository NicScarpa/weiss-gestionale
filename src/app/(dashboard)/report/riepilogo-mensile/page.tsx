import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { RiepilogoMensileClient } from './RiepilogoMensileClient'

export const metadata = {
  title: 'Riepilogo Mensile'
}

export default async function RiepilogoMensilePage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return (
    <RiepilogoMensileClient />
  )
}
