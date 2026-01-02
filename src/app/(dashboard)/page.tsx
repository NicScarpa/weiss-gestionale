import { auth } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Receipt, BookOpen, TrendingUp, Users } from 'lucide-react'

export default async function DashboardPage() {
  const session = await auth()

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Benvenuto, {session?.user?.firstName}
        </h1>
        <p className="text-muted-foreground">
          Ecco un riepilogo delle attività di oggi
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Chiusure Oggi
            </CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">
              Nessuna chiusura registrata
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Movimenti Prima Nota
            </CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">
              Movimenti del mese corrente
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Incasso Mensile
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€ 0,00</div>
            <p className="text-xs text-muted-foreground">
              Totale incassi del mese
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Staff Attivo
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">
              Dipendenti in servizio oggi
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Azioni Rapide</CardTitle>
            <CardDescription>
              Operazioni frequenti
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <a
              href="/chiusura-cassa/nuova"
              className="block p-3 rounded-lg border hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Receipt className="h-5 w-5 text-slate-600" />
                <div>
                  <p className="font-medium">Nuova Chiusura Cassa</p>
                  <p className="text-sm text-muted-foreground">
                    Registra la chiusura giornaliera
                  </p>
                </div>
              </div>
            </a>
            <a
              href="/prima-nota"
              className="block p-3 rounded-lg border hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <BookOpen className="h-5 w-5 text-slate-600" />
                <div>
                  <p className="font-medium">Visualizza Prima Nota</p>
                  <p className="text-sm text-muted-foreground">
                    Consulta i movimenti contabili
                  </p>
                </div>
              </div>
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ultime Chiusure</CardTitle>
            <CardDescription>
              Chiusure cassa recenti
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              Nessuna chiusura registrata
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
