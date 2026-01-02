import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { PrimaNotaClient } from './PrimaNotaClient'

export const metadata = {
  title: 'Prima Nota'
}

export default async function PrimaNotaPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  // Fetch accounts for the form
  const accounts = await prisma.account.findMany({
    where: {
      isActive: true,
    },
    select: {
      id: true,
      code: true,
      name: true,
    },
    orderBy: { code: 'asc' },
  })

  return (
    <PrimaNotaClient
      venueId={session.user.venueId || undefined}
      isAdmin={session.user.role === 'admin'}
      accounts={accounts}
    />
  )
}
