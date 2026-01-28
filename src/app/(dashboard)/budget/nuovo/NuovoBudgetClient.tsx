'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { getAvailableYears } from '@/lib/budget-utils'

interface Venue {
  id: string
  name: string
  code: string
}

interface ExistingBudget {
  venueId: string
  year: number
}

interface NuovoBudgetClientProps {
  venues: Venue[]
  existingBudgets: ExistingBudget[]
  defaultVenueId?: string
}

export function NuovoBudgetClient({
  venues,
  existingBudgets,
  defaultVenueId,
}: NuovoBudgetClientProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const [formData, setFormData] = useState({
    venueId: defaultVenueId || venues[0]?.id || '',
    year: new Date().getFullYear(),
    name: '',
    notes: '',
    copyFromYear: null as number | null,
  })

  const availableYears = getAvailableYears()

  // Anni già usati per la sede selezionata
  const usedYears = existingBudgets
    .filter((b) => b.venueId === formData.venueId)
    .map((b) => b.year)

  // Anni disponibili per copiare (per la sede selezionata)
  const copyableYears = usedYears.filter((y) => y !== formData.year)

  // Verifica se l'anno selezionato è già usato
  const isYearUsed = usedYears.includes(formData.year)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.venueId) {
      toast.error('Seleziona una sede')
      return
    }

    if (isYearUsed) {
      toast.error('Esiste già un budget per questo anno')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venueId: formData.venueId,
          year: formData.year,
          name: formData.name || undefined,
          notes: formData.notes || undefined,
          copyFromYear: formData.copyFromYear || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Errore nella creazione')
      }

      const budget = await res.json()
      toast.success('Budget creato con successo')
      router.push(`/budget/${budget.id}?edit=true`)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Errore nella creazione')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/budget">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Nuovo Budget</h1>
          <p className="text-muted-foreground">
            Crea un nuovo budget annuale
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Informazioni Budget</CardTitle>
            <CardDescription>
              Configura i dettagli base del budget
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Sede e Anno */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="venue">Sede *</Label>
                <Select
                  value={formData.venueId}
                  onValueChange={(v) => setFormData({ ...formData, venueId: v })}
                  disabled={venues.length === 1}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona sede" />
                  </SelectTrigger>
                  <SelectContent>
                    {venues.map((venue) => (
                      <SelectItem key={venue.id} value={venue.id}>
                        {venue.name} ({venue.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="year">Anno *</Label>
                <Select
                  value={formData.year.toString()}
                  onValueChange={(v) => setFormData({ ...formData, year: parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona anno" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableYears.map((year) => {
                      const isUsed = existingBudgets.some(
                        (b) => b.venueId === formData.venueId && b.year === year
                      )
                      return (
                        <SelectItem
                          key={year}
                          value={year.toString()}
                          disabled={isUsed}
                        >
                          {year} {isUsed && '(esistente)'}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                {isYearUsed && (
                  <p className="text-sm text-destructive">
                    Esiste già un budget per questo anno
                  </p>
                )}
              </div>
            </div>

            {/* Nome */}
            <div className="space-y-2">
              <Label htmlFor="name">Nome (opzionale)</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={`Budget ${formData.year}`}
              />
              <p className="text-sm text-muted-foreground">
                Se non specificato, verrà usato &ldquo;Budget {formData.year}&rdquo;
              </p>
            </div>

            {/* Copia da anno precedente */}
            {copyableYears.length > 0 && (
              <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="copyBudget"
                    checked={formData.copyFromYear !== null}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setFormData({ ...formData, copyFromYear: copyableYears[0] })
                      } else {
                        setFormData({ ...formData, copyFromYear: null })
                      }
                    }}
                  />
                  <Label htmlFor="copyBudget" className="font-medium">
                    Copia righe da budget esistente
                  </Label>
                </div>

                {formData.copyFromYear !== null && (
                  <div className="space-y-2 pl-6">
                    <Label>Anno da copiare</Label>
                    <Select
                      value={formData.copyFromYear.toString()}
                      onValueChange={(v) =>
                        setFormData({ ...formData, copyFromYear: parseInt(v) })
                      }
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {copyableYears.map((year) => (
                          <SelectItem key={year} value={year.toString()}>
                            Budget {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      Verranno copiate tutte le righe con i relativi importi mensili
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Note */}
            <div className="space-y-2">
              <Label htmlFor="notes">Note (opzionale)</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Note aggiuntive..."
                rows={3}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" asChild>
                <Link href="/budget">Annulla</Link>
              </Button>
              <Button type="submit" disabled={loading || isYearUsed}>
                {loading ? (
                  <>
                    <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Creazione...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Crea Budget
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
