import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { BudgetList } from './BudgetList'
import { Skeleton } from '@/components/ui/skeleton'

export const metadata = {
  title: 'Budget'
}

function BudgetListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid gap-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  )
}

export default async function BudgetPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return (
    <div className="space-y-6">
      <Suspense fallback={<BudgetListSkeleton />}>
        <BudgetList
          venueId={session.user.venueId || undefined}
          isAdmin={session.user.role === 'admin'}
        />
      </Suspense>
    </div>
  )
}
