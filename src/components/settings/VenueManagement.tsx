'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Building2, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'

import { logger } from '@/lib/logger'

interface Venue {
  id: string
  name: string
  code: string
  address: string | null
  defaultFloat: number
  vatRate: number
  isActive: boolean
  latitude: number | null
  longitude: number | null
}

interface DatiSede {
  name: string
  code: string
  address: string
  defaultFloat: string
  vatRate: string
  latitude: string
  longitude: string
}

const FORM_VUOTO: DatiSede = {
  name: '',
  code: '',
  address: '',
  defaultFloat: '114',
  vatRate: '10',
  latitude: '',
  longitude: '',
}

function formDaSede(v: Venue): DatiSede {
  return {
    name: v.name,
    code: v.code,
    address: v.address || '',
    defaultFloat: v.defaultFloat.toString(),
    vatRate: v.vatRate.toString(),
    latitude: v.latitude?.toString() || '',
    longitude: v.longitude?.toString() || '',
  }
}

export function VenueManagement() {
  const [saving, setSaving] = useState(false)
  // Finché l'utente non tocca nulla il form mostra i valori della sede caricata
  const [modifiche, setModifiche] = useState<DatiSede | null>(null)

  // Carica la sede
  const {
    data,
    isFetching: loading,
    error: erroreCaricamento,
    refetch: ricaricaSede,
  } = useQuery({
    // Come prima del passaggio a TanStack Query: ogni montaggio ricarica.
    refetchOnMount: 'always',
    staleTime: 0,
    queryKey: ['venues'],
    queryFn: async (): Promise<{ venues?: Venue[] }> => {
      const res = await fetch('/api/venues')
      if (!res.ok) throw new Error('Errore nel caricamento')
      return res.json()
    },
  })

  useEffect(() => {
    if (erroreCaricamento) {
      logger.error('Errore', erroreCaricamento)
      toast.error('Errore nel caricamento della sede')
    }
  }, [erroreCaricamento])

  const venue = data?.venues?.[0] ?? null
  const formData = modifiche ?? (venue ? formDaSede(venue) : FORM_VUOTO)
  const setFormData = setModifiche

  // Salva sede
  const handleSave = async () => {
    if (!formData.name.trim() || !formData.code.trim()) {
      toast.error('Nome e codice sono obbligatori')
      return
    }

    if (!venue) return

    try {
      setSaving(true)

      const payload = {
        id: venue.id,
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase(),
        address: formData.address.trim() || null,
        defaultFloat: parseFloat(formData.defaultFloat) || 114,
        vatRate: parseFloat(formData.vatRate) || 10,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
      }

      const res = await fetch('/api/venues', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Errore nel salvataggio')
      }

      toast.success('Sede aggiornata')
      await ricaricaSede()
      setModifiche(null)
    } catch (error: unknown) {
      logger.error('Errore', error)
      toast.error(error instanceof Error ? error.message : 'Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!venue) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-muted-foreground text-center">
            Nessuna sede configurata
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Configurazione Sede
          <Badge variant="outline" className="font-mono text-xs ml-2">
            {venue.code}
          </Badge>
        </CardTitle>
        <CardDescription>
          Impostazioni della sede operativa
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Nome e Codice */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="es. Weiss Cafe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Codice *</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) =>
                  setFormData({ ...formData, code: e.target.value.toUpperCase() })
                }
                placeholder="es. WEISS"
                maxLength={10}
                className="font-mono uppercase"
              />
            </div>
          </div>

          {/* Indirizzo */}
          <div className="space-y-2">
            <Label htmlFor="address">Indirizzo</Label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
              placeholder="Via Roma 1, Sacile (PN)"
            />
          </div>

          {/* Fondo Cassa e IVA */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="defaultFloat">Fondo Cassa Default</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">

                </span>
                <Input
                  id="defaultFloat"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.defaultFloat}
                  onChange={(e) =>
                    setFormData({ ...formData, defaultFloat: e.target.value })
                  }
                  className="pl-7 font-mono"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vatRate">Aliquota IVA</Label>
              <div className="relative">
                <Input
                  id="vatRate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={formData.vatRate}
                  onChange={(e) =>
                    setFormData({ ...formData, vatRate: e.target.value })
                  }
                  className="pr-7 font-mono"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  %
                </span>
              </div>
            </div>
          </div>

          {/* Coordinate (per geofencing) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="latitude">Latitudine</Label>
              <Input
                id="latitude"
                type="number"
                step="0.000001"
                value={formData.latitude}
                onChange={(e) =>
                  setFormData({ ...formData, latitude: e.target.value })
                }
                placeholder="es. 45.9530"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="longitude">Longitudine</Label>
              <Input
                id="longitude"
                type="number"
                step="0.000001"
                value={formData.longitude}
                onChange={(e) =>
                  setFormData({ ...formData, longitude: e.target.value })
                }
                placeholder="es. 12.4946"
                className="font-mono"
              />
            </div>
          </div>

          {/* Salva */}
          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvataggio...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Salva Modifiche
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
