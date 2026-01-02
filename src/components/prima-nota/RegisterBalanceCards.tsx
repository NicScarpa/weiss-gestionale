'use client'

import { Wallet, Building2, TrendingUp, TrendingDown, ArrowRightLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/constants'

interface RegisterData {
  openingBalance: number
  totalDebits: number
  totalCredits: number
  closingBalance: number
  lastUpdated?: Date | string
}

interface RegisterBalanceCardsProps {
  cashRegister?: RegisterData
  bankRegister?: RegisterData
  isLoading?: boolean
  className?: string
}

export function RegisterBalanceCards({
  cashRegister,
  bankRegister,
  isLoading = false,
  className,
}: RegisterBalanceCardsProps) {
  const totalAvailable =
    (cashRegister?.closingBalance || 0) + (bankRegister?.closingBalance || 0)

  if (isLoading) {
    return (
      <div className={cn('grid grid-cols-1 md:grid-cols-3 gap-4', className)}>
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-4 bg-muted rounded w-20" />
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted rounded w-32" />
              <div className="mt-2 h-3 bg-muted rounded w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-3 gap-4', className)}>
      {/* Card Cassa */}
      <RegisterCard
        title="Saldo Cassa"
        icon={<Wallet className="h-5 w-5" />}
        iconColor="text-green-600"
        bgColor="bg-green-50"
        data={cashRegister}
      />

      {/* Card Banca */}
      <RegisterCard
        title="Saldo Banca"
        icon={<Building2 className="h-5 w-5" />}
        iconColor="text-blue-600"
        bgColor="bg-blue-50"
        data={bankRegister}
      />

      {/* Card Totale */}
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <ArrowRightLeft className="h-5 w-5 text-primary" />
            </div>
            Totale Disponibile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              'text-3xl font-bold font-mono tracking-tight',
              totalAvailable >= 0 ? 'text-primary' : 'text-destructive'
            )}
          >
            {formatCurrency(totalAvailable)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Cassa + Banca
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

interface RegisterCardProps {
  title: string
  icon: React.ReactNode
  iconColor: string
  bgColor: string
  data?: RegisterData
}

function RegisterCard({ title, icon, iconColor, bgColor, data }: RegisterCardProps) {
  const balance = data?.closingBalance || 0
  const debits = data?.totalDebits || 0
  const credits = data?.totalCredits || 0

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <div className={cn('p-1.5 rounded-lg', bgColor)}>
            <span className={iconColor}>{icon}</span>
          </div>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          className={cn(
            'text-2xl font-bold font-mono tracking-tight',
            balance >= 0 ? 'text-foreground' : 'text-destructive'
          )}
        >
          {formatCurrency(balance)}
        </div>

        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-green-500" />
            <span className="text-muted-foreground">Dare:</span>
            <span className="font-mono font-medium text-green-600">
              {formatCurrency(debits)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingDown className="h-3.5 w-3.5 text-red-500" />
            <span className="text-muted-foreground">Avere:</span>
            <span className="font-mono font-medium text-red-600">
              {formatCurrency(credits)}
            </span>
          </div>
        </div>

        {data?.lastUpdated && (
          <p className="text-xs text-muted-foreground">
            Ultimo aggiornamento:{' '}
            {new Date(data.lastUpdated).toLocaleDateString('it-IT', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// Componente per singolo registro (es. nella pagina dedicata)
interface SingleRegisterCardProps {
  registerType: 'CASH' | 'BANK'
  data?: RegisterData
  isLoading?: boolean
  className?: string
}

export function SingleRegisterCard({
  registerType,
  data,
  isLoading = false,
  className,
}: SingleRegisterCardProps) {
  const config = {
    CASH: {
      title: 'Saldo Cassa',
      icon: <Wallet className="h-6 w-6" />,
      iconColor: 'text-green-600',
      bgColor: 'bg-green-50',
      gradientFrom: 'from-green-500/10',
      gradientTo: 'to-green-600/5',
    },
    BANK: {
      title: 'Saldo Banca',
      icon: <Building2 className="h-6 w-6" />,
      iconColor: 'text-blue-600',
      bgColor: 'bg-blue-50',
      gradientFrom: 'from-blue-500/10',
      gradientTo: 'to-blue-600/5',
    },
  }[registerType]

  if (isLoading) {
    return (
      <Card className={cn('animate-pulse', className)}>
        <CardContent className="py-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-muted rounded-lg" />
            <div className="flex-1">
              <div className="h-4 bg-muted rounded w-20 mb-2" />
              <div className="h-8 bg-muted rounded w-40" />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const balance = data?.closingBalance || 0

  return (
    <Card
      className={cn(
        'bg-gradient-to-br',
        config.gradientFrom,
        config.gradientTo,
        className
      )}
    >
      <CardContent className="py-6">
        <div className="flex items-center gap-4">
          <div className={cn('p-3 rounded-xl', config.bgColor)}>
            <span className={config.iconColor}>{config.icon}</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">
              {config.title}
            </p>
            <p
              className={cn(
                'text-3xl font-bold font-mono tracking-tight',
                balance >= 0 ? 'text-foreground' : 'text-destructive'
              )}
            >
              {formatCurrency(balance)}
            </p>
          </div>
          <div className="text-right space-y-1">
            <div className="flex items-center justify-end gap-1.5 text-sm">
              <TrendingUp className="h-3.5 w-3.5 text-green-500" />
              <span className="font-mono text-green-600">
                +{formatCurrency(data?.totalDebits || 0)}
              </span>
            </div>
            <div className="flex items-center justify-end gap-1.5 text-sm">
              <TrendingDown className="h-3.5 w-3.5 text-red-500" />
              <span className="font-mono text-red-600">
                -{formatCurrency(data?.totalCredits || 0)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
