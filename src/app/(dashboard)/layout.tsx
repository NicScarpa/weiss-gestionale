import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/app-shell'

/**
 * La dashboard è riservata ad admin e manager: allo staff non serve nessun
 * elenco di eccezioni, va al portale e basta.
 *
 * Prima qui c'era un elenco (`STAFF_ALLOWED_PATHS = ['/chiusura-cassa']`)
 * confrontato con l'header `x-pathname`, e non teneva: per la *partial
 * rendering* di Next un layout non viene rieseguito quando si naviga fra due
 * rotte che lo condividono (vedi «Layouts and auth checks» nella guida
 * all'autenticazione di Next 16). Dalla chiusura cassa — che stava dentro
 * questo gruppo — un tocco sul menu portava lo staff su `/prima-nota/movimenti`
 * senza che questo controllo venisse mai eseguito: la pagina si apriva davvero,
 * con i dati caricati dal server.
 *
 * Ora la chiusura cassa vive nel gruppo `(chiusura)`, che ha il suo layout:
 * lo staff non ha mai questo layout nell'albero del router, quindi qualunque
 * navigazione verso la dashboard lo monta da zero e il controllo scatta. Se
 * domani una sezione dovrà essere aperta allo staff, va aggiunta a
 * `(chiusura)`, non qui — il test in `src/app/__tests__/accesso-staff.test.ts`
 * lo verifica.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  // Se l'utente non è autenticato, reindirizza al login
  if (!session?.user) {
    redirect('/login')
  }

  if (session.user.role === 'staff') {
    redirect('/portale')
  }

  return <AppShell role={session.user.role}>{children}</AppShell>
}
