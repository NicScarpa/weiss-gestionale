'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, Loader2, User } from 'lucide-react'
import { getAssignableRoles, type UserRole } from '@/lib/utils/permissions'
import { generateUsername } from '@/lib/utils/username'

const userFormSchema = z.object({
  firstName: z.string().min(1, 'Nome richiesto'),
  lastName: z.string().min(1, 'Cognome richiesto'),
  email: z.string().email('Email non valida').or(z.literal('')),
  phoneNumber: z.string().optional(),
  role: z.enum(['admin', 'manager', 'staff']),
  venueId: z.string().optional(),
  isFixedStaff: z.boolean(),
  isActive: z.boolean(),
})

type UserFormData = z.infer<typeof userFormSchema>

interface Venue {
  id: string
  name: string
  code: string
}

interface Role {
  id: string
  name: string
}

interface UserFormProps {
  mode: 'create' | 'edit'
  initialData?: Partial<UserFormData> & { id?: string }
  onSubmit: (data: UserFormData) => Promise<void>
  onCancel: () => void
}

export function UserForm({ mode, initialData, onSubmit, onCancel }: UserFormProps) {
  const { data: session } = useSession()
  const currentUserRole = (session?.user?.role as UserRole) || 'staff'

  const [venues, setVenues] = useState<Venue[]>([])
  const [_roles, setRoles] = useState<Role[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [previewUsername, setPreviewUsername] = useState('')

  const assignableRoles = getAssignableRoles(currentUserRole)

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    setError,
  } = useForm<UserFormData>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      firstName: initialData?.firstName || '',
      lastName: initialData?.lastName || '',
      email: initialData?.email || '',
      phoneNumber: initialData?.phoneNumber || '',
      role: (initialData?.role as 'admin' | 'manager' | 'staff') || 'staff',
      venueId: initialData?.venueId || '',
      isFixedStaff: initialData?.isFixedStaff ?? true,
      isActive: initialData?.isActive ?? true,
    },
  })

  const firstName = watch('firstName')
  const lastName = watch('lastName')
  const selectedRole = watch('role')
  const isFixedStaff = watch('isFixedStaff')

  // Carica venues e ruoli
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [venuesRes, rolesRes] = await Promise.all([
          fetch('/api/venues'),
          fetch('/api/roles'),
        ])
        if (venuesRes.ok) {
          const venuesData = await venuesRes.json()
          setVenues(venuesData.data || [])
        }
        if (rolesRes.ok) {
          const rolesData = await rolesRes.json()
          setRoles(rolesData.data || [])
        }
      } catch {
        // Silently fail
      }
    }
    fetchData()
  }, [])

  // Genera anteprima username per staff
  useEffect(() => {
    if (mode === 'create' && selectedRole === 'staff' && firstName && lastName) {
      const username = generateUsername(firstName, lastName)
      setPreviewUsername(username)
    } else if (mode === 'create' && (selectedRole === 'admin' || selectedRole === 'manager')) {
      const email = watch('email')
      setPreviewUsername(email || '')
    } else {
      setPreviewUsername('')
    }
  }, [firstName, lastName, selectedRole, mode, watch])

  const handleFormSubmit = async (data: UserFormData) => {
    setIsSubmitting(true)
    try {
      await onSubmit(data)
    } catch (error) {
      if (error instanceof Error) {
        setError('root', { message: error.message })
      }
    } finally {
      setIsSubmitting(false)
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

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)}>
      <div className="space-y-6">
        {/* Errore generale */}
        {errors.root && (
          <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{errors.root.message}</span>
          </div>
        )}

        {/* Dati personali */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              Dati personali
            </CardTitle>
            <CardDescription>
              Informazioni base dell&apos;utente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Nome */}
              <div className="space-y-2">
                <Label htmlFor="firstName">Nome *</Label>
                <Input
                  id="firstName"
                  {...register('firstName')}
                  disabled={isSubmitting}
                  placeholder="Mario"
                />
                {errors.firstName && (
                  <p className="text-sm text-destructive">{errors.firstName.message}</p>
                )}
              </div>

              {/* Cognome */}
              <div className="space-y-2">
                <Label htmlFor="lastName">Cognome *</Label>
                <Input
                  id="lastName"
                  {...register('lastName')}
                  disabled={isSubmitting}
                  placeholder="Rossi"
                />
                {errors.lastName && (
                  <p className="text-sm text-destructive">{errors.lastName.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">
                  Email {selectedRole !== 'staff' && '*'}
                </Label>
                <Input
                  id="email"
                  type="email"
                  {...register('email')}
                  disabled={isSubmitting}
                  placeholder="mario.rossi@email.com"
                />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email.message}</p>
                )}
              </div>

              {/* Telefono */}
              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Telefono</Label>
                <Input
                  id="phoneNumber"
                  {...register('phoneNumber')}
                  disabled={isSubmitting}
                  placeholder="+39 333 1234567"
                />
              </div>
            </div>

            {/* Anteprima username (solo creazione) */}
            {mode === 'create' && previewUsername && (
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm text-muted-foreground">
                  Username che verrà generato:{' '}
                  <code className="font-mono bg-background px-1.5 py-0.5 rounded">
                    {previewUsername}
                  </code>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ruolo e Sede */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ruolo e Sede</CardTitle>
            <CardDescription>
              Assegna ruolo e sede di appartenenza
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Ruolo */}
              <div className="space-y-2">
                <Label>Ruolo *</Label>
                <Select
                  value={selectedRole}
                  onValueChange={(value) => setValue('role', value as 'admin' | 'manager' | 'staff')}
                  disabled={isSubmitting || (mode === 'edit' && currentUserRole !== 'admin')}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona ruolo" />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableRoles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {getRoleLabel(role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.role && (
                  <p className="text-sm text-destructive">{errors.role.message}</p>
                )}
              </div>

              {/* Sede */}
              <div className="space-y-2">
                <Label>Sede</Label>
                <Select
                  value={watch('venueId') || '__none__'}
                  onValueChange={(value) => setValue('venueId', value === '__none__' ? '' : value)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona sede" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nessuna sede</SelectItem>
                    {venues.map((venue) => (
                      <SelectItem key={venue.id} value={venue.id}>
                        {venue.name} ({venue.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Staff fisso/extra */}
            {selectedRole === 'staff' && (
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label htmlFor="isFixedStaff" className="text-base">Staff fisso</Label>
                  <p className="text-sm text-muted-foreground">
                    {isFixedStaff
                      ? 'Dipendente con contratto fisso'
                      : 'Collaboratore extra/occasionale'}
                  </p>
                </div>
                <Switch
                  id="isFixedStaff"
                  checked={isFixedStaff}
                  onCheckedChange={(checked) => setValue('isFixedStaff', checked)}
                  disabled={isSubmitting}
                />
              </div>
            )}

            {/* Stato attivo (solo modifica) */}
            {mode === 'edit' && (
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label htmlFor="isActive" className="text-base">Utente attivo</Label>
                  <p className="text-sm text-muted-foreground">
                    Gli utenti inattivi non possono accedere al sistema
                  </p>
                </div>
                <Switch
                  id="isActive"
                  checked={watch('isActive')}
                  onCheckedChange={(checked) => setValue('isActive', checked)}
                  disabled={isSubmitting}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Azioni */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Annulla
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {mode === 'create' ? 'Creazione...' : 'Salvataggio...'}
              </>
            ) : (
              mode === 'create' ? 'Crea utente' : 'Salva modifiche'
            )}
          </Button>
        </div>
      </div>
    </form>
  )
}
