'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { UserFilters, type UserFiltersValue } from '@/components/users/UserFilters'
import { UserTable, type UserData } from '@/components/users/UserTable'
import { Plus, Users, Shield } from 'lucide-react'
import { toast } from 'sonner'
import { canAccessUserManagement, type UserRole } from '@/lib/utils/permissions'

export default function UtentiPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const currentUserRole = (session?.user?.role as UserRole) || 'staff'

  const [users, setUsers] = useState<UserData[]>([])
  const [filteredUsers, setFilteredUsers] = useState<UserData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filters, setFilters] = useState<UserFiltersValue>({
    search: '',
    role: 'all',
    status: 'all',
  })

  // Verifica accesso
  useEffect(() => {
    if (status === 'loading') return
    if (!session?.user || !canAccessUserManagement(currentUserRole)) {
      router.replace('/')
      return
    }
  }, [session, status, currentUserRole, router])

  // Carica utenti
  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/users?includeInactive=true')
      if (!response.ok) throw new Error('Errore caricamento utenti')
      const data = await response.json()
      setUsers(data.data || [])
    } catch {
      toast.error('Errore nel caricamento degli utenti')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (session?.user && canAccessUserManagement(currentUserRole)) {
      fetchUsers()
    }
  }, [session, currentUserRole, fetchUsers])

  // Applica filtri
  useEffect(() => {
    let result = [...users]

    // Filtro ricerca
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      result = result.filter((user) =>
        user.firstName.toLowerCase().includes(searchLower) ||
        user.lastName.toLowerCase().includes(searchLower) ||
        user.username.toLowerCase().includes(searchLower) ||
        (user.email && user.email.toLowerCase().includes(searchLower))
      )
    }

    // Filtro ruolo
    if (filters.role !== 'all') {
      result = result.filter((user) => user.role.name === filters.role)
    }

    // Filtro stato
    if (filters.status !== 'all') {
      result = result.filter((user) =>
        filters.status === 'active' ? user.isActive : !user.isActive
      )
    }

    setFilteredUsers(result)
  }, [users, filters])

  const handleResetPassword = async (userId: string) => {
    const response = await fetch(`/api/users/${userId}/reset-password`, {
      method: 'POST',
    })
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Errore reset password')
    }
    await fetchUsers()
  }

  const handleToggleActive = async (userId: string, isActive: boolean) => {
    const response = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    })
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Errore aggiornamento stato')
    }
    await fetchUsers()
  }

  const handleResetFilters = () => {
    setFilters({ search: '', role: 'all', status: 'all' })
  }

  // Conteggi per badge
  const totalCount = users.length
  const activeCount = users.filter((u) => u.isActive).length
  const adminCount = users.filter((u) => u.role.name === 'admin').length
  const managerCount = users.filter((u) => u.role.name === 'manager').length
  const staffCount = users.filter((u) => u.role.name === 'staff').length

  if (status === 'loading' || !session?.user) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Caricamento...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" />
            Gestione Utenti
          </h1>
          <p className="text-muted-foreground">
            Gestisci gli utenti e i loro permessi
          </p>
        </div>
        <Button asChild>
          <Link href="/impostazioni/utenti/nuovo">
            <Plus className="mr-2 h-4 w-4" />
            Nuovo utente
          </Link>
        </Button>
      </div>

      {/* Statistiche */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Totale utenti</CardDescription>
            <CardTitle className="text-3xl">{totalCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {activeCount} attivi
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Shield className="h-3 w-3" />
              Admin
            </CardDescription>
            <CardTitle className="text-3xl">{adminCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Manager</CardDescription>
            <CardTitle className="text-3xl">{managerCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Staff</CardDescription>
            <CardTitle className="text-3xl">{staffCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filtri */}
      <Card>
        <CardContent className="pt-6">
          <UserFilters
            filters={filters}
            onFiltersChange={setFilters}
            onReset={handleResetFilters}
          />
        </CardContent>
      </Card>

      {/* Tabella */}
      <Card>
        <CardContent className="pt-6">
          <UserTable
            users={filteredUsers}
            isLoading={isLoading}
            onResetPassword={handleResetPassword}
            onToggleActive={handleToggleActive}
          />
        </CardContent>
      </Card>
    </div>
  )
}
