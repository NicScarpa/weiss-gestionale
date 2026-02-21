'use client'

import { useSession, signOut } from 'next-auth/react'
import {
  User,
  Mail,
  MapPin,
  LogOut,
  Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { NotificationSettings } from '@/components/portal/NotificationSettings'

export default function PortalProfiloPage() {
  const { data: session, status } = useSession()

  const handleLogout = () => {
    signOut({ callbackUrl: '/login' })
  }

  if (status === 'loading') {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  const user = session?.user

  return (
    <div className="space-y-6">
      {/* Header profilo */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <User className="h-8 w-8 text-gray-700" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900">
                {user?.firstName} {user?.lastName}
              </h1>
              <p className="text-sm text-gray-500">{user?.email}</p>
              <Badge className="mt-1 bg-gray-900 text-white rounded-full">
                {user?.role === 'admin'
                  ? 'Amministratore'
                  : user?.role === 'manager'
                  ? 'Manager'
                  : 'Staff'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dettagli */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Settings className="h-5 w-5 text-gray-700" />
            Informazioni
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-gray-700" />
            <div>
              <p className="text-xs text-gray-400 uppercase">Email</p>
              <p className="font-medium">{user?.email}</p>
            </div>
          </div>

          <Separator />

          <div className="flex items-center gap-3">
            <MapPin className="h-5 w-5 text-gray-700" />
            <div>
              <p className="text-xs text-gray-400 uppercase">Sede</p>
              <p className="font-medium">
                {user?.venueName || 'Non assegnata'}
              </p>
            </div>
          </div>

          <Separator />

        </CardContent>
      </Card>

      {/* Notifiche */}
      <NotificationSettings />

      {/* Azioni */}
      <Card>
        <CardContent className="pt-6">
          <Button
            variant="outline"
            className="w-full border-red-200 text-red-500 hover:bg-red-50 rounded-xl"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Esci
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
