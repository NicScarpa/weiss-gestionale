import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import { ModificaChiusuraClient } from './ModificaChiusuraClient'

export const metadata = {
  title: 'Modifica Chiusura Cassa'
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function ModificaChiusuraPage({ params }: Props) {
  const session = await auth()
  const { id } = await params

  if (!session?.user) {
    redirect('/login')
  }

  // Recupera la chiusura esistente
  const closure = await prisma.dailyClosure.findUnique({
    where: { id },
    include: {
      venue: {
        select: {
          id: true,
          name: true,
          code: true,
          vatRate: true,
          defaultFloat: true,
        },
      },
      stations: {
        include: {
          cashCount: true,
        },
        orderBy: { position: 'asc' },
      },
      partials: {
        orderBy: { timeSlot: 'asc' },
      },
      expenses: {
        include: {
          account: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
        orderBy: { position: 'asc' },
      },
      attendance: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  })

  if (!closure) {
    notFound()
  }

  // Verifica accesso
  if (
    session.user.role !== 'admin' &&
    session.user.venueId !== closure.venueId
  ) {
    redirect('/chiusura-cassa?error=unauthorized')
  }

  // Solo DRAFT può essere modificata (admin può modificare qualsiasi stato)
  if (closure.status !== 'DRAFT' && session.user.role !== 'admin') {
    redirect(`/chiusura-cassa/${id}?error=not-editable`)
  }

  // Flag per indicare che si sta modificando una chiusura validata
  const isEditingValidated = closure.status === 'VALIDATED'

  // Recupera dati aggiuntivi
  const [staffMembers, accounts] = await Promise.all([
    prisma.user.findMany({
      where: {
        venueId: closure.venueId,
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
    prisma.account.findMany({
      where: {
        isActive: true,
        type: 'COSTO',
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
      orderBy: { code: 'asc' },
    }),
  ])

  // Trasforma i dati per il form
  const initialData = {
    date: closure.date,
    venueId: closure.venueId,
    isEvent: closure.isEvent,
    eventName: closure.eventName || undefined,
    weatherMorning: closure.weatherMorning || undefined,
    weatherAfternoon: closure.weatherAfternoon || undefined,
    weatherEvening: closure.weatherEvening || undefined,
    notes: closure.notes || undefined,
    stations: closure.stations.map((s) => ({
      id: s.id,
      name: s.name,
      position: s.position,
      receiptAmount: Number(s.receiptAmount) || 0,
      receiptVat: Number(s.receiptVat) || 0,
      invoiceAmount: Number(s.invoiceAmount) || 0,
      invoiceVat: Number(s.invoiceVat) || 0,
      suspendedAmount: Number(s.suspendedAmount) || 0,
      cashAmount: Number(s.cashAmount) || 0,
      posAmount: Number(s.posAmount) || 0,
      floatAmount: Number(s.floatAmount) || 114,
      cashCount: s.cashCount
        ? {
            bills500: s.cashCount.bills500,
            bills200: s.cashCount.bills200,
            bills100: s.cashCount.bills100,
            bills50: s.cashCount.bills50,
            bills20: s.cashCount.bills20,
            bills10: s.cashCount.bills10,
            bills5: s.cashCount.bills5,
            coins2: s.cashCount.coins2,
            coins1: s.cashCount.coins1,
            coins050: s.cashCount.coins050,
            coins020: s.cashCount.coins020,
            coins010: s.cashCount.coins010,
            coins005: s.cashCount.coins005,
            coins002: s.cashCount.coins002,
            coins001: s.cashCount.coins001,
          }
        : {
            bills500: 0,
            bills200: 0,
            bills100: 0,
            bills50: 0,
            bills20: 0,
            bills10: 0,
            bills5: 0,
            coins2: 0,
            coins1: 0,
            coins050: 0,
            coins020: 0,
            coins010: 0,
            coins005: 0,
            coins002: 0,
            coins001: 0,
          },
    })),
    partials: closure.partials.map((p) => ({
      id: p.id,
      timeSlot: p.timeSlot,
      receiptProgressive: Number(p.receiptProgressive) || 0,
      posProgressive: Number(p.posProgressive) || 0,
      coffeeCounter: p.coffeeCounter || undefined,
      coffeeDelta: p.coffeeDelta || undefined,
    })),
    expenses: closure.expenses.map((e) => ({
      id: e.id,
      payee: e.payee,
      documentRef: e.documentRef || undefined,
      documentType: e.documentType as 'NONE' | 'FATTURA' | 'DDT' | 'RICEVUTA' | 'PERSONALE',
      amount: Number(e.amount) || 0,
      vatAmount: Number(e.vatAmount) || undefined,
      accountId: e.accountId || undefined,
      paidBy: e.paidBy || undefined,
    })),
    attendance: closure.attendance.map((a) => ({
      id: a.id,
      userId: a.userId,
      userName: `${a.user.firstName} ${a.user.lastName}`,
      shift: a.shift as 'MORNING' | 'EVENING',
      hours: Number(a.hours) || undefined,
      statusCode: a.statusCode || undefined,
      hourlyRate: Number(a.hourlyRate) || undefined,
      totalPay: Number(a.totalPay) || undefined,
      isPaid: a.isPaid || undefined,
      notes: a.notes || undefined,
    })),
  }

  return (
    <ModificaChiusuraClient
      closureId={id}
      initialData={initialData}
      venue={{
        id: closure.venue.id,
        name: closure.venue.name,
        vatRate: (Number(closure.venue.vatRate) / 100) || 0.1,
      }}
      cashStationTemplates={closure.stations.map((s) => ({
        id: s.id,
        name: s.name,
        position: s.position,
      }))}
      staffMembers={staffMembers}
      accounts={accounts}
      isEditingValidated={isEditingValidated}
    />
  )
}
