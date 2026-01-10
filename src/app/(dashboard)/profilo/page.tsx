'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  User,
  Mail,
  Phone,
  Building2,
  Calendar,
  KeyRound,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  Save,
} from 'lucide-react'
import { toast } from 'sonner'

interface UserProfile {
  id: string
  firstName: string
  lastName: string
  username: string
  email: string | null
  phoneNumber: string | null
  address: string | null
  role: { id: string; name: string }
  venue: { id: string; name: string; code: string } | null
  isActive: boolean
  isFixedStaff: boolean
  contractType: string | null
  createdAt: string
  lastLoginAt: string | null
}

const contactFormSchema = z.object({
  email: z.string().email('Email non valida').or(z.literal('')),
  phoneNumber: z.string().optional(),
  address: z.string().optional(),
})

const passwordFormSchema = z.object({
  currentPassword: z.string().min(1, 'Password attuale richiesta'),
  newPassword: z
    .string()
    .min(8, 'La password deve avere almeno 8 caratteri')
    .refine((pwd) => pwd !== '1234567890', 'Non puoi usare la password iniziale'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Le password non coincidono',
  path: ['confirmPassword'],
})

type ContactFormData = z.infer<typeof contactFormSchema>
type PasswordFormData = z.infer<typeof passwordFormSchema>

export default function ProfiloPage() {
  const { data: session } = useSession()

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdatingContact, setIsUpdatingContact] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const contactForm = useForm<ContactFormData>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      email: '',
      phoneNumber: '',
      address: '',
    },
  })

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  // Carica profilo
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setIsLoading(true)
        const response = await fetch('/api/users/me')
        if (!response.ok) throw new Error('Errore caricamento profilo')
        const data = await response.json()
        setProfile(data.data)
        contactForm.reset({
          email: data.data.email || '',
          phoneNumber: data.data.phoneNumber || '',
          address: data.data.address || '',
        })
      } catch {
        toast.error('Errore nel caricamento del profilo')
      } finally {
        setIsLoading(false)
      }
    }

    if (session?.user) {
      fetchProfile()
    }
  }, [session, contactForm])

  const handleUpdateContact = async (data: ContactFormData) => {
    setIsUpdatingContact(true)
    try {
      const response = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Errore aggiornamento')
      }

      const result = await response.json()
      setProfile(result.data)
      toast.success('Contatti aggiornati con successo')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Errore aggiornamento')
    } finally {
      setIsUpdatingContact(false)
    }
  }

  const handleChangePassword = async (data: PasswordFormData) => {
    setIsChangingPassword(true)
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (!response.ok) {
        if (result.details) {
          result.details.forEach((issue: { path: string[]; message: string }) => {
            const field = issue.path[0] as keyof PasswordFormData
            passwordForm.setError(field, { message: issue.message })
          })
        } else {
          passwordForm.setError('currentPassword', { message: result.error || 'Errore sconosciuto' })
        }
        return
      }

      passwordForm.reset()
      setPasswordDialogOpen(false)
      toast.success('Password cambiata con successo')
    } catch {
      passwordForm.setError('currentPassword', { message: 'Errore di connessione' })
    } finally {
      setIsChangingPassword(false)
    }
  }

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

  if (isLoading || !profile) {
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
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
          <User className="h-6 w-6" />
          Il mio profilo
        </h1>
        <p className="text-muted-foreground">
          Visualizza e modifica le tue informazioni
        </p>
      </div>

      <div className="space-y-6">
        {/* Informazioni personali (sola lettura) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Informazioni personali</CardTitle>
            <CardDescription>
              Queste informazioni sono gestite dall&apos;amministratore
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Nome completo</p>
                <p className="font-medium">{profile.firstName} {profile.lastName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Username</p>
                <code className="text-sm bg-muted px-1.5 py-0.5 rounded">
                  {profile.username}
                </code>
              </div>
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Sede</p>
                  <p className="font-medium">
                    {profile.venue ? `${profile.venue.name} (${profile.venue.code})` : '-'}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ruolo</p>
                <Badge variant={getRoleBadgeVariant(profile.role.name)} className="mt-1">
                  {getRoleLabel(profile.role.name)}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dati di contatto (modificabili) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dati di contatto</CardTitle>
            <CardDescription>
              Puoi modificare i tuoi dati di contatto
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={contactForm.handleSubmit(handleUpdateContact)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    {...contactForm.register('email')}
                    disabled={isUpdatingContact}
                  />
                  {contactForm.formState.errors.email && (
                    <p className="text-sm text-destructive">
                      {contactForm.formState.errors.email.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phoneNumber" className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Telefono
                  </Label>
                  <Input
                    id="phoneNumber"
                    {...contactForm.register('phoneNumber')}
                    disabled={isUpdatingContact}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Indirizzo</Label>
                <Input
                  id="address"
                  {...contactForm.register('address')}
                  disabled={isUpdatingContact}
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={isUpdatingContact}>
                  {isUpdatingContact ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvataggio...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Salva modifiche
                    </>
                  )}
                </Button>
              </div>
            </form>
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
                <p className="text-sm text-muted-foreground">Account creato il</p>
                <p className="font-medium">{formatDate(profile.createdAt)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ultimo accesso</p>
                <p className="font-medium">{formatDate(profile.lastLoginAt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sicurezza */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Sicurezza
            </CardTitle>
            <CardDescription>
              Gestisci la sicurezza del tuo account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <KeyRound className="mr-2 h-4 w-4" />
                  Cambia password
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Cambia password</DialogTitle>
                  <DialogDescription>
                    Inserisci la password attuale e la nuova password
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={passwordForm.handleSubmit(handleChangePassword)} className="space-y-4">
                  {/* Password attuale */}
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Password attuale</Label>
                    <div className="relative">
                      <Input
                        id="currentPassword"
                        type={showCurrentPassword ? 'text' : 'password'}
                        {...passwordForm.register('currentPassword')}
                        disabled={isChangingPassword}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      >
                        {showCurrentPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    {passwordForm.formState.errors.currentPassword && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {passwordForm.formState.errors.currentPassword.message}
                      </p>
                    )}
                  </div>

                  <Separator />

                  {/* Nuova password */}
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">Nuova password</Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? 'text' : 'password'}
                        placeholder="Almeno 8 caratteri"
                        {...passwordForm.register('newPassword')}
                        disabled={isChangingPassword}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    {passwordForm.formState.errors.newPassword && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {passwordForm.formState.errors.newPassword.message}
                      </p>
                    )}
                  </div>

                  {/* Conferma password */}
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Conferma nuova password</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        {...passwordForm.register('confirmPassword')}
                        disabled={isChangingPassword}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    {passwordForm.formState.errors.confirmPassword && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {passwordForm.formState.errors.confirmPassword.message}
                      </p>
                    )}
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPasswordDialogOpen(false)}
                      disabled={isChangingPassword}
                    >
                      Annulla
                    </Button>
                    <Button type="submit" disabled={isChangingPassword}>
                      {isChangingPassword ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Cambio...
                        </>
                      ) : (
                        'Cambia password'
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
