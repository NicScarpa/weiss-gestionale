import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ConfrontoAnnualeClient } from './ConfrontoAnnualeClient'

export const metadata = {
  title: 'Confronto Annuale'
}

export default async function ConfrontoAnnualePage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return (
    <ConfrontoAnnualeClient />
  )
}
