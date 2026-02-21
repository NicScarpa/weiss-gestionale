'use client'

import { useState, useEffect } from 'react'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Separator } from '@/components/ui/separator'

import { logger } from '@/lib/logger'
interface NotificationPreferences {
  pushEnabled: boolean
  newShiftPublished: boolean
  shiftReminder: boolean
  anomalyCreated: boolean
  anomalyResolved: boolean
  leaveApproved: boolean
  leaveRejected: boolean
  leaveReminder: boolean
}

const defaultPreferences: NotificationPreferences = {
  pushEnabled: true,
  newShiftPublished: true,
  shiftReminder: true,
  anomalyCreated: true,
  anomalyResolved: true,
  leaveApproved: true,
  leaveRejected: true,
  leaveReminder: true,
}

export function NotificationSettings() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pushSupported, setPushSupported] = useState(false)
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default')

  useEffect(() => {
    // Check push notification support
    if ('Notification' in window && 'serviceWorker' in navigator) {
      queueMicrotask(() => {
        setPushSupported(true)
        setPushPermission(Notification.permission)
      })
    }

    // Load preferences
    loadPreferences()
  }, [])

  const loadPreferences = async () => {
    try {
      const res = await fetch('/api/notifications/preferences')
      if (res.ok) {
        const data = await res.json()
        if (data) {
          setPreferences({
            pushEnabled: data.pushEnabled ?? true,
            newShiftPublished: data.newShiftPublished ?? true,
            shiftReminder: data.shiftReminder ?? true,
            anomalyCreated: data.anomalyCreated ?? true,
            anomalyResolved: data.anomalyResolved ?? true,
            leaveApproved: data.leaveApproved ?? true,
            leaveRejected: data.leaveRejected ?? true,
            leaveReminder: data.leaveReminder ?? true,
          })
        }
      }
    } catch (error) {
      logger.error('Error loading preferences', error)
    } finally {
      setLoading(false)
    }
  }

  const savePreferences = async (newPreferences: NotificationPreferences) => {
    setSaving(true)
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPreferences),
      })

      if (res.ok) {
        toast.success('Preferenze salvate')
      } else {
        throw new Error('Failed to save')
      }
    } catch {
      toast.error('Impossibile salvare le preferenze')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = (key: keyof NotificationPreferences) => {
    const newPreferences = {
      ...preferences,
      [key]: !preferences[key],
    }
    setPreferences(newPreferences)
    savePreferences(newPreferences)
  }

  const requestPushPermission = async () => {
    if (!pushSupported) return

    try {
      const permission = await Notification.requestPermission()
      setPushPermission(permission)

      if (permission === 'granted') {
        // Register service worker and get push subscription
        await navigator.serviceWorker.ready

        // For now, just enable push in preferences
        const newPreferences = { ...preferences, pushEnabled: true }
        setPreferences(newPreferences)
        await savePreferences(newPreferences)

        toast.success('Notifiche attivate')
      } else if (permission === 'denied') {
        toast.error('Permesso negato - Abilita le notifiche dalle impostazioni del browser')
      }
    } catch (error) {
      logger.error('Error requesting push permission', error)
      toast.error('Impossibile attivare le notifiche')
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bell className="h-5 w-5" />
          Notifiche
        </CardTitle>
        <CardDescription>
          Gestisci le notifiche che vuoi ricevere
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Push notification status */}
        {pushSupported && (
          <>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Notifiche Push</Label>
                <p className="text-sm text-gray-500">
                  {pushPermission === 'granted'
                    ? 'Le notifiche push sono attive'
                    : pushPermission === 'denied'
                    ? 'Le notifiche sono bloccate dal browser'
                    : 'Attiva le notifiche per ricevere aggiornamenti'}
                </p>
              </div>
              {pushPermission === 'granted' ? (
                <Switch
                  checked={preferences.pushEnabled}
                  onCheckedChange={() => handleToggle('pushEnabled')}
                  disabled={saving}
                />
              ) : pushPermission === 'denied' ? (
                <BellOff className="h-5 w-5 text-gray-400" />
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={requestPushPermission}
                  className="border-gray-300 text-gray-900 hover:bg-gray-100"
                >
                  Attiva
                </Button>
              )}
            </div>
            <Separator />
          </>
        )}

        {/* Notification types */}
        <div className="space-y-4">
          <Label className="text-sm font-semibold text-gray-900">
            Tipi di notifica
          </Label>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Nuovi turni pubblicati</Label>
                <p className="text-sm text-gray-500">
                  Quando vengono pubblicati nuovi turni
                </p>
              </div>
              <Switch
                checked={preferences.newShiftPublished}
                onCheckedChange={() => handleToggle('newShiftPublished')}
                disabled={saving || !preferences.pushEnabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Promemoria turno</Label>
                <p className="text-sm text-gray-500">
                  Avviso prima dell&apos;inizio del turno
                </p>
              </div>
              <Switch
                checked={preferences.shiftReminder}
                onCheckedChange={() => handleToggle('shiftReminder')}
                disabled={saving || !preferences.pushEnabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Anomalie rilevate</Label>
                <p className="text-sm text-gray-500">
                  Quando viene creata un&apos;anomalia
                </p>
              </div>
              <Switch
                checked={preferences.anomalyCreated}
                onCheckedChange={() => handleToggle('anomalyCreated')}
                disabled={saving || !preferences.pushEnabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Anomalie risolte</Label>
                <p className="text-sm text-gray-500">
                  Quando un&apos;anomalia viene risolta
                </p>
              </div>
              <Switch
                checked={preferences.anomalyResolved}
                onCheckedChange={() => handleToggle('anomalyResolved')}
                disabled={saving || !preferences.pushEnabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Ferie approvate</Label>
                <p className="text-sm text-gray-500">
                  Quando una richiesta ferie viene approvata
                </p>
              </div>
              <Switch
                checked={preferences.leaveApproved}
                onCheckedChange={() => handleToggle('leaveApproved')}
                disabled={saving || !preferences.pushEnabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Ferie rifiutate</Label>
                <p className="text-sm text-gray-500">
                  Quando una richiesta ferie viene rifiutata
                </p>
              </div>
              <Switch
                checked={preferences.leaveRejected}
                onCheckedChange={() => handleToggle('leaveRejected')}
                disabled={saving || !preferences.pushEnabled}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
