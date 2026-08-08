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
          {/*
            Un <h1> vero dentro `CardTitle`, che è un <div>: questa pagina
            compare quando tutto il resto non c'è, ed è l'unico momento in cui
            il titolo deve arrivare anche a chi la pagina non la vede.
          */}
          <CardTitle className="text-2xl">
            <h1>Sei offline</h1>
          </CardTitle>
          <CardDescription>
            Non sei connesso a internet. Alcune funzionalita potrebbero non essere disponibili.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/*
            Questo elenco è una promessa: va tenuto uguale a ciò che il codice
            fa davvero. Prima diceva anche «visualizzare le chiusure salvate»,
            e non era vero — le pagine che le elencano chiedono i dati al
            server, che senza rete non risponde.
          */}
          <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-2">Mentre sei offline puoi:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Compilare una nuova chiusura e salvarla: resta su questo dispositivo e parte da sola quando torna la rete</li>
              <li>Riaprire le pagine che hai gia visitato da questo dispositivo</li>
            </ul>
            <p className="mt-3">
              Il resto — elenchi, ricerche, modifiche a chiusure gia salvate — ha bisogno della connessione.
            </p>
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
