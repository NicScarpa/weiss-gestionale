'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { MoreHorizontal, Pencil, KeyRound, UserX, UserCheck, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { canPerformAction, type UserRole } from '@/lib/utils/permissions'

export interface UserData {
  id: string
  firstName: string
  lastName: string
  username: string
  email: string | null
  role: { id: string; name: string }
  venue: { id: string; name: string; code: string } | null
  isActive: boolean
  isFixedStaff: boolean
  contractType: string | null
}

interface UserTableProps {
  users: UserData[]
  isLoading?: boolean
  onResetPassword: (userId: string) => Promise<void>
  onToggleActive: (userId: string, isActive: boolean) => Promise<void>
}

export function UserTable({ users, isLoading, onResetPassword, onToggleActive }: UserTableProps) {
  const { data: session } = useSession()
  const currentUserRole = (session?.user?.role as UserRole) || 'staff'
  const currentUserId = session?.user?.id

  const [actionDialog, setActionDialog] = useState<{
    type: 'reset-password' | 'toggle-active'
    user: UserData
  } | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin':
        return 'default'
      case 'manager':
        return 'secondary'
      default:
        return 'outline'
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
        return 'Admin'
      case 'manager':
        return 'Manager'
      case 'staff':
        return 'Staff'
      default:
        return role
    }
  }

  const handleConfirmAction = async () => {
    if (!actionDialog) return

    setIsProcessing(true)
    try {
      if (actionDialog.type === 'reset-password') {
        await onResetPassword(actionDialog.user.id)
        toast.success('Password resettata a 1234567890')
      } else if (actionDialog.type === 'toggle-active') {
        await onToggleActive(actionDialog.user.id, !actionDialog.user.isActive)
        toast.success(
          actionDialog.user.isActive
            ? `${actionDialog.user.firstName} ${actionDialog.user.lastName} disattivato`
            : `${actionDialog.user.firstName} ${actionDialog.user.lastName} riattivato`
        )
      }
    } catch (error) {
      toast.error('Errore durante l\'operazione')
    } finally {
      setIsProcessing(false)
      setActionDialog(null)
    }
  }

  const canEditUser = (targetRole: string) => {
    return canPerformAction('user:update', currentUserRole, targetRole as UserRole)
  }

  const canResetPassword = (targetRole: string, userId: string) => {
    // Non si può resettare la propria password da qui
    if (userId === currentUserId) return false
    return canPerformAction('user:reset-password', currentUserRole, targetRole as UserRole)
  }

  const canToggleActive = (targetRole: string, userId: string) => {
    // Non si può disattivare se stessi
    if (userId === currentUserId) return false
    return canPerformAction('user:delete', currentUserRole, targetRole as UserRole)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-muted-foreground">Caricamento...</div>
      </div>
    )
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center">
        <div className="text-muted-foreground">Nessun utente trovato</div>
        <p className="text-sm text-muted-foreground mt-1">
          Prova a modificare i filtri di ricerca
        </p>
      </div>
    )
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Utente</TableHead>
            <TableHead>Username</TableHead>
            <TableHead>Ruolo</TableHead>
            <TableHead>Sede</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <div>
                  <div className="font-medium">
                    {user.firstName} {user.lastName}
                  </div>
                  {user.email && (
                    <div className="text-sm text-muted-foreground">{user.email}</div>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <code className="text-sm bg-muted px-1.5 py-0.5 rounded">
                  {user.username}
                </code>
              </TableCell>
              <TableCell>
                <Badge variant={getRoleBadgeVariant(user.role.name)}>
                  {getRoleLabel(user.role.name)}
                </Badge>
              </TableCell>
              <TableCell>
                {user.venue ? (
                  <span className="text-sm">{user.venue.name}</span>
                ) : (
                  <span className="text-sm text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell>
                <span className="text-sm">
                  {user.isFixedStaff ? 'Fisso' : 'Extra'}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant={user.isActive ? 'outline' : 'destructive'}>
                  {user.isActive ? 'Attivo' : 'Inattivo'}
                </Badge>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Azioni</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/impostazioni/utenti/${user.id}`}>
                        <Eye className="mr-2 h-4 w-4" />
                        Visualizza
                      </Link>
                    </DropdownMenuItem>

                    {canEditUser(user.role.name) && (
                      <DropdownMenuItem asChild>
                        <Link href={`/impostazioni/utenti/${user.id}?edit=true`}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Modifica
                        </Link>
                      </DropdownMenuItem>
                    )}

                    {canResetPassword(user.role.name, user.id) && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setActionDialog({ type: 'reset-password', user })}
                        >
                          <KeyRound className="mr-2 h-4 w-4" />
                          Reset password
                        </DropdownMenuItem>
                      </>
                    )}

                    {canToggleActive(user.role.name, user.id) && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setActionDialog({ type: 'toggle-active', user })}
                          className={user.isActive ? 'text-destructive focus:text-destructive' : ''}
                        >
                          {user.isActive ? (
                            <>
                              <UserX className="mr-2 h-4 w-4" />
                              Disattiva
                            </>
                          ) : (
                            <>
                              <UserCheck className="mr-2 h-4 w-4" />
                              Riattiva
                            </>
                          )}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Dialog di conferma */}
      <AlertDialog open={!!actionDialog} onOpenChange={() => setActionDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionDialog?.type === 'reset-password'
                ? 'Reset password'
                : actionDialog?.user.isActive
                ? 'Disattiva utente'
                : 'Riattiva utente'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionDialog?.type === 'reset-password' ? (
                <>
                  Stai per resettare la password di <strong>{actionDialog?.user.firstName} {actionDialog?.user.lastName}</strong>
                  {' '}al valore iniziale <code className="bg-muted px-1 rounded">1234567890</code>.
                  <br />
                  L&apos;utente dovrà cambiarla al prossimo accesso.
                </>
              ) : actionDialog?.user.isActive ? (
                <>
                  Stai per disattivare l&apos;utente <strong>{actionDialog?.user.firstName} {actionDialog?.user.lastName}</strong>.
                  <br />
                  Non potrà più accedere al sistema.
                </>
              ) : (
                <>
                  Stai per riattivare l&apos;utente <strong>{actionDialog?.user.firstName} {actionDialog?.user.lastName}</strong>.
                  <br />
                  Potrà nuovamente accedere al sistema.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              disabled={isProcessing}
              className={
                actionDialog?.type === 'toggle-active' && actionDialog?.user.isActive
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : ''
              }
            >
              {isProcessing ? 'Elaborazione...' : 'Conferma'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
