'use client'

import { useRouter } from 'next/navigation'
import { ClosureForm, ClosureFormData } from '@/components/chiusura'
import { toast } from 'sonner'

interface NuovaChiusuraClientProps {
  venue: {
    id: string
    name: string
    vatRate: number
    defaultFloat: number
  }
  cashStationTemplates: { id: string; name: string; position: number; isEventOnly: boolean }[]
  staffMembers: { id: string; firstName: string; lastName: string; isFixedStaff: boolean; hourlyRate: number | null }[]
  accounts: { id: string; code: string; name: string }[]
}

export function NuovaChiusuraClient({
  venue,
  cashStationTemplates,
  staffMembers,
  accounts,
}: NuovaChiusuraClientProps) {
  const router = useRouter()

  // Salva bozza
  const handleSave = async (data: ClosureFormData) => {
    const res = await fetch('/api/chiusure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: data.date.toISOString(),
        venueId: venue.id,
        isEvent: data.isEvent,
        eventName: data.eventName,
        weatherMorning: data.weatherMorning,
        weatherAfternoon: data.weatherAfternoon,
        weatherEvening: data.weatherEvening,
        notes: data.notes,
        stations: data.stations.map((s) => ({
          name: s.name,
          position: s.position,
          receiptAmount: s.receiptAmount,
          receiptVat: s.receiptVat,
          invoiceAmount: s.invoiceAmount,
          invoiceVat: s.invoiceVat,
          suspendedAmount: s.suspendedAmount,
          cashAmount: s.cashAmount,
          posAmount: s.posAmount,
          floatAmount: s.floatAmount,
          cashCount: s.cashCount,
        })),
        partials: data.partials.map((p) => ({
          timeSlot: p.timeSlot,
          receiptProgressive: p.receiptProgressive,
          posProgressive: p.posProgressive,
          coffeeCounter: p.coffeeCounter,
          coffeeDelta: p.coffeeDelta,
          weather: p.weather,
        })),
        expenses: data.expenses.map((e) => ({
          payee: e.payee,
          description: e.description,
          documentRef: e.documentRef,
          documentType: e.documentType,
          amount: e.amount,
          vatAmount: e.vatAmount,
          accountId: e.accountId,
          isPaid: e.isPaid,
          paidBy: e.paidBy,
        })),
        attendance: data.attendance.map((a) => ({
          userId: a.userId,
          shift: a.shift,
          hours: a.hours,
          statusCode: a.statusCode,
          hourlyRate: a.hourlyRate,
          notes: a.notes,
        })),
      }),
    })

    if (!res.ok) {
      const errorData = await res.json()
      if (res.status === 409 && errorData.existingId) {
        // Già esiste una chiusura per questa data
        toast.error('Esiste già una chiusura per questa data')
        router.push(`/chiusura-cassa/${errorData.existingId}/modifica`)
        return
      }
      throw new Error(errorData.error || 'Errore nel salvataggio')
    }

    const result = await res.json()
    router.push(`/chiusura-cassa/${result.id}`)
  }

  // Invia per validazione
  const handleSubmit = async (data: ClosureFormData) => {
    // Prima salva
    const saveRes = await fetch('/api/chiusure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: data.date.toISOString(),
        venueId: venue.id,
        isEvent: data.isEvent,
        eventName: data.eventName,
        weatherMorning: data.weatherMorning,
        weatherAfternoon: data.weatherAfternoon,
        weatherEvening: data.weatherEvening,
        notes: data.notes,
        stations: data.stations.map((s) => ({
          name: s.name,
          position: s.position,
          receiptAmount: s.receiptAmount,
          receiptVat: s.receiptVat,
          invoiceAmount: s.invoiceAmount,
          invoiceVat: s.invoiceVat,
          suspendedAmount: s.suspendedAmount,
          cashAmount: s.cashAmount,
          posAmount: s.posAmount,
          floatAmount: s.floatAmount,
          cashCount: s.cashCount,
        })),
        partials: data.partials.map((p) => ({
          timeSlot: p.timeSlot,
          receiptProgressive: p.receiptProgressive,
          posProgressive: p.posProgressive,
          coffeeCounter: p.coffeeCounter,
          coffeeDelta: p.coffeeDelta,
          weather: p.weather,
        })),
        expenses: data.expenses.map((e) => ({
          payee: e.payee,
          description: e.description,
          documentRef: e.documentRef,
          documentType: e.documentType,
          amount: e.amount,
          vatAmount: e.vatAmount,
          accountId: e.accountId,
          isPaid: e.isPaid,
          paidBy: e.paidBy,
        })),
        attendance: data.attendance.map((a) => ({
          userId: a.userId,
          shift: a.shift,
          hours: a.hours,
          statusCode: a.statusCode,
          hourlyRate: a.hourlyRate,
          notes: a.notes,
        })),
      }),
    })

    if (!saveRes.ok) {
      const errorData = await saveRes.json()
      throw new Error(errorData.error || 'Errore nel salvataggio')
    }

    const saveResult = await saveRes.json()

    // Poi invia per validazione
    const submitRes = await fetch(`/api/chiusure/${saveResult.id}/submit`, {
      method: 'POST',
    })

    if (!submitRes.ok) {
      const errorData = await submitRes.json()
      throw new Error(errorData.error || 'Errore nell\'invio')
    }

    router.push('/chiusura-cassa')
  }

  return (
    <ClosureForm
      venueId={venue.id}
      venueName={venue.name}
      vatRate={venue.vatRate}
      defaultFloat={venue.defaultFloat}
      cashStationTemplates={cashStationTemplates}
      staffMembers={staffMembers}
      accounts={accounts}
      onSave={handleSave}
      onSubmit={handleSubmit}
    />
  )
}
