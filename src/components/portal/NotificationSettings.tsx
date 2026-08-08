'use client'

import { useState, useEffect, useCallback } from 'react'
import { Bell, BellOff, Loader2, AlertTriangle, Send } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Separator } from '@/components/ui/separator'
import {
  diagnosticaPush,
  attivaPush,
  disattivaPush,
  inviaNotificaDiProva,
  type DiagnosiPush,
} from '@/lib/push-client'

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
  const [diagnosi, setDiagnosi] = useState<DiagnosiPush | null>(null)
  const [attivazioneInCorso, setAttivazioneInCorso] = useState(false)
  const [provaInCorso, setProvaInCorso] = useState(false)

  const aggiornaDiagnosi = useCallback(async () => {
    try {
      setDiagnosi(await diagnosticaPush())
    } catch (error) {
      logger.error('Diagnostica push fallita', error)
      setDiagnosi({
        stato: 'non-configurato',
        dettaglio: 'Impossibile determinare lo stato delle notifiche.',
      })
    }
  }, [])

  useEffect(() => {
    aggiornaDiagnosi()
    loadPreferences()
  }, [aggiornaDiagnosi])

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

  const attivaNotifiche = async () => {
    setAttivazioneInCorso(true)
    try {
      await attivaPush()

      const newPreferences = { ...preferences, pushEnabled: true }
      setPreferences(newPreferences)
      await savePreferences(newPreferences)

      toast.success('Dispositivo registrato: le notifiche arriveranno qui')
    } catch (error) {
      logger.error('Attivazione notifiche fallita', error)
      toast.error(error instanceof Error ? error.message : 'Impossibile attivare le notifiche')
    } finally {
      await aggiornaDiagnosi()
      setAttivazioneInCorso(false)
    }
  }

  const disattivaNotifiche = async () => {
    setAttivazioneInCorso(true)
    try {
      await disattivaPush()
      toast.success('Dispositivo rimosso')
    } catch (error) {
      logger.error('Disattivazione notifiche fallita', error)
      toast.error('Impossibile rimuovere il dispositivo')
    } finally {
      await aggiornaDiagnosi()
      setAttivazioneInCorso(false)
    }
  }

  const provaNotifica = async () => {
    setProvaInCorso(true)
    try {
      await inviaNotificaDiProva()
      toast.success('Notifica di prova inviata')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Invio non riuscito')
    } finally {
      setProvaInCorso(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
        {/* Stato reale del canale push su questo dispositivo */}
        {diagnosi && (
          <>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-base">Notifiche Push</Label>
                  <p className="text-sm text-muted-foreground">{diagnosi.dettaglio}</p>
                </div>

                {diagnosi.stato === 'attivo' ? (
                  <Switch
                    checked={preferences.pushEnabled}
                    onCheckedChange={() => handleToggle('pushEnabled')}
                    disabled={saving}
                  />
                ) : diagnosi.stato === 'da-attivare' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={attivaNotifiche}
                    disabled={attivazioneInCorso}
                  >
                    {attivazioneInCorso && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Attiva
                  </Button>
                ) : diagnosi.stato === 'non-configurato' ? (
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
                ) : (
                  <BellOff className="h-5 w-5 shrink-0 text-muted-foreground" />
                )}
              </div>

              {diagnosi.stato === 'attivo' && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={provaNotifica}
                    disabled={provaInCorso}
                  >
                    {provaInCorso ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Invia notifica di prova
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={disattivaNotifiche}
                    disabled={attivazioneInCorso}
                  >
                    Rimuovi questo dispositivo
                  </Button>
                </div>
              )}
            </div>
            <Separator />
          </>
        )}

        {/* Notification types */}
        <div className="space-y-4">
          <Label className="text-sm font-semibold text-foreground">
            Tipi di notifica
          </Label>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Nuovi turni pubblicati</Label>
                <p className="text-sm text-muted-foreground">
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
                <p className="text-sm text-muted-foreground">
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
                <p className="text-sm text-muted-foreground">
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
                <p className="text-sm text-muted-foreground">
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
                <p className="text-sm text-muted-foreground">
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
                <p className="text-sm text-muted-foreground">
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
