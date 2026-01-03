import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { BudgetDetailClient } from './BudgetDetailClient'

export const metadata = {
  title: 'Dettaglio Budget'
}

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ edit?: string }>
}

export default async function BudgetDetailPage({ params, searchParams }: PageProps) {
  const session = await auth()
  const { id } = await params
  const { edit } = await searchParams

  if (!session?.user) {
    redirect('/login')
  }

  // Recupera il budget
  const budget = await prisma.budget.findUnique({
    where: { id },
    include: {
      venue: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  })

  if (!budget) {
    notFound()
  }

  // Verifica accesso sede
  if (session.user.role !== 'admin' && budget.venueId !== session.user.venueId) {
    redirect('/budget')
  }

  // Recupera i conti per il form
  const accounts = await prisma.account.findMany({
    where: {
      isActive: true,
      type: { in: ['RICAVO', 'COSTO'] },
    },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
    },
    orderBy: { code: 'asc' },
  })

  const isEditing = edit === 'true'
  const canEdit = ['admin', 'manager'].includes(session.user.role || '') && budget.status !== 'ARCHIVED'

  return (
    <BudgetDetailClient
      budgetId={id}
      venue={budget.venue}
      year={budget.year}
      budgetName={budget.name || `Budget ${budget.year}`}
      budgetStatus={budget.status as 'DRAFT' | 'ACTIVE' | 'ARCHIVED'}
      accounts={accounts}
      isEditing={isEditing && canEdit}
      canEdit={canEdit}
    />
  )
}
