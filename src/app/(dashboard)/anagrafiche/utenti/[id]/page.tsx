'use client'

import { useState, useEffect, use } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { UserForm } from '@/components/users/UserForm'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  Building2,
  Calendar,
  Pencil,
  KeyRound,
  UserX,
  UserCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { canPerformAction, canAccessUserManagement, type UserRole } from '@/lib/utils/permissions'

interface UserDetail {
  id: string
  firstName: string
  lastName: string
  username: string
  email: string | null
  phoneNumber: string | null
  role: { id: string; name: string }
  venue: { id: string; name: string; code: string } | null
  isActive: boolean
  isFixedStaff: boolean
  contractType: string | null
  createdAt: string
  lastLoginAt: string | null
}

export default function DettaglioUtentePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const currentUserRole = (session?.user?.role as UserRole) || 'staff'

  const [user, setUser] = useState<UserDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(searchParams.get('edit') === 'true')
  const [actionDialog, setActionDialog] = useState<'reset-password' | 'toggle-active' | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // Verifica accesso
  useEffect(() => {
    if (status === 'loading') return
    if (!session?.user || !canAccessUserManagement(currentUserRole)) {
      router.replace('/')
      return
    }
  }, [session, status, currentUserRole, router])

  // Carica utente
  useEffect(() => {
    const fetchUser = async () => {
      try {
        setIsLoading(true)
        const response = await fetch(`/api/users/${resolvedParams.id}`)
        if (!response.ok) {
          if (response.status === 404) {
            toast.error('Utente non trovato')
            router.push('/impostazioni/utenti')
            return
          }
          throw new Error('Errore caricamento')
        }
        const data = await response.json()
        setUser(data.data)
      } catch {
        toast.error('Errore nel caricamento dell\'utente')
      } finally {
        setIsLoading(false)
      }
    }

    if (session?.user && resolvedParams.id) {
      fetchUser()
    }
  }, [session, resolvedParams.id, router])

  const handleUpdate = async (data: {
    firstName: string
    lastName: string
    email?: string
    phoneNumber?: string
    role: string
    venueId?: string
    isFixedStaff: boolean
    isActive: boolean
  }) => {
    const response = await fetch(`/api/users/${resolvedParams.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'Errore nell\'aggiornamento')
    }

    setUser(result.data)
    setIsEditing(false)
    toast.success('Utente aggiornato con successo')
  }

  const handleResetPassword = async () => {
    setIsProcessing(true)
    try {
      const response = await fetch(`/api/users/${resolvedParams.id}/reset-password`, {
        method: 'POST',
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Errore reset password')
      }
      toast.success('Password resettata a 1234567890')
    } catch {
      toast.error('Errore durante il reset della password')
    } finally {
      setIsProcessing(false)
      setActionDialog(null)
    }
  }

  const handleToggleActive = async () => {
    if (!user) return
    setIsProcessing(true)
    try {
      const response = await fetch(`/api/users/${resolvedParams.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !user.isActive }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Errore aggiornamento stato')
      }
      const result = await response.json()
      setUser(result.data)
      toast.success(user.isActive ? 'Utente disattivato' : 'Utente riattivato')
    } catch {
      toast.error('Errore durante l\'operazione')
    } finally {
      setIsProcessing(false)
      setActionDialog(null)
    }
  }

  const canEdit = user && canPerformAction('user:update', currentUserRole, user.role.name as UserRole)
  const canResetPassword = user && session?.user?.id !== user.id &&
    canPerformAction('user:reset-password', currentUserRole, user.role.name as UserRole)
  const canToggleActive = user && session?.user?.id !== user.id &&
    canPerformAction('user:delete', currentUserRole, user.role.name as UserRole)

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'Amministratore'
      case 'manager': return 'Manager'
      case 'staff': return 'Staff'
      default: return role
    }
  }

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin': return 'default'
      case 'manager': return 'secondary'
      default: return 'outline'
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (status === 'loading' || !session?.user || isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Caricamento...</div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  // Modalità modifica
  if (isEditing && canEdit) {
    return (
      <div className="container mx-auto py-6 max-w-3xl">
        <div className="mb-6">
          <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Annulla modifica
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            Modifica Utente
          </h1>
          <p className="text-muted-foreground">
            {user.firstName} {user.lastName}
          </p>
        </div>

        <UserForm
          mode="edit"
          initialData={{
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email || '',
            phoneNumber: user.phoneNumber || '',
            role: user.role.name as 'admin' | 'manager' | 'staff',
            venueId: user.venue?.id,
            isFixedStaff: user.isFixedStaff,
            isActive: user.isActive,
          }}
          onSubmit={handleUpdate}
          onCancel={() => setIsEditing(false)}
        />
      </div>
    )
  }

  // Modalità visualizzazione
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
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
              {user.firstName} {user.lastName}
              <Badge variant={user.isActive ? 'outline' : 'destructive'}>
                {user.isActive ? 'Attivo' : 'Inattivo'}
              </Badge>
            </h1>
            <p className="text-muted-foreground">
              @{user.username}
            </p>
          </div>
          {canEdit && (
            <Button onClick={() => setIsEditing(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Modifica
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {/* Informazioni principali */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              Informazioni
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{user.email || '-'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Telefono</p>
                  <p className="font-medium">{user.phoneNumber || '-'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Sede</p>
                  <p className="font-medium">
                    {user.venue ? `${user.venue.name} (${user.venue.code})` : '-'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Ruolo</p>
                  <Badge variant={getRoleBadgeVariant(user.role.name)} className="mt-1">
                    {getRoleLabel(user.role.name)}
                  </Badge>
                </div>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Tipo</p>
                <p className="font-medium">
                  {user.isFixedStaff ? 'Staff fisso' : 'Extra'}
                </p>
              </div>
              {user.contractType && (
                <div>
                  <p className="text-sm text-muted-foreground">Contratto</p>
                  <p className="font-medium">{user.contractType.replace(/_/g, ' ')}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Attività */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Attività
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Creato il</p>
                <p className="font-medium">{formatDate(user.createdAt)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ultimo accesso</p>
                <p className="font-medium">{formatDate(user.lastLoginAt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Azioni */}
        {(canResetPassword || canToggleActive) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Azioni</CardTitle>
              <CardDescription>
                Operazioni disponibili per questo utente
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              {canResetPassword && (
                <Button
                  variant="outline"
                  onClick={() => setActionDialog('reset-password')}
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  Reset password
                </Button>
              )}
              {canToggleActive && (
                <Button
                  variant={user.isActive ? 'destructive' : 'default'}
                  onClick={() => setActionDialog('toggle-active')}
                >
                  {user.isActive ? (
                    <>
                      <UserX className="mr-2 h-4 w-4" />
                      Disattiva utente
                    </>
                  ) : (
                    <>
                      <UserCheck className="mr-2 h-4 w-4" />
                      Riattiva utente
                    </>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog di conferma */}
      <AlertDialog open={!!actionDialog} onOpenChange={() => setActionDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionDialog === 'reset-password'
                ? 'Reset password'
                : user.isActive
                ? 'Disattiva utente'
                : 'Riattiva utente'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionDialog === 'reset-password' ? (
                <>
                  Stai per resettare la password di <strong>{user.firstName} {user.lastName}</strong>
                  {' '}al valore iniziale <code className="bg-muted px-1 rounded">1234567890</code>.
                  <br />
                  L&apos;utente dovrà cambiarla al prossimo accesso.
                </>
              ) : user.isActive ? (
                <>
                  Stai per disattivare l&apos;utente <strong>{user.firstName} {user.lastName}</strong>.
                  <br />
                  Non potrà più accedere al sistema.
                </>
              ) : (
                <>
                  Stai per riattivare l&apos;utente <strong>{user.firstName} {user.lastName}</strong>.
                  <br />
                  Potrà nuovamente accedere al sistema.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={actionDialog === 'reset-password' ? handleResetPassword : handleToggleActive}
              disabled={isProcessing}
              className={
                actionDialog === 'toggle-active' && user.isActive
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : ''
              }
            >
              {isProcessing ? 'Elaborazione...' : 'Conferma'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
