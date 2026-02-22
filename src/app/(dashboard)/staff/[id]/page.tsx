'use client'

import { use } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { EmployeeDetailTabs } from '@/components/staff/EmployeeDetailTabs'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'

interface PageProps {
  params: Promise<{ id: string }>
}

function StaffDetailContent({ id }: { id: string }) {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const queryClient = useQueryClient()

  const { data: staffData, isLoading, error } = useQuery({
    queryKey: ['staff', id],
    queryFn: async () => {
      const res = await fetch(`/api/staff/${id}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nel caricamento')
      }
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

  const roles = rolesData?.data || []

  const toggleActiveMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      const res = await fetch(`/api/staff/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      })
      if (!res.ok) throw new Error('Errore nel salvataggio')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', id] })
      queryClient.invalidateQueries({ queryKey: ['staff-list'] })
      toast.success('Stato aggiornato')
    },
    onError: () => {
      toast.error('Errore nell\'aggiornamento dello stato')
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-10 w-full" />
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

  // Iniziali per avatar
  const initials = `${staffData.firstName?.[0] || ''}${staffData.lastName?.[0] || ''}`.toUpperCase()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/staff">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          {/* Avatar con iniziali */}
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-lg">
            {initials}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">
                {staffData.firstName} {staffData.lastName}
              </h1>
              <Badge variant="secondary">
                {staffData.role?.name?.charAt(0).toUpperCase() + staffData.role?.name?.slice(1) || 'Staff'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{staffData.email}</p>
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {staffData.isActive ? 'Attivo' : 'Disattivato'}
            </span>
            <Switch
              checked={staffData.isActive}
              onCheckedChange={(checked) => toggleActiveMutation.mutate(checked)}
              disabled={toggleActiveMutation.isPending}
            />
          </div>
        )}
      </div>

      {/* Tab */}
      <EmployeeDetailTabs
        employee={staffData}
        isAdmin={isAdmin}
        userRole={session?.user?.role || 'staff'}
        userId={id}
        roles={roles}
      />
    </div>
  )
}

export default function StaffDetailPage({ params }: PageProps) {
  const resolvedParams = use(params)

  return (
    <Suspense fallback={
      <div className="space-y-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    }>
      <StaffDetailContent id={resolvedParams.id} />
    </Suspense>
  )
}
