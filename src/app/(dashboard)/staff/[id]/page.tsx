'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmployeeProfileForm } from '@/components/staff/EmployeeProfileForm'
import { ConstraintEditor } from '@/components/staff/ConstraintEditor'
import { CertificationsBox } from '@/components/staff/CertificationsBox'
import { ArrowLeft } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function StaffDetailPage({ params }: PageProps) {
  const resolvedParams = use(params)
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'

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

  // Carica venues e roles per i dropdown
  const { data: venuesData } = useQuery({
    queryKey: ['venues'],
    queryFn: async () => {
      const res = await fetch('/api/venues')
      if (!res.ok) return { venues: [] }
      return res.json()
    },
  })

  const { data: rolesData } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await fetch('/api/roles')
      if (!res.ok) return { data: [] }
      return res.json()
    },
  })

  const venues = venuesData?.venues || []
  const roles = rolesData?.data || []

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
      <div className="flex items-center gap-4">
        <Link href="/staff">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">
            {staffData.firstName} {staffData.lastName}
          </h1>
          <p className="text-muted-foreground">{staffData.email}</p>
        </div>
      </div>

      {/* Profilo */}
      <EmployeeProfileForm
        employee={staffData}
        isAdmin={isAdmin}
        venues={venues}
        roles={roles}
      />

      {/* Certificazioni */}
      <CertificationsBox
        userId={resolvedParams.id}
        contractType={staffData.contractType}
        roleName={staffData.role?.name}
        isReadOnly={session?.user?.role === 'staff'}
      />

      {/* Vincoli (solo per admin/manager) */}
      {(session?.user?.role === 'admin' || session?.user?.role === 'manager') && (
        <ConstraintEditor
          userId={resolvedParams.id}
          userName={`${staffData.firstName} ${staffData.lastName}`}
        />
      )}
    </div>
  )
}
