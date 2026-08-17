'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/formatters'

interface ChartDataPoint {
  date: string
  saldo: number
  entrata: number
  uscita: number
}

interface CashFlowChartProps {
  data: ChartDataPoint[]
  sogliaMinima?: number
}

/**
 * L'importo abbreviato per l'asse verticale: «23,9 mila €».
 *
 * Per esteso non ci sta: recharts riserva ai tick una banda fissa, e
 * «23.900,00 €» veniva tagliato a sinistra lasciando in colonna una fila di
 * «00,00 €» tutti uguali, cioè nessuna informazione su quanto valga la curva.
 */
function importoBreve(valore: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(valore)
}

export function CashFlowChart({ data, sogliaMinima }: CashFlowChartProps) {
  const today = new Date().toISOString().split('T')[0]
  // Calcola il minimo reale della serie, senza pavimento: serve per decidere se le bande vanno renderizzate
  const minimoReale = data.length > 0 ? Math.min(...data.map(d => d.saldo)) : 0

  return (
    <Card>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => format(parseISO(value), 'dd/MMM')}
            />
            <YAxis width={72} tickFormatter={importoBreve} />
            <Tooltip
              contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
              itemStyle={{ color: '#fff' }}
              formatter={(value, name, props) => {
                if (props.payload) {
                  return `${format(parseISO(props.payload.date), 'dd MMM yyyy')}
                    \nSaldo: ${formatCurrency(props.payload.saldo)}
                    \nEntrate: ${formatCurrency(props.payload.entrata)}
                    \nUscite: ${formatCurrency(props.payload.uscita)}`
                }
                return ''
              }}
            />
            {/* Banda della zona negativa: rossa sotto lo zero */}
            {data.length > 0 && minimoReale < 0 && (
              <ReferenceArea
                y1={minimoReale}
                y2={0}
                fill="#ef4444"
                fillOpacity={0.08}
                ifOverflow="extendDomain"
              />
            )}
            {/* Banda della soglia minima: ambra dalla soglia allo zero */}
            {sogliaMinima && data.length > 0 && minimoReale < sogliaMinima && (
              <ReferenceArea
                y1={0}
                y2={sogliaMinima}
                fill="#f59e0b"
                fillOpacity={0.06}
                ifOverflow="extendDomain"
              />
            )}
            <Area
              type="monotone"
              dataKey="saldo"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.3}
            />
            <ReferenceLine
              x={today}
              stroke="rgba(0,0,0,0.5)"
              strokeDasharray="3 3"
              label="Oggi"
            />
            {sogliaMinima && (
              <ReferenceLine
                y={sogliaMinima}
                stroke="#ef4444"
                label={`Soglia minima: ${formatCurrency(sogliaMinima)}`}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
