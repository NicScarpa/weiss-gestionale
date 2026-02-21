import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AnalisiCostiClient } from './AnalisiCostiClient'

export const metadata = {
  title: 'Analisi Costi'
}

export default async function AnalisiCostiPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return (
    <AnalisiCostiClient />
  )
}
