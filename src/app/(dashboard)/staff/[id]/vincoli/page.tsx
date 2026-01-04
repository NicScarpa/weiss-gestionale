'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ConstraintEditor } from '@/components/staff/ConstraintEditor'
import { ArrowLeft, User } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function StaffConstraintsPage({ params }: PageProps) {
  const resolvedParams = use(params)

  const { data: staffData, isLoading, error } = useQuery({
    queryKey: ['staff', resolvedParams.id],
    queryFn: async () => {
      const res = await fetch(`/api/staff/${resolvedParams.id}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nel caricamento')
      }
      return res.json()
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (error || !staffData) {
    return (
      <div className="space-y-6">
        <Link href="/staff">
          <Button variant="ghost">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Torna alla lista
          </Button>
        </Link>
        <div className="text-center py-12 text-destructive">
          {error instanceof Error ? error.message : 'Dipendente non trovato'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href={`/staff/${resolvedParams.id}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">
              Vincoli di {staffData.firstName} {staffData.lastName}
            </h1>
            <p className="text-muted-foreground">
              Configura disponibilità, preferenze e vincoli per la pianificazione turni
            </p>
          </div>
        </div>
        <Link href={`/staff/${resolvedParams.id}`}>
          <Button variant="outline">
            <User className="h-4 w-4 mr-2" />
            Vedi Profilo
          </Button>
        </Link>
      </div>

      {/* Editor vincoli */}
      <ConstraintEditor
        userId={resolvedParams.id}
        userName={`${staffData.firstName} ${staffData.lastName}`}
      />
    </div>
  )
}
