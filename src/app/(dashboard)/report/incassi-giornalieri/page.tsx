import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { DailyRevenueClient } from './DailyRevenueClient'

export const metadata = {
  title: 'Report Incassi Giornalieri'
}

export default async function DailyRevenuePage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return (
    <DailyRevenueClient />
  )
}
