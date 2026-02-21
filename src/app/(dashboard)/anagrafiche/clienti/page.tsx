'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CustomerFilters, type CustomerFiltersValue } from '@/components/customers/CustomerFilters'
import { CustomerTable, type CustomerData } from '@/components/customers/CustomerTable'
import { Plus, Building2, FileText, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { canAccessUserManagement, type UserRole } from '@/lib/utils/permissions'

export default function ClientiPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const currentUserRole = (session?.user?.role as UserRole) || 'staff'

  const [customers, setCustomers] = useState<CustomerData[]>([])
  const [filteredCustomers, setFilteredCustomers] = useState<CustomerData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filters, setFilters] = useState<CustomerFiltersValue>({
    search: '',
    showInactive: false,
  })

  // Verifica accesso (solo admin può gestire i clienti)
  useEffect(() => {
    if (status === 'loading') return
    if (!session?.user || currentUserRole !== 'admin') {
      router.replace('/')
      return
    }
  }, [session, status, currentUserRole, router])

  // Carica clienti
  const fetchCustomers = useCallback(async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams()
      if (filters.showInactive) {
        params.set('showOnlyInactive', 'true')
      }
      params.set('full', 'true')

      const response = await fetch(`/api/customers?${params.toString()}`)
      if (!response.ok) throw new Error('Errore caricamento clienti')
      const data = await response.json()
      setCustomers(data.customers || [])
    } catch {
      toast.error('Errore nel caricamento dei clienti')
    } finally {
      setIsLoading(false)
    }
  }, [filters.showInactive])

  useEffect(() => {
    if (session?.user && currentUserRole === 'admin') {
      fetchCustomers()
    }
  }, [session, currentUserRole, fetchCustomers])

  // Applica filtri
  useEffect(() => {
    let result = [...customers]

    // Filtro ricerca
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      result = result.filter((customer) =>
        customer.denominazione.toLowerCase().includes(searchLower) ||
        (customer.partitaIva && customer.partitaIva.toLowerCase().includes(searchLower)) ||
        (customer.codiceFiscale && customer.codiceFiscale.toLowerCase().includes(searchLower)) ||
        (customer.email && customer.email.toLowerCase().includes(searchLower)) ||
        (customer.citta && customer.citta.toLowerCase().includes(searchLower))
      )
    }

    // Filtro attivo/inattivo
    // Di default mostra solo attivi, se showInactive è true mostra solo inattivi
    result = result.filter(c => filters.showInactive ? !c.attivo : c.attivo)

    setFilteredCustomers(result)
  }, [customers, filters])

  const handleToggleActive = async (customerId: string, attivo: boolean) => {
    const response = await fetch(`/api/customers`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: customerId, attivo }),
    })
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Errore aggiornamento stato')
    }
    await fetchCustomers()
  }

  const handleResetFilters = () => {
    setFilters({ search: '', showInactive: false })
  }

  // Conteggi per badge
  const totalCount = customers.length
  const activeCount = customers.filter(c => c.attivo).length
  const inactiveCount = customers.filter(c => !c.attivo).length
  const withVatCount = customers.filter(c => c.partitaIva).length
  const withEmailCount = customers.filter(c => c.email).length
  const withPhoneCount = customers.filter(c => c.telefono).length

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
            <Building2 className="h-6 w-6" />
            Gestione Clienti
          </h1>
          <p className="text-muted-foreground">
            Gestisci l&apos;anagrafica clienti per fatturazione
          </p>
        </div>
        <Button asChild>
          <Link href="/anagrafiche/clienti/nuovo">
            <Plus className="mr-2 h-4 w-4" />
            Nuovo Cliente
          </Link>
        </Button>
      </div>

      {/* Statistiche */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Totale clienti</CardDescription>
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
              <FileText className="h-3 w-3" />
              P.IVA
            </CardDescription>
            <CardTitle className="text-3xl">{withVatCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Phone className="h-3 w-3" />
              Email
            </CardDescription>
            <CardTitle className="text-3xl">{withEmailCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Telefono</CardDescription>
            <CardTitle className="text-3xl">{withPhoneCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Inattivi</CardDescription>
            <CardTitle className="text-3xl">{inactiveCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filtri */}
      <Card>
        <CardContent className="pt-6">
          <CustomerFilters
            filters={filters}
            onFiltersChange={setFilters}
            onReset={handleResetFilters}
          />
        </CardContent>
      </Card>

      {/* Tabella */}
      <CustomerTable
        customers={filteredCustomers}
        isLoading={isLoading}
        onEdit={(customer) => {
          // Naviga alla pagina di modifica
          router.push(`/anagrafiche/clienti/${customer.id}`)
        }}
        onDelete={async (customer) => {
          if (confirm(`Sei sicuro di voler disattivare il cliente "${customer.denominazione}"?`)) {
            try {
              const response = await fetch(`/api/customers`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: [customer.id] }),
              })
              if (!response.ok) throw new Error('Errore eliminazione')
              toast.success('Cliente disattivato')
              await fetchCustomers()
            } catch {
              toast.error('Errore nella disattivazione del cliente')
            }
          }
        }}
      />
    </div>
  )
}
