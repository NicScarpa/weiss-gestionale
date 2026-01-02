import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export const metadata = {
  title: 'Prima Nota'
}

export default function PrimaNotaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Prima Nota</h1>
        <p className="text-muted-foreground">
          Registro dei movimenti contabili
        </p>
      </div>

      <Tabs defaultValue="cassa" className="space-y-4">
        <TabsList>
          <TabsTrigger value="cassa">Prima Nota Cassa</TabsTrigger>
          <TabsTrigger value="banca">Prima Nota Banca</TabsTrigger>
        </TabsList>

        <TabsContent value="cassa">
          <Card>
            <CardHeader>
              <CardTitle>Movimenti Cassa</CardTitle>
              <CardDescription>
                Registro dei movimenti di cassa
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                Nessun movimento di cassa registrato
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="banca">
          <Card>
            <CardHeader>
              <CardTitle>Movimenti Banca</CardTitle>
              <CardDescription>
                Registro dei movimenti bancari
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                Nessun movimento bancario registrato
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
