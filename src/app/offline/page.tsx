'use client'

import { WifiOff, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-4 bg-muted rounded-full w-fit">
            <WifiOff className="h-12 w-12 text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl">Sei offline</CardTitle>
          <CardDescription>
            Non sei connesso a internet. Alcune funzionalita potrebbero non essere disponibili.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-2">Mentre sei offline puoi:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Visualizzare le chiusure cassa salvate</li>
              <li>Compilare nuove chiusure (verranno sincronizzate)</li>
              <li>Consultare i dati gia scaricati</li>
            </ul>
          </div>
          <Button
            className="w-full"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Riprova connessione
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            La pagina si riconnettera automaticamente quando tornerai online.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
