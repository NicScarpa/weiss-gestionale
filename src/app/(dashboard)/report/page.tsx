import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata = {
  title: 'Report'
}

export default function ReportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Report</h1>
        <p className="text-muted-foreground">
          Analisi e reportistica
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="cursor-pointer hover:bg-slate-50 transition-colors">
          <CardHeader>
            <CardTitle>Incassi Giornalieri</CardTitle>
            <CardDescription>
              Report degli incassi giornalieri per periodo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              Visualizza gli incassi giornalieri con possibilità di filtro per date
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-slate-50 transition-colors">
          <CardHeader>
            <CardTitle>Confronto Annuale</CardTitle>
            <CardDescription>
              Confronto year-over-year degli incassi
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              Analizza le performance rispetto all&apos;anno precedente
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-slate-50 transition-colors">
          <CardHeader>
            <CardTitle>Riepilogo Mensile</CardTitle>
            <CardDescription>
              Riepilogo delle operazioni mensili
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              Visualizza il totale delle entrate e uscite per mese
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-slate-50 transition-colors">
          <CardHeader>
            <CardTitle>Analisi Costi</CardTitle>
            <CardDescription>
              Analisi delle spese e dei costi
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              Monitora le spese per categoria e fornitore
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
