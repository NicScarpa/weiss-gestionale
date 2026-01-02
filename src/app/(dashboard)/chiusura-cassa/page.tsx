import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'

export const metadata = {
  title: 'Chiusura Cassa'
}

export default function ChiusuraCassaPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chiusura Cassa</h1>
          <p className="text-muted-foreground">
            Gestione delle chiusure cassa giornaliere
          </p>
        </div>
        <Button asChild>
          <Link href="/chiusura-cassa/nuova">
            <Plus className="mr-2 h-4 w-4" />
            Nuova Chiusura
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Storico Chiusure</CardTitle>
          <CardDescription>
            Lista delle chiusure cassa registrate
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            Nessuna chiusura cassa registrata
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
