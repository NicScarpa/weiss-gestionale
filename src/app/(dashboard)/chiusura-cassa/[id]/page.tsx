import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import Link from 'next/link'
import {
  ArrowLeft,
  Pencil,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Calendar,
  CloudSun,
  Banknote,
  CreditCard,
  Trash2,
  Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { formatCurrency, CASH_DIFFERENCE_THRESHOLD, getWeatherEmoji } from '@/lib/constants'
import { ValidateActions } from './ValidateActions'
import { AdminClosureActions } from './AdminClosureActions'

export const metadata = {
  title: 'Dettaglio Chiusura'
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function DettaglioChiusuraPage({ params }: Props) {
  const session = await auth()
  const { id } = await params

  if (!session?.user) {
    redirect('/login')
  }

  // Recupera la chiusura
  const closure = await prisma.dailyClosure.findUnique({
    where: { id },
    include: {
      venue: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      submittedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      validatedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
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

  // Calcoli
  const salesTotal = closure.stations.reduce(
    (sum, s) => sum + Number(s.totalAmount || 0),
    0
  )
  const cashSales = closure.stations.reduce(
    (sum, s) => sum + Number(s.cashAmount || 0),
    0
  )
  const posTotal = closure.stations.reduce(
    (sum, s) => sum + Number(s.posAmount || 0),
    0
  )
  const expensesTotal = closure.expenses.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  )

  // Totale Lordo = Vendite + Uscite (tutto il movimento del giorno)
  const grossTotal = salesTotal + expensesTotal

  // Contanti = Vendite contanti + Uscite pagate (tutto il contante movimentato)
  // Se ho 550€ in cassa e ho pagato 37,90€ di uscite, l'incasso contanti era 587,90€
  const cashTotal = cashSales + expensesTotal

  // Calcola differenza cassa per ogni stazione
  const calculateCashCounted = (cashCount: any): number => {
    if (!cashCount) return 0
    return (
      (cashCount.bills500 || 0) * 500 +
      (cashCount.bills200 || 0) * 200 +
      (cashCount.bills100 || 0) * 100 +
      (cashCount.bills50 || 0) * 50 +
      (cashCount.bills20 || 0) * 20 +
      (cashCount.bills10 || 0) * 10 +
      (cashCount.bills5 || 0) * 5 +
      (cashCount.coins2 || 0) * 2 +
      (cashCount.coins1 || 0) * 1 +
      (cashCount.coins050 || 0) * 0.5 +
      (cashCount.coins020 || 0) * 0.2 +
      (cashCount.coins010 || 0) * 0.1 +
      (cashCount.coins005 || 0) * 0.05 +
      (cashCount.coins002 || 0) * 0.02 +
      (cashCount.coins001 || 0) * 0.01
    )
  }

  const countedTotal = closure.stations.reduce(
    (sum, s) => sum + calculateCashCounted(s.cashCount),
    0
  )
  // La differenza cassa confronta il contato con le vendite contanti (non include le uscite)
  const cashDifference = countedTotal - cashSales
  const hasSignificantDifference =
    countedTotal > 0 && Math.abs(cashDifference) > CASH_DIFFERENCE_THRESHOLD

  const canValidate =
    closure.status === 'SUBMITTED' &&
    (session.user.role === 'admin' || session.user.role === 'manager')

  const getStatusBadge = () => {
    switch (closure.status) {
      case 'DRAFT':
        return (
          <Badge variant="outline" className="gap-1 border-amber-500 bg-amber-50 text-amber-700">
            <FileText className="h-3 w-3" />
            Bozza
          </Badge>
        )
      case 'SUBMITTED':
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" />
            In attesa di validazione
          </Badge>
        )
      case 'VALIDATED':
        return (
          <Badge variant="default" className="gap-1 bg-green-600">
            <CheckCircle className="h-3 w-3" />
            Validata
          </Badge>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/chiusura-cassa">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              Chiusura del{' '}
              {format(new Date(closure.date), 'd MMMM yyyy', { locale: it })}
            </h1>
            <p className="text-muted-foreground flex items-center gap-2">
              {closure.venue.name}
              {getStatusBadge()}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {/* Scarica PDF */}
          <Button variant="outline" asChild>
            <a href={`/api/chiusure/${id}/pdf`} download>
              <Download className="mr-2 h-4 w-4" />
              PDF
            </a>
          </Button>

          {/* Scarica Excel */}
          <Button variant="outline" asChild>
            <a href={`/api/chiusure/${id}/excel`} download>
              <Download className="mr-2 h-4 w-4" />
              Excel
            </a>
          </Button>

          {/* Modifica: DRAFT per tutti, qualsiasi stato per admin */}
          {(closure.status === 'DRAFT' || session.user.role === 'admin') && (
            <Button variant="outline" asChild>
              <Link href={`/chiusura-cassa/${id}/modifica`}>
                <Pencil className="mr-2 h-4 w-4" />
                Modifica
              </Link>
            </Button>
          )}

          {/* Elimina: solo admin */}
          {session.user.role === 'admin' && (
            <AdminClosureActions
              closureId={id}
              closureDate={closure.date}
              closureStatus={closure.status}
            />
          )}
        </div>
      </div>

      {/* Validazione */}
      {canValidate && (
        <ValidateActions closureId={id} />
      )}

      {/* Rifiuto precedente */}
      {closure.rejectionNotes && closure.status === 'DRAFT' && (
        <Card className="border-destructive">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-destructive flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              Chiusura rifiutata
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{closure.rejectionNotes}</p>
          </CardContent>
        </Card>
      )}

      {/* Riepilogo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{formatCurrency(grossTotal)}</div>
            <p className="text-sm text-muted-foreground">Totale Lordo</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-muted-foreground" />
              <span className="text-2xl font-bold">{formatCurrency(cashTotal)}</span>
            </div>
            <p className="text-sm text-muted-foreground">Contanti</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <span className="text-2xl font-bold">{formatCurrency(posTotal)}</span>
            </div>
            <p className="text-sm text-muted-foreground">POS</p>
          </CardContent>
        </Card>
        <Card className={hasSignificantDifference ? 'border-destructive' : ''}>
          <CardContent className="pt-6">
            <div
              className={`text-2xl font-bold ${
                hasSignificantDifference ? 'text-destructive' : ''
              }`}
            >
              {cashDifference >= 0 ? '+' : ''}
              {formatCurrency(cashDifference)}
            </div>
            <p className="text-sm text-muted-foreground">Differenza Cassa</p>
          </CardContent>
        </Card>
      </div>

      {/* Info giornata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Informazioni Giornata
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Evento:</span>{' '}
            {closure.isEvent ? (
              <Badge variant="secondary">{closure.eventName || 'Sì'}</Badge>
            ) : (
              'No'
            )}
          </div>
          <div className="flex items-center gap-2">
            <CloudSun className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Meteo:</span>
            {closure.weatherMorning || closure.weatherAfternoon || closure.weatherEvening
              ? `${getWeatherEmoji(closure.weatherMorning) || '-'} / ${getWeatherEmoji(closure.weatherAfternoon) || '-'} / ${getWeatherEmoji(closure.weatherEvening) || '-'}`
              : '-'}
          </div>
        </CardContent>
      </Card>

      {/* Postazioni - mostra solo quelle con movimenti */}
      {(() => {
        const activeStations = closure.stations.filter(
          (s) => Number(s.totalAmount || 0) > 0
        )
        return activeStations.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Postazioni Cassa ({activeStations.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {activeStations.map((station) => {
                  const counted = calculateCashCounted(station.cashCount)
                  const diff = counted - Number(station.cashAmount || 0)
                  const hasDiff =
                    counted > 0 && Math.abs(diff) > CASH_DIFFERENCE_THRESHOLD

                  return (
                    <div
                      key={station.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div>
                        <span className="font-medium">{station.name}</span>
                        {hasDiff && (
                          <Badge variant="destructive" className="ml-2 text-xs">
                            Diff: {diff >= 0 ? '+' : ''}
                            {formatCurrency(diff)}
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-6 text-sm">
                        <span>
                          <span className="text-muted-foreground">Contanti:</span>{' '}
                          <span className="font-mono">
                            {formatCurrency(Number(station.cashAmount))}
                          </span>
                        </span>
                        <span>
                          <span className="text-muted-foreground">POS:</span>{' '}
                          <span className="font-mono">
                            {formatCurrency(Number(station.posAmount))}
                          </span>
                        </span>
                        <span className="font-semibold">
                          {formatCurrency(Number(station.totalAmount))}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        ) : null
      })()}

      {/* Uscite */}
      {closure.expenses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Uscite ({closure.expenses.length}) - {formatCurrency(expensesTotal)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {closure.expenses.map((expense) => (
                <div
                  key={expense.id}
                  className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm"
                >
                  <div>
                    <span className="font-medium">{expense.payee}</span>
                    {expense.description && (
                      <span className="text-muted-foreground ml-2">
                        - {expense.description}
                      </span>
                    )}
                  </div>
                  <span className="font-mono">
                    {formatCurrency(Number(expense.amount))}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Presenze */}
      {closure.attendance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Presenze Staff ({closure.attendance.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {closure.attendance.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm"
                >
                  <div>
                    <span className="font-medium">
                      {att.user.firstName} {att.user.lastName}
                    </span>
                    <Badge variant="outline" className="ml-2">
                      {att.statusCode || 'P'}
                    </Badge>
                  </div>
                  <span>{Number(att.hours || 0)}h</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Note */}
      {closure.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Note</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{closure.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
            <div>
              <span className="block text-xs uppercase tracking-wide">Creata</span>
              <span>
                {format(new Date(closure.createdAt), 'd/M/yyyy HH:mm')}
              </span>
            </div>
            {closure.submittedBy && (
              <div>
                <span className="block text-xs uppercase tracking-wide">
                  Inviata da
                </span>
                <span>
                  {closure.submittedBy.firstName} {closure.submittedBy.lastName}
                </span>
                {closure.submittedAt && (
                  <span className="block text-xs">
                    {format(new Date(closure.submittedAt), 'd/M/yyyy HH:mm')}
                  </span>
                )}
              </div>
            )}
            {closure.validatedBy && (
              <div>
                <span className="block text-xs uppercase tracking-wide">
                  Validata da
                </span>
                <span>
                  {closure.validatedBy.firstName} {closure.validatedBy.lastName}
                </span>
                {closure.validatedAt && (
                  <span className="block text-xs">
                    {format(new Date(closure.validatedAt), 'd/M/yyyy HH:mm')}
                  </span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
