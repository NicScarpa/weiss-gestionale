import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'
import { RegisterBalanceCards } from '@/components/prima-nota/RegisterBalanceCards'
import { PrimaNotaTabNav } from '@/components/prima-nota/PrimaNotaTabNav'
import { AccountSelectorToggle } from '@/components/prima-nota/AccountSelectorToggle'
import { PrimaNotaProvider } from '@/components/prima-nota/PrimaNotaContext'

export const metadata = {
  title: 'Prima Nota',
}

export default async function PrimaNotaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  const venueId = await getVenueId()
  const isAdmin = session.user.role === 'admin'

  // Fetch balances per RegisterBalanceCards
  const today = new Date() // Passiamo direttamente l'oggetto Date per il campo @db.Date
  const [cashBalance, bankBalance] = await Promise.all([
    prisma.registerBalance.findUnique({
      where: { venueId_registerType_date: { venueId, registerType: 'CASH', date: today } },
    }),
    prisma.registerBalance.findUnique({
      where: { venueId_registerType_date: { venueId, registerType: 'BANK', date: today } },
    }),
  ])

  // Converti Decimal in number
  const convertBalance = (balance: typeof cashBalance) => {
    if (!balance) return null
    return {
      ...balance,
      openingBalance: balance.openingBalance.toNumber(),
      totalDebits: balance.totalDebits.toNumber(),
      totalCredits: balance.totalCredits.toNumber(),
      closingBalance: balance.closingBalance.toNumber(),
    }
  }

  const convertedCashBalance = convertBalance(cashBalance)
  const convertedBankBalance = convertBalance(bankBalance)

  return (
    <PrimaNotaProvider
      venueId={venueId}
      isAdmin={isAdmin}
      cashBalance={convertedCashBalance}
      bankBalance={convertedBankBalance}
    >
      <div className="space-y-6">
        {/* 3 box compatti */}
        <RegisterBalanceCards
          cashRegister={convertedCashBalance}
          bankRegister={convertedBankBalance}
          className="mb-6"
        />

        {/* Toggle registri */}
        <div className="flex justify-center mb-4">
          <AccountSelectorToggle />
        </div>

        {/* Tab pill */}
        <PrimaNotaTabNav />

        {/* Contenuto pagina */}
        {children}
      </div>
    </PrimaNotaProvider>
  )
}
