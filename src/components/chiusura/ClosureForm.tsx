'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { formatDate, DEFAULT_VAT_RATE, DEFAULT_PARTIAL_HOURS } from '@/lib/constants'
import { formatCurrency } from '@/lib/formatters'
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
import {
  AVVISO_OFFLINE,
  ErroreSenzaRete,
  esitoOppureNiente,
  type EsitoSalvataggio,
} from '@/lib/offline'

import { logger } from '@/lib/logger'

function shiftLabel(shift: 'MORNING' | 'EVENING') {
  return shift === 'MORNING' ? 'Mattina' : 'Sera'
}

function getDraftBlockingIssues(data: ClosureFormData): string[] {
  const issues: string[] = []

  const fixedRows = data.attendance.filter((a) => !a.isExtra)
  const extraRows = data.attendance.filter((a) => a.isExtra)

  fixedRows.forEach((row, index) => {
    if (!row.userId?.trim()) {
      issues.push(`Presenze: riga ${index + 1} — seleziona un dipendente oppure elimina la riga`)
    }
  })

  extraRows.forEach((row, index) => {
    if (!row.userId?.trim()) {
      issues.push(
        `Extra: riga ${index + 1} — seleziona una persona e inserisci le ore (oppure elimina la riga)`
      )
    }
  })

  const seenAttendance = new Set<string>()
  for (const row of data.attendance) {
    const userId = row.userId?.trim()
    if (!userId) continue
    const key = `${userId}:${row.shift}`
    if (seenAttendance.has(key)) {
      const who = row.userName?.trim() || userId
      issues.push(`Presenze: ${who} è inserito più volte nel turno ${shiftLabel(row.shift)}`)
    } else {
      seenAttendance.add(key)
    }
  }

  const seenSlots = new Set<string>()
  for (const partial of data.partials) {
    const slot = partial.timeSlot?.trim()
    if (!slot) continue
    if (seenSlots.has(slot)) {
      issues.push(`Parziali orari: orario duplicato ${slot} (rimuovi o modifica uno dei due)`)
    } else {
      seenSlots.add(slot)
    }
  }

  return issues
}

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
  onSave?: (data: ClosureFormData) => Promise<EsitoSalvataggio | void>
  onSubmit?: (data: ClosureFormData) => Promise<EsitoSalvataggio | void>
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
  // Timbrature ancora aperte, riferite dalla sezione Presenze: bloccano l'invio.
  const [sessioniAperte, setSessioniAperte] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [previousCoffeeCount, setPreviousCoffeeCount] = useState<number | null>(null)

  // Inizializza stazioni da template (include tutte, verranno filtrate in visualizzazione).
  // Serve una volta sola, all'inizializzazione dello stato: memoizzarla non dava
  // alcun vantaggio e le dipendenze dichiarate a mano non coincidevano con quelle
  // che il compiler deduce, il che gli impediva di ottimizzare tutto il componente.
  const initializeStations = (): (CashStationData & { isEventOnly?: boolean })[] => {
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
  }

  // State form
  const [formData, setFormData] = useState<ClosureFormData>(() => ({
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
  }))

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

  // Converte nome postazione nel valore paidBy corrispondente
  // es. "CASSA 1" → "CASSA1", "BAR" → "BAR"
  const getStationPaidByKey = (stationName: string): string => {
    return stationName.replace(/\s/g, '').toUpperCase()
  }

  // Calcola stazioni attive (almeno un importo > 0)
  const activeStationKeys = useMemo(() => {
    return formData.stations
      .filter(s =>
        s.receiptAmount > 0 ||
        s.cashAmount > 0 ||
        s.posAmount > 0 ||
        s.invoiceAmount > 0 ||
        s.suspendedAmount > 0
      )
      .map(s => getStationPaidByKey(s.name))
  }, [formData.stations])

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

    const blockingIssues = getDraftBlockingIssues(formData)
    if (blockingIssues.length > 0) {
      toast.error('Bozza non salvata', {
        description: blockingIssues.join('\n'),
      })
      return
    }

    setIsSaving(true)
    try {
      const esito = esitoOppureNiente(await onSave(formData))

      // Conflitto: il messaggio e il cambio di pagina sono già partiti da chi
      // ha parlato col server. Un «Bozza salvata» qui sopra sarebbe il secondo
      // messaggio, e direbbe il contrario del primo.
      if (esito?.esito === 'conflitto') return

      if (esito?.esito === 'in-coda') {
        toast.success('Chiusura salvata su questo dispositivo', {
          id: AVVISO_OFFLINE,
          description:
            'Sei offline: partirà da sola appena torna la rete. Puoi chiudere la pagina.',
          duration: 8000,
        })
        return
      }

      toast.success('Bozza salvata', {
        description: 'La chiusura è stata salvata correttamente.',
      })
    } catch (error) {
      // Senza rete e senza coda: quello che si può dire è solo questo, e va
      // detto sul canale degli avvisi offline, che così ne mostra uno solo.
      if (error instanceof ErroreSenzaRete) {
        toast.warning('Chiusura non salvata', {
          id: AVVISO_OFFLINE,
          description: error.message,
          duration: 10000,
        })
        return
      }

      logger.error('Errore salvataggio', error)
      const err = error instanceof Error ? error : new Error('Errore nel salvataggio')
      const details = Array.isArray((err as unknown as { details?: unknown }).details)
        ? ((err as unknown as { details: string[] }).details ?? [])
        : []
      if (details.length > 0) {
        toast.error('Errore salvataggio bozza', { description: details.join('\n') })
      } else {
        toast.error('Errore salvataggio bozza', {
          description: err.message || 'Riprova tra qualche secondo.',
        })
      }
    } finally {
      setIsSaving(false)
    }
  }

  // Invia per validazione
  const handleSubmit = async () => {
    if (!onSubmit) return

    const blockingIssues = getDraftBlockingIssues(formData)
    if (blockingIssues.length > 0) {
      toast.error('Invio non possibile', {
        description: blockingIssues.join('\n'),
      })
      return
    }

    // La chiusura termina il servizio: prima dell'invio vanno confermate le
    // uscite di chi risulta ancora dentro. Il server rifiuta comunque.
    if (sessioniAperte > 0) {
      toast.error('Timbrature ancora aperte', {
        description:
          sessioniAperte === 1
            ? 'Una persona risulta ancora dentro: conferma il suo orario di uscita nella sezione Presenze.'
            : `${sessioniAperte} persone risultano ancora dentro: conferma i loro orari di uscita nella sezione Presenze.`,
      })
      return
    }

    // Verifica paidBy su tutte le uscite
    const expensesWithoutPaidBy = formData.expenses.filter(
      (e) => e.amount > 0 && !e.paidBy
    )
    if (expensesWithoutPaidBy.length > 0) {
      const exampleItems = expensesWithoutPaidBy
        .map((e) => e.payee?.trim())
        .filter(Boolean)
        .slice(0, 2)
      const examples = exampleItems.join(', ')
      const extraCount = expensesWithoutPaidBy.length - exampleItems.length
      const descriptionParts = []
      descriptionParts.push(
        `Manca "Pagato da" per ${expensesWithoutPaidBy.length} riga/e.`
      )
      if (examples) {
        descriptionParts.push(
          `Esempi: ${examples}${extraCount > 0 ? `, +${extraCount} altre` : ''}`
        )
      }
      descriptionParts.push('Seleziona la postazione che ha anticipato il pagamento.')
      toast.error('Uscite di cassa incomplete', { description: descriptionParts.join('\n') })
      return
    }

    // Validazione base
    if (formData.stations.length === 0) {
      toast.error('Postazioni mancanti', {
        description: 'Aggiungi almeno una postazione per inviare la chiusura.',
      })
      return
    }

    // Verifica che almeno una stazione abbia incassi
    const hasAnyActivity = formData.stations.some(
      (s) => (s.cashAmount || 0) > 0 || (s.posAmount || 0) > 0
    )
    if (!hasAnyActivity) {
      toast.error('Incassi mancanti', {
        description:
          'Tutte le postazioni hanno Contanti e POS = 0. Inserisci almeno un incasso.',
      })
      return
    }

    // Verifica POS per postazioni con contanti
    const stationsWithCashButNoPos = formData.stations.filter(
      (s) => (s.cashAmount || 0) > 0 && (s.posAmount || 0) === 0
    )
    if (stationsWithCashButNoPos.length > 0) {
      const names = stationsWithCashButNoPos.map((s) => s.name).join(', ')
      const confirmNoPos = window.confirm(
        `POS: ${names}\nContanti > 0 e POS = 0.\n\nConfermi che non ci sono stati pagamenti POS?`
      )
      if (!confirmNoPos) {
        toast.error('POS non confermato', {
          description: `Postazioni: ${names}. Inserisci il POS oppure conferma che non ci sono stati pagamenti POS.`,
        })
        return
      }
    }

    if (totals.hasSignificantDifference) {
      const confirm = window.confirm(
        `Differenza cassa: ${formatCurrency(totals.cashDifference)}.\nVuoi inviare comunque la chiusura?`
      )
      if (!confirm) {
        toast.error('Invio annullato', {
          description: `Verifica la differenza cassa di ${formatCurrency(totals.cashDifference)}.`,
        })
        return
      }
    }

    // Check uscite manuali assenti
    const manualExpenses = formData.expenses.filter(
      (e) => !e.payee.startsWith('[EXTRA]') && !e.payee.startsWith('[PAGATO]')
    )
    if (manualExpenses.length === 0) {
      const confirmNoExpenses = window.confirm(
        'Uscite di cassa: nessuna uscita manuale registrata.\n\nConfermi che non ci sono state uscite oggi?'
      )
      if (!confirmNoExpenses) {
        toast.error('Invio annullato', {
          description:
            'Inserisci le uscite di cassa oppure conferma che non ce ne sono state.',
        })
        return
      }
    }

    setIsSubmitting(true)
    try {
      const esito = esitoOppureNiente(await onSubmit(formData))

      if (esito?.esito === 'conflitto') return

      if (esito?.esito === 'in-coda') {
        // La coda porta al server una bozza: l'invio per validazione è un
        // secondo passo che il server deve accettare, e non si può fingere che
        // sia già avvenuto.
        toast.success('Chiusura salvata su questo dispositivo', {
          id: AVVISO_OFFLINE,
          description:
            "Sei offline: partirà come bozza appena torna la rete. L'invio per validazione va rifatto da lì.",
          duration: 10000,
        })
        return
      }

      toast.success('Inviata per validazione', {
        description: 'La chiusura è stata inviata correttamente.',
      })
      router.push('/chiusura-cassa')
    } catch (error) {
      if (error instanceof ErroreSenzaRete) {
        toast.warning('Chiusura non inviata', {
          id: AVVISO_OFFLINE,
          description: error.message,
          duration: 10000,
        })
        return
      }

      logger.error('Errore invio', error)
      const err = error instanceof Error ? error : new Error("Errore nell'invio")
      const details = Array.isArray((err as unknown as { details?: unknown }).details)
        ? ((err as unknown as { details: string[] }).details ?? [])
        : []
      if (details.length > 0) {
        toast.error('Errore invio', { description: details.join('\n') })
      } else {
        toast.error('Errore invio', {
          description: err.message || 'Riprova tra qualche secondo.',
        })
      }
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
        activeStationKeys={activeStationKeys}
      />

      {/* Presenze */}
      <AttendanceSection
        attendance={formData.attendance}
        onChange={handleAttendanceChange}
        staffMembers={staffMembers}
        disabled={isReadOnly}
        closureDate={format(formData.date, 'yyyy-MM-dd')}
        venueId={venueId}
        onSessioniAperteChange={setSessioniAperte}
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
