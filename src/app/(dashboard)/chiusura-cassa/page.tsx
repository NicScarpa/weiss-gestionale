import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ClosureList } from './ClosureList'
import { ClosureListSkeleton } from './ClosureListSkeleton'

export const metadata = {
  title: 'Chiusura Cassa'
}

export default async function ChiusuraCassaPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return (
    <div className="space-y-6">
      <Suspense fallback={<ClosureListSkeleton />}>
        <ClosureList
          venueId={session.user.venueId || undefined}
          isAdmin={session.user.role === 'admin'}
        />
      </Suspense>
    </div>
  )
}
