'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { UserForm } from '@/components/users/UserForm'
import { CredentialsDialog } from '@/components/users/CredentialsDialog'
import { ArrowLeft, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { canAccessUserManagement, type UserRole } from '@/lib/utils/permissions'

export default function NuovoUtentePage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const currentUserRole = (session?.user?.role as UserRole) || 'staff'

  const [createdCredentials, setCreatedCredentials] = useState<{
    username: string
    password: string
    firstName: string
    lastName: string
  } | null>(null)

  // Verifica accesso
  useEffect(() => {
    if (status === 'loading') return
    if (!session?.user || !canAccessUserManagement(currentUserRole)) {
      router.replace('/')
      return
    }
  }, [session, status, currentUserRole, router])

  const handleSubmit = async (data: {
    firstName: string
    lastName: string
    email?: string
    phoneNumber?: string
    role: string
    venueId?: string
    isFixedStaff: boolean
  }) => {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'Errore nella creazione')
    }

    // Mostra le credenziali generate
    setCreatedCredentials({
      username: result.data.username,
      password: result.credentials.password,
      firstName: data.firstName,
      lastName: data.lastName,
    })

    toast.success('Utente creato con successo')
  }

  const handleCancel = () => {
    router.push('/impostazioni/utenti')
  }

  const handleCredentialsDialogClose = () => {
    setCreatedCredentials(null)
    router.push('/impostazioni/utenti')
  }

  if (status === 'loading' || !session?.user) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Caricamento...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href="/impostazioni/utenti">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Torna alla lista
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <UserPlus className="h-6 w-6" />
          Nuovo Utente
        </h1>
        <p className="text-muted-foreground">
          Crea un nuovo utente nel sistema
        </p>
      </div>

      {/* Form */}
      <UserForm
        mode="create"
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />

      {/* Dialog credenziali */}
      <CredentialsDialog
        open={!!createdCredentials}
        onOpenChange={handleCredentialsDialogClose}
        credentials={createdCredentials}
      />
    </div>
  )
}
