'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Loader2, MapPin, Clock, AlertTriangle, Coffee } from 'lucide-react'

interface Policy {
  geoFenceRadius: number
  requireGeolocation: boolean
  blockOutsideLocation: boolean
  earlyClockInMinutes: number
  lateClockInMinutes: number
  earlyClockOutMinutes: number
  lateClockOutMinutes: number
  autoClockOutEnabled: boolean
  autoClockOutHours: number
  requireBreakPunch: boolean
  minBreakMinutes: number
  notifyOnAnomaly: boolean
  notifyManagerEmail: string | null
}

interface PolicyFormProps {
  venueId: string
  venueName: string
  policy: Policy
  hasCoordinates: boolean
}

export function PolicyForm({
  venueId,
  venueName,
  policy: initialPolicy,
  hasCoordinates,
}: PolicyFormProps) {
  const queryClient = useQueryClient()
  const [policy, setPolicy] = useState<Policy>(initialPolicy)

  const saveMutation = useMutation({
    mutationFn: async (data: Policy) => {
      const response = await fetch(`/api/attendance/policies/${venueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Errore salvataggio')
      }
      return response.json()
    },
    onSuccess: () => {
      toast.success('Policy salvata con successo')
      queryClient.invalidateQueries({ queryKey: ['attendance-policies'] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleSave = () => {
    saveMutation.mutate(policy)
  }

  const updateField = <K extends keyof Policy>(field: K, value: Policy[K]) => {
    setPolicy((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{venueName}</CardTitle>
        <CardDescription>
          Configura le regole di timbratura per questa sede
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Geolocalizzazione */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-medium">Geolocalizzazione</h3>
          </div>

          {!hasCoordinates && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800">
              <AlertTriangle className="h-4 w-4 inline mr-2" />
              Questa sede non ha coordinate GPS configurate. Configura le coordinate
              nelle impostazioni della sede.
            </div>
          )}

          <div className="grid gap-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Richiedi geolocalizzazione</Label>
                <p className="text-sm text-muted-foreground">
                  Il dipendente deve condividere la posizione per timbrare
                </p>
              </div>
              <Switch
                checked={policy.requireGeolocation}
                onCheckedChange={(checked) =>
                  updateField('requireGeolocation', checked)
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Blocca timbrature fuori sede</Label>
                <p className="text-sm text-muted-foreground">
                  Se disattivo, registra comunque ma crea anomalia
                </p>
              </div>
              <Switch
                checked={policy.blockOutsideLocation}
                onCheckedChange={(checked) =>
                  updateField('blockOutsideLocation', checked)
                }
                disabled={!policy.requireGeolocation}
              />
            </div>

            <div className="grid gap-2">
              <Label>Raggio geofence (metri)</Label>
              <Input
                type="number"
                min={10}
                max={1000}
                value={policy.geoFenceRadius}
                onChange={(e) =>
                  updateField('geoFenceRadius', parseInt(e.target.value) || 100)
                }
                disabled={!policy.requireGeolocation}
              />
              <p className="text-xs text-muted-foreground">
                Distanza massima dalla sede per una timbratura valida
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Tolleranze Temporali */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-medium">Tolleranze Temporali</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Entrata anticipata (min)</Label>
              <Input
                type="number"
                min={0}
                max={120}
                value={policy.earlyClockInMinutes}
                onChange={(e) =>
                  updateField('earlyClockInMinutes', parseInt(e.target.value) || 0)
                }
              />
              <p className="text-xs text-muted-foreground">
                Minuti prima del turno consentiti
              </p>
            </div>

            <div className="grid gap-2">
              <Label>Ritardo tollerato (min)</Label>
              <Input
                type="number"
                min={0}
                max={120}
                value={policy.lateClockInMinutes}
                onChange={(e) =>
                  updateField('lateClockInMinutes', parseInt(e.target.value) || 0)
                }
              />
              <p className="text-xs text-muted-foreground">
                Oltre genera anomalia ritardo
              </p>
            </div>

            <div className="grid gap-2">
              <Label>Uscita anticipata (min)</Label>
              <Input
                type="number"
                min={0}
                max={60}
                value={policy.earlyClockOutMinutes}
                onChange={(e) =>
                  updateField('earlyClockOutMinutes', parseInt(e.target.value) || 0)
                }
              />
              <p className="text-xs text-muted-foreground">
                Minuti prima della fine turno
              </p>
            </div>

            <div className="grid gap-2">
              <Label>Straordinario tollerato (min)</Label>
              <Input
                type="number"
                min={0}
                max={180}
                value={policy.lateClockOutMinutes}
                onChange={(e) =>
                  updateField('lateClockOutMinutes', parseInt(e.target.value) || 0)
                }
              />
              <p className="text-xs text-muted-foreground">
                Oltre genera anomalia straordinario
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Auto Clock-out */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-medium">Auto Clock-out</h3>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Abilita auto clock-out</Label>
              <p className="text-sm text-muted-foreground">
                Timbra automaticamente uscita dopo un certo numero di ore
              </p>
            </div>
            <Switch
              checked={policy.autoClockOutEnabled}
              onCheckedChange={(checked) =>
                updateField('autoClockOutEnabled', checked)
              }
            />
          </div>

          <div className="grid gap-2">
            <Label>Ore massime (auto clock-out)</Label>
            <Input
              type="number"
              min={4}
              max={24}
              value={policy.autoClockOutHours}
              onChange={(e) =>
                updateField('autoClockOutHours', parseInt(e.target.value) || 12)
              }
              disabled={!policy.autoClockOutEnabled}
            />
          </div>
        </div>

        <Separator />

        {/* Pause */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Coffee className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-medium">Pause</h3>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Richiedi timbratura pausa</Label>
              <p className="text-sm text-muted-foreground">
                Obbliga la timbratura di inizio/fine pausa
              </p>
            </div>
            <Switch
              checked={policy.requireBreakPunch}
              onCheckedChange={(checked) =>
                updateField('requireBreakPunch', checked)
              }
            />
          </div>

          <div className="grid gap-2">
            <Label>Pausa minima (min)</Label>
            <Input
              type="number"
              min={0}
              max={120}
              value={policy.minBreakMinutes}
              onChange={(e) =>
                updateField('minBreakMinutes', parseInt(e.target.value) || 0)
              }
            />
          </div>
        </div>

        <Separator />

        {/* Notifiche */}
        <div className="space-y-4">
          <h3 className="font-medium">Notifiche</h3>

          <div className="flex items-center justify-between">
            <div>
              <Label>Notifica anomalie</Label>
              <p className="text-sm text-muted-foreground">
                Invia notifica quando viene rilevata un'anomalia
              </p>
            </div>
            <Switch
              checked={policy.notifyOnAnomaly}
              onCheckedChange={(checked) =>
                updateField('notifyOnAnomaly', checked)
              }
            />
          </div>

          <div className="grid gap-2">
            <Label>Email manager (opzionale)</Label>
            <Input
              type="email"
              placeholder="manager@example.com"
              value={policy.notifyManagerEmail || ''}
              onChange={(e) =>
                updateField('notifyManagerEmail', e.target.value || null)
              }
              disabled={!policy.notifyOnAnomaly}
            />
          </div>
        </div>
      </CardContent>

      <CardFooter>
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Salva Policy
        </Button>
      </CardFooter>
    </Card>
  )
}
