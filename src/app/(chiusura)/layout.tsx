import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/app-shell'

/**
 * La chiusura cassa la compila chi lavora in sala a fine turno: è l'unica
 * sezione del gestionale aperta anche allo staff, e per questo sta in un
 * gruppo di rotte suo invece che dentro `(dashboard)`.
 *
 * Non è una separazione estetica. Un layout non viene rieseguito quando si
 * naviga fra rotte che lo condividono, quindi un controllo di ruolo dentro il
 * layout di `(dashboard)` non poteva fermare lo staff che da qui apriva la
 * prima nota. Tenendo la chiusura fuori da quel gruppo, il layout della
 * dashboard non è mai nell'albero del router dello staff: ogni navigazione
 * verso una rotta riservata lo monta da zero, e il rimando al portale scatta.
 *
 * La validazione, che genera le scritture contabili, resta comunque riservata
 * ad admin e manager: la nega `/api/chiusure/[id]/validate`.
 */
export default async function ChiusuraLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return <AppShell role={session.user.role}>{children}</AppShell>
}
