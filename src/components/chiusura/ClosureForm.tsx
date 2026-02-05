'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate, DEFAULT_VAT_RATE, DEFAULT_PARTIAL_HOURS } from '@/lib/constants'
import { CashStationCard, CashStationData, emptyCashStation } from './CashStationCard'
import { HourlyPartialsSection, HourlyPartialData } from './HourlyPartialsSection'
import { ExpensesSection, ExpenseData } from './ExpensesSection'
import { AttendanceSection, AttendanceData } from './AttendanceSection'
import { emptyCashCount } from './CashCountGrid'
import { ClosureMetadataSection } from './ClosureMetadataSection'
import { ClosureSummaryCard } from './ClosureSummaryCard'
import { ClosureActions } from './ClosureActions'
import { useClosureCalculations } from './hooks/useClosureCalculations'
import { toast } from 'sonner'

import { logger } from '@/lib/logger'
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
    partials: initialData?.partials ?? DEFAULT_PARTIAL_HOURS.map((timeSlot) => ({
      timeSlot,
      receiptProgressive: 0,
      posProgressive: 0,
    })),
    expenses: initialData?.expenses || [],
    attendance: initialData?.attendance || [],
  })

  // Calcoli totali (extracted to hook)
  const totals = useClosureCalculations({
    stations: formData.stations,
    expenses: formData.expenses,
    vatRate,
  })

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
        logger.error('Errore nel recupero caffè precedente', error)
      }
    }

    fetchPreviousCoffee()
  }, [formData.date, venueId])

  // Handlers
  const handleFieldChange = (field: keyof ClosureFormData, value: ClosureFormData[keyof ClosureFormData]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleStationChange = (index: number, data: CashStationData) => {
    const updated = [...formData.stations]
    updated[index] = data
    setFormData((prev) => ({ ...prev, stations: updated }))
  }

  // Calcola uscite per postazione (mappa nome postazione normalizzato → totale uscite)
  const expensesByStation = useMemo(() => {
    const map: Record<string, number> = {}
    for (const expense of formData.expenses) {
      if (expense.paidBy && expense.amount > 0) {
        map[expense.paidBy] = (map[expense.paidBy] || 0) + expense.amount
      }
    }
    return map
  }, [formData.expenses])

  // Converte nome postazione nel valore paidBy corrispondente
  // es. "CASSA 1" → "CASSA1", "BAR" → "BAR"
  const getStationPaidByKey = (stationName: string): string => {
    return stationName.replace(/\s/g, '').toUpperCase()
  }

  // Handler per presenze con auto-generazione uscite per personale pagato
  const handleAttendanceChange = (newAttendance: AttendanceData[]) => {
    // Identifica tutto il personale pagato (extra + staff fisso con isPaid)
    const paidStaff = newAttendance.filter((a) => a.isPaid && (a.totalPay || 0) > 0)

    // Preserva paidBy delle auto-expenses esistenti
    const existingAutoPaidBy: Record<string, string> = {}
    for (const e of formData.expenses) {
      if ((e.payee.startsWith('[EXTRA]') || e.payee.startsWith('[PAGATO]')) && e.paidBy) {
        existingAutoPaidBy[e.payee] = e.paidBy
      }
    }

    // Rimuovi tutte le uscite auto-generate (identificate dai prefissi [EXTRA] e [PAGATO])
    const nonAutoExpenses = formData.expenses.filter(
      (e) => !e.payee.startsWith('[EXTRA]') && !e.payee.startsWith('[PAGATO]')
    )

    // Genera nuove uscite per ogni membro pagato
    const autoExpenses: ExpenseData[] = paidStaff.map((staff) => {
      const payeeLabel = staff.isExtra
        ? `[EXTRA] ${staff.userName || 'Personale Extra'}`
        : `[PAGATO] ${staff.userName || 'Dipendente'}`

      return {
        payee: payeeLabel,
        description: staff.isExtra
          ? `Compenso ${staff.shift === 'MORNING' ? 'mattina' : 'sera'} - ${staff.hours || 0}h x ${formatCurrency(staff.hourlyRate || 0)}/h`
          : `Pagamento fine servizio ${staff.shift === 'MORNING' ? 'mattina' : 'sera'} - ${staff.hours || 0}h x ${formatCurrency(staff.hourlyRate || 0)}/h`,
        documentType: 'PERSONALE' as const,
        amount: staff.totalPay || 0,
        isPaid: true,
        paidBy: existingAutoPaidBy[payeeLabel] || '',
      }
    })

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
      logger.error('Errore salvataggio', error)
      toast.error('Errore nel salvataggio')
    } finally {
      setIsSaving(false)
    }
  }

  // Invia per validazione
  const handleSubmit = async () => {
    if (!onSubmit) return

    // Verifica paidBy su tutte le uscite
    const expensesWithoutPaidBy = formData.expenses.filter(
      (e) => e.amount > 0 && !e.paidBy
    )
    if (expensesWithoutPaidBy.length > 0) {
      toast.error('Seleziona la postazione "Pagato da" per ogni uscita di cassa')
      return
    }

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

    // Check uscite manuali assenti
    const manualExpenses = formData.expenses.filter(
      (e) => !e.payee.startsWith('[EXTRA]') && !e.payee.startsWith('[PAGATO]')
    )
    if (manualExpenses.length === 0) {
      const confirmNoExpenses = window.confirm(
        'Nessuna uscita registrata per oggi.\n\nConfermi che non ci sono state uscite di cassa per questa giornata?'
      )
      if (!confirmNoExpenses) return
    }

    setIsSubmitting(true)
    try {
      await onSubmit(formData)
      toast.success('Chiusura inviata per validazione')
      router.push('/chiusura-cassa')
    } catch (error) {
      logger.error('Errore invio', error)
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
      <ClosureMetadataSection
        date={formData.date}
        isEvent={formData.isEvent}
        eventName={formData.eventName}
        weatherMorning={formData.weatherMorning}
        weatherAfternoon={formData.weatherAfternoon}
        weatherEvening={formData.weatherEvening}
        onDateChange={(date) => handleFieldChange('date', date)}
        onIsEventChange={(isEvent) => handleFieldChange('isEvent', isEvent)}
        onEventNameChange={(name) => handleFieldChange('eventName', name)}
        onWeatherMorningChange={(w) => handleFieldChange('weatherMorning', w)}
        onWeatherAfternoonChange={(w) => handleFieldChange('weatherAfternoon', w)}
        onWeatherEveningChange={(w) => handleFieldChange('weatherEvening', w)}
        notes={formData.notes}
        onNotesChange={(notes) => handleFieldChange('notes', notes)}
        disabled={isReadOnly}
      />

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
                stationExpenses={expensesByStation[getStationPaidByKey(station.name)] || 0}
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
        venueId={venueId}
      />

      {/* Presenze */}
      <AttendanceSection
        attendance={formData.attendance}
        onChange={handleAttendanceChange}
        staffMembers={staffMembers}
        disabled={isReadOnly}
        closureDate={format(formData.date, 'yyyy-MM-dd')}
        venueId={venueId}
      />

      {/* Riepilogo */}
      <ClosureSummaryCard totals={totals} vatRate={vatRate} />

      {/* Azioni */}
      {!isReadOnly && (
        <ClosureActions
          onSave={handleSave}
          onSubmit={handleSubmit}
          isSaving={isSaving}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  )
}
