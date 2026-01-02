import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronRight, BarChart3, TrendingUp, Calendar, PieChart } from 'lucide-react'

export const metadata = {
  title: 'Report'
}

const reports = [
  {
    title: 'Incassi Giornalieri',
    description: 'Report degli incassi giornalieri per periodo',
    details: 'Visualizza gli incassi giornalieri con possibilità di filtro per date',
    href: '/report/incassi-giornalieri',
    icon: BarChart3,
    available: true,
  },
  {
    title: 'Confronto Annuale',
    description: 'Confronto year-over-year degli incassi',
    details: 'Analizza le performance rispetto all\'anno precedente',
    href: '/report/confronto-annuale',
    icon: TrendingUp,
    available: true,
  },
  {
    title: 'Riepilogo Mensile',
    description: 'Riepilogo delle operazioni mensili',
    details: 'Visualizza il totale delle entrate e uscite per mese',
    href: '/report/riepilogo-mensile',
    icon: Calendar,
    available: true,
  },
  {
    title: 'Analisi Costi',
    description: 'Analisi delle spese e dei costi',
    details: 'Monitora le spese per categoria e fornitore',
    href: '/report/analisi-costi',
    icon: PieChart,
    available: false,
  },
]

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
        {reports.map((report) => {
          const Icon = report.icon

          if (!report.available) {
            return (
              <Card key={report.title} className="opacity-60">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <CardTitle>{report.title}</CardTitle>
                  </div>
                  <CardDescription>
                    {report.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    {report.details}
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    Prossimamente disponibile
                  </div>
                </CardContent>
              </Card>
            )
          }

          return (
            <Link key={report.title} href={report.href}>
              <Card className="cursor-pointer hover:bg-slate-50 transition-colors h-full">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary" />
                      <CardTitle>{report.title}</CardTitle>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <CardDescription>
                    {report.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    {report.details}
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
