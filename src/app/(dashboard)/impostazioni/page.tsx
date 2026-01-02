import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export const metadata = {
  title: 'Impostazioni'
}

export default function ImpostazioniPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Impostazioni</h1>
        <p className="text-muted-foreground">
          Configurazione del sistema
        </p>
      </div>

      <Tabs defaultValue="generale" className="space-y-4">
        <TabsList>
          <TabsTrigger value="generale">Generale</TabsTrigger>
          <TabsTrigger value="utenti">Utenti</TabsTrigger>
          <TabsTrigger value="sedi">Sedi</TabsTrigger>
          <TabsTrigger value="conti">Piano Conti</TabsTrigger>
        </TabsList>

        <TabsContent value="generale">
          <Card>
            <CardHeader>
              <CardTitle>Impostazioni Generali</CardTitle>
              <CardDescription>
                Configurazioni di base del sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                Impostazioni generali non ancora implementate
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="utenti">
          <Card>
            <CardHeader>
              <CardTitle>Gestione Utenti</CardTitle>
              <CardDescription>
                Amministrazione degli account utente
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                Gestione utenti non ancora implementata
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sedi">
          <Card>
            <CardHeader>
              <CardTitle>Gestione Sedi</CardTitle>
              <CardDescription>
                Configurazione delle sedi operative
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                Gestione sedi non ancora implementata
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conti">
          <Card>
            <CardHeader>
              <CardTitle>Piano dei Conti</CardTitle>
              <CardDescription>
                Struttura del piano dei conti
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                Piano conti non ancora implementato
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
