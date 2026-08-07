import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getVenueId } from '@/lib/venue'
import { saldiAlGiorno } from '@/lib/saldi'
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

  // I saldi del primo render vengono dalla stessa funzione che risponde a
  // `/api/prima-nota/saldi`, così le card nascono già col numero giusto. Prima
  // si leggeva `register_balances`, tabella che nessun codice popola: le card
  // partivano vuote a ogni caricamento.
  const saldi = await saldiAlGiorno(venueId)

  return (
    <PrimaNotaProvider
      venueId={venueId}
      isAdmin={isAdmin}
      cashBalance={saldi.registers.CASH}
      bankBalance={saldi.registers.BANK}
    >
      <div className="space-y-6">
        {/* 3 box compatti */}
        <RegisterBalanceCards
          cashRegister={saldi.registers.CASH}
          bankRegister={saldi.registers.BANK}
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
