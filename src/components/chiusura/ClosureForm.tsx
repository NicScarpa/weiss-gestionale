'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  Calendar as CalendarIcon,
  Save,
  Send,
  CloudSun,
  PartyPopper,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  formatCurrency,
  formatDate,
  DEFAULT_VAT_RATE,
  CASH_DIFFERENCE_THRESHOLD,
} from '@/lib/constants'
import { CashStationCard, CashStationData, emptyCashStation } from './CashStationCard'
import { HourlyPartialsSection, HourlyPartialData } from './HourlyPartialsSection'
import { ExpensesSection, ExpenseData } from './ExpensesSection'
import { AttendanceSection, AttendanceData } from './AttendanceSection'
import { calculateCashCountTotal, emptyCashCount } from './CashCountGrid'
import { toast } from 'sonner'

// Opzioni meteo
const WEATHER_OPTIONS = [
  { value: 'sunny', label: '☀️ Sole' },
  { value: 'cloudy', label: '☁️ Nuvoloso' },
  { value: 'rainy', label: '🌧️ Pioggia' },
  { value: 'stormy', label: '⛈️ Temporale' },
  { value: 'snowy', label: '❄️ Neve' },
  { value: 'foggy', label: '🌫️ Nebbia' },
]

// Tipo dati form
export interface ClosureFormData {
  date: Date
  venueId: string
  isEvent: boolean
  eventName?: string
  weatherMorning?: string
  weatherAfternoon?: string
  weatherEvening?: string
  notes?: string
  stations: (CashStationData & { isEventOnly?: boolean })[]
  partials: HourlyPartialData[]
  expenses: ExpenseData[]
  attendance: AttendanceData[]
}

// Props
interface ClosureFormProps {
  initialData?: Partial<ClosureFormData>
  venueId: string
  venueName: string
  vatRate?: number
  cashStationTemplates: { id: string; name: string; position: number; isEventOnly?: boolean }[]
  staffMembers: { id: string; firstName: string; lastName: string; isFixedStaff?: boolean; hourlyRate?: number | null; defaultShift?: 'MORNING' | 'EVENING' | null }[]
  accounts: { id: string; code: string; name: string }[]
  closureId?: string
  status?: 'DRAFT' | 'SUBMITTED' | 'VALIDATED'
  onSave?: (data: ClosureFormData) => Promise<void>
  onSubmit?: (data: ClosureFormData) => Promise<void>
}

export function ClosureForm({
  initialData,
  venueId,
  venueName,
  vatRate = DEFAULT_VAT_RATE,
  cashStationTemplates,
  staffMembers,
  accounts,
  closureId,
  status = 'DRAFT',
  onSave,
  onSubmit,
}: ClosureFormProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [previousCoffeeCount, setPreviousCoffeeCount] = useState<number | null>(null)

  // Inizializza stazioni da template (include tutte, verranno filtrate in visualizzazione)
  const initializeStations = useCallback((): (CashStationData & { isEventOnly?: boolean })[] => {
    if (initialData?.stations?.length) {
      // Per chiusure esistenti, aggiungi isEventOnly dal template
      return initialData.stations.map((station) => {
        const template = cashStationTemplates.find((t) => t.name === station.name)
        return {
          ...station,
          isEventOnly: template?.isEventOnly || false,
        }
      })
    }
    return cashStationTemplates.map((template) => ({
      name: template.name,
      position: template.position,
      isEventOnly: template.isEventOnly || false,
      ...emptyCashStation,
      cashCount: { ...emptyCashCount },
    }))
  }, [initialData?.stations, cashStationTemplates])

  // State form
  const [formData, setFormData] = useState<ClosureFormData>({
    date: initialData?.date || new Date(),
    venueId,
    isEvent: initialData?.isEvent || false,
    eventName: initialData?.eventName || '',
    weatherMorning: initialData?.weatherMorning || '',
    weatherAfternoon: initialData?.weatherAfternoon || '',
    weatherEvening: initialData?.weatherEvening || '',
    notes: initialData?.notes || '',
    stations: initializeStations(),
    partials: initialData?.partials || [],
    expenses: initialData?.expenses || [],
    attendance: initialData?.attendance || [],
  })

  // Calcoli totali
  const totals = useMemo(() => {
    // Totale contanti incassati (da scontrino)
    const cashTotal = formData.stations.reduce(
      (sum, s) => sum + (s.cashAmount || 0),
      0
    )

    // Totale POS
    const posTotal = formData.stations.reduce(
      (sum, s) => sum + (s.posAmount || 0),
      0
    )

    // Totale contato (somma conteggio fisico banconote/monete)
    const countedTotal = formData.stations.reduce(
      (sum, s) => sum + calculateCashCountTotal(s.cashCount),
      0
    )

    // Totale uscite
    const expensesTotal = formData.expenses.reduce(
      (sum, e) => sum + (e.amount || 0),
      0
    )

    // QUADRATURA CASSA:
    // Confronto diretto tra cassa contata e vendite contanti da scontrino
    // Le uscite sono mostrate separatamente ma NON influenzano la quadratura
    // (potrebbero essere pagate da varie fonti, non solo dalla cassa)
    const cashDifference = countedTotal - cashTotal

    // Totale vendite (solo incassi, senza uscite)
    const salesTotal = cashTotal + posTotal

    // Totale movimentazione = vendite + uscite (tutto il denaro movimentato)
    const grossTotal = salesTotal + expensesTotal

    // Incasso contanti totale = vendite contanti + uscite pagate
    // Perché: se ho 550€ in cassa e ho pagato 37,90€ di uscite,
    // significa che l'incasso contanti totale era 587,90€
    const cashIncomeTotal = cashTotal + expensesTotal

    // IVA stimata (solo sulle vendite)
    const estimatedVat = salesTotal * vatRate

    // Totale netto (vendite meno IVA)
    const netTotal = salesTotal - estimatedVat

    // Versamento banca = totale POS (i contanti restano in cassa)
    const bankDeposit = posTotal

    return {
      grossTotal,
      salesTotal,
      cashTotal,
      posTotal,
      countedTotal,
      expensesTotal,
      cashIncomeTotal,
      cashDifference,
      estimatedVat,
      netTotal,
      bankDeposit,
      hasSignificantDifference:
        countedTotal > 0 &&
        Math.abs(cashDifference) > CASH_DIFFERENCE_THRESHOLD,
    }
  }, [formData.stations, formData.expenses, vatRate])

  // Fetch contatore caffè del giorno precedente
  useEffect(() => {
    const fetchPreviousCoffee = async () => {
      try {
        const dateStr = format(formData.date, 'yyyy-MM-dd')
        const res = await fetch(
          `/api/chiusure/previous-coffee?date=${dateStr}&venueId=${venueId}`
        )
        if (res.ok) {
          const data = await res.json()
          setPreviousCoffeeCount(data.previousCoffeeCount ?? null)
        }
      } catch (error) {
        console.error('Errore nel recupero caffè precedente:', error)
      }
    }

    fetchPreviousCoffee()
  }, [formData.date, venueId])

  // Handlers
  const handleFieldChange = (field: keyof ClosureFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleStationChange = (index: number, data: CashStationData) => {
    const updated = [...formData.stations]
    updated[index] = data
    setFormData((prev) => ({ ...prev, stations: updated }))
  }

  // Handler per presenze con auto-generazione uscite per extra pagati
  const handleAttendanceChange = (newAttendance: AttendanceData[]) => {
    // Identifica gli extra pagati nella nuova lista
    const paidExtras = newAttendance.filter((a) => a.isExtra && a.isPaid && (a.totalPay || 0) > 0)

    // Rimuovi tutte le uscite auto-generate per extra (identificate dal prefisso [EXTRA])
    const nonAutoExpenses = formData.expenses.filter(
      (e) => !e.payee.startsWith('[EXTRA]')
    )

    // Genera nuove uscite per ogni extra pagato
    const autoExpenses: ExpenseData[] = paidExtras.map((extra) => ({
      payee: `[EXTRA] ${extra.userName || 'Personale Extra'}`,
      description: `Compenso ${extra.shift === 'MORNING' ? 'mattina' : 'sera'} - ${extra.hours || 0}h x ${formatCurrency(extra.hourlyRate || 0)}/h`,
      documentType: 'PERSONALE' as const,
      amount: extra.totalPay || 0,
      isPaid: true,
      paidBy: '', // Pagato dalla cassa, impatta quadratura
    }))

    // Combina le uscite
    const updatedExpenses = [...nonAutoExpenses, ...autoExpenses]

    setFormData((prev) => ({
      ...prev,
      attendance: newAttendance,
      expenses: updatedExpenses,
    }))
  }

  // Salva bozza
  const handleSave = async () => {
    if (!onSave) return

    setIsSaving(true)
    try {
      await onSave(formData)
      toast.success('Chiusura salvata')
    } catch (error) {
      console.error('Errore salvataggio:', error)
      toast.error('Errore nel salvataggio')
    } finally {
      setIsSaving(false)
    }
  }

  // Invia per validazione
  const handleSubmit = async () => {
    if (!onSubmit) return

    // Validazione base
    if (formData.stations.length === 0) {
      toast.error('Aggiungi almeno una postazione cassa')
      return
    }

    // Verifica che almeno una stazione abbia incassi
    const hasAnyActivity = formData.stations.some(
      (s) => (s.cashAmount || 0) > 0 || (s.posAmount || 0) > 0
    )
    if (!hasAnyActivity) {
      toast.error('Inserisci almeno un incasso (Contanti o POS) in una postazione')
      return
    }

    // Verifica POS per postazioni con contanti
    const stationsWithCashButNoPos = formData.stations.filter(
      (s) => (s.cashAmount || 0) > 0 && (s.posAmount || 0) === 0
    )
    if (stationsWithCashButNoPos.length > 0) {
      const names = stationsWithCashButNoPos.map((s) => s.name).join(', ')
      const confirmNoPos = window.confirm(
        `Le seguenti postazioni hanno incasso contanti ma POS a €0:\n${names}\n\nConfermi che non ci sono stati pagamenti POS?`
      )
      if (!confirmNoPos) {
        toast.error('Inserisci l\'importo POS per completare la chiusura')
        return
      }
    }

    if (totals.hasSignificantDifference) {
      const confirm = window.confirm(
        `Attenzione: c'è una differenza cassa di ${formatCurrency(totals.cashDifference)}. Vuoi procedere comunque?`
      )
      if (!confirm) return
    }

    setIsSubmitting(true)
    try {
      await onSubmit(formData)
      toast.success('Chiusura inviata per validazione')
      router.push('/chiusura-cassa')
    } catch (error) {
      console.error('Errore invio:', error)
      toast.error('Errore nell\'invio')
    } finally {
      setIsSubmitting(false)
    }
  }

  const isReadOnly = status !== 'DRAFT'

  return (
    <div className="space-y-6">
      {/* Header con data e sede */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {closureId ? 'Modifica Chiusura' : 'Nuova Chiusura'}
          </h1>
          <p className="text-muted-foreground">
            {venueName} - {formatDate(formData.date)}
          </p>
        </div>
        <Badge
          variant={
            status === 'VALIDATED'
              ? 'default'
              : status === 'SUBMITTED'
              ? 'secondary'
              : 'outline'
          }
          className="text-sm"
        >
          {status === 'VALIDATED'
            ? 'Validata'
            : status === 'SUBMITTED'
            ? 'In attesa'
            : 'Bozza'}
        </Badge>
      </div>

      {/* Sezione Metadati */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Informazioni Giornata
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Data e Evento */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Data</Label>
              <Input
                id="date"
                type="date"
                value={format(formData.date, 'yyyy-MM-dd')}
                onChange={(e) =>
                  handleFieldChange('date', new Date(e.target.value))
                }
                disabled={isReadOnly}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isEvent}
                  onChange={(e) =>
                    handleFieldChange('isEvent', e.target.checked)
                  }
                  disabled={isReadOnly}
                  className="h-4 w-4"
                />
                <PartyPopper className="h-4 w-4" />
                Evento speciale
              </Label>
              {formData.isEvent && (
                <Input
                  value={formData.eventName || ''}
                  onChange={(e) =>
                    handleFieldChange('eventName', e.target.value)
                  }
                  disabled={isReadOnly}
                  placeholder="Nome evento..."
                />
              )}
            </div>
          </div>

          {/* Meteo */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <CloudSun className="h-4 w-4" />
              Condizioni Meteo
            </Label>
            <div className="grid grid-cols-3 gap-4">
              <Select
                value={formData.weatherMorning || ''}
                onValueChange={(v) => handleFieldChange('weatherMorning', v)}
                disabled={isReadOnly}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Mattina" />
                </SelectTrigger>
                <SelectContent>
                  {WEATHER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={formData.weatherAfternoon || ''}
                onValueChange={(v) => handleFieldChange('weatherAfternoon', v)}
                disabled={isReadOnly}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pomeriggio" />
                </SelectTrigger>
                <SelectContent>
                  {WEATHER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={formData.weatherEvening || ''}
                onValueChange={(v) => handleFieldChange('weatherEvening', v)}
                disabled={isReadOnly}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sera" />
                </SelectTrigger>
                <SelectContent>
                  {WEATHER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sezione Postazioni Cassa */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Postazioni Cassa</h2>
        {formData.stations
          .filter((station) => {
            // Mostra tutte le postazioni se è un evento
            // Altrimenti mostra solo quelle NON marcate come "solo evento"
            if (formData.isEvent) return true
            return !station.isEventOnly
          })
          .map((station) => {
            // Trova l'indice originale per l'handler di modifica
            const originalIndex = formData.stations.findIndex((s) => s.name === station.name)
            return (
              <CashStationCard
                key={station.name}
                station={station}
                onChange={(data) => handleStationChange(originalIndex, data)}
                disabled={isReadOnly}
                defaultExpanded={originalIndex === 0}
                vatRate={vatRate}
              />
            )
          })}
      </div>

      {/* Parziali Orari */}
      <HourlyPartialsSection
        partials={formData.partials}
        onChange={(partials) => handleFieldChange('partials', partials)}
        previousCoffeeCount={previousCoffeeCount}
        disabled={isReadOnly}
      />

      {/* Uscite */}
      <ExpensesSection
        expenses={formData.expenses}
        onChange={(expenses) => handleFieldChange('expenses', expenses)}
        accounts={accounts}
        disabled={isReadOnly}
      />

      {/* Presenze */}
      <AttendanceSection
        attendance={formData.attendance}
        onChange={handleAttendanceChange}
        staffMembers={staffMembers}
        disabled={isReadOnly}
      />

      {/* Note */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Note</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.notes || ''}
            onChange={(e) => handleFieldChange('notes', e.target.value)}
            disabled={isReadOnly}
            placeholder="Note aggiuntive sulla giornata..."
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Riepilogo */}
      <Card
        className={cn(
          totals.hasSignificantDifference && 'border-destructive border-2'
        )}
      >
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            Riepilogo
            {totals.hasSignificantDifference && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                Differenza Cassa
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            {/* Colonna sinistra: Movimentazione */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vendite Contanti:</span>
                <span className="font-mono">
                  {formatCurrency(totals.cashTotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vendite POS:</span>
                <span className="font-mono">
                  {formatCurrency(totals.posTotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Uscite Pagate:</span>
                <span className="font-mono">
                  {formatCurrency(totals.expensesTotal)}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Totale Lordo:</span>
                <span className="font-mono">
                  {formatCurrency(totals.grossTotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  IVA stimata ({(vatRate * 100).toFixed(0)}%):
                </span>
                <span className="font-mono">
                  {formatCurrency(totals.estimatedVat)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Netto Vendite:</span>
                <span className="font-mono">
                  {formatCurrency(totals.netTotal)}
                </span>
              </div>
            </div>

            {/* Colonna destra: Quadratura Cassa */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vendite Contanti:</span>
                <span className="font-mono">
                  {formatCurrency(totals.cashTotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cassa Contata:</span>
                <span className="font-mono">
                  {formatCurrency(totals.countedTotal)}
                </span>
              </div>
              <div
                className={cn(
                  'flex justify-between font-semibold',
                  totals.hasSignificantDifference && 'text-destructive'
                )}
              >
                <span>Differenza:</span>
                <span className="font-mono">
                  {totals.cashDifference >= 0 ? '+' : ''}
                  {formatCurrency(totals.cashDifference)}
                </span>
              </div>
            </div>
          </div>

          {/* Riepilogo Contanti */}
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Incasso Contanti (Vendite + Uscite):
            </span>
            <span className="font-mono font-semibold">
              {formatCurrency(totals.cashIncomeTotal)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Contanti in Cassa:</span>
            <span className="font-mono">
              {formatCurrency(totals.countedTotal)}
            </span>
          </div>
          <div className="flex justify-between font-semibold text-primary">
            <span>Versamento Banca (POS):</span>
            <span className="font-mono">
              {formatCurrency(totals.bankDeposit)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Azioni */}
      {!isReadOnly && (
        <div className="flex justify-end gap-3 sticky bottom-4 bg-background/95 backdrop-blur py-4 -mx-4 px-4 border-t">
          <Button
            variant="outline"
            onClick={handleSave}
            disabled={isSaving || isSubmitting}
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Salvataggio...' : 'Salva Bozza'}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSaving || isSubmitting}
          >
            <Send className="h-4 w-4 mr-2" />
            {isSubmitting ? 'Invio...' : 'Invia per Validazione'}
          </Button>
        </div>
      )}
    </div>
  )
}
