"use client"

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { formatCurrency } from '@/lib/utils'

interface ChartDataPoint {
  date: string
  saldo: number
  uscite: number
  entrate: number
  usciteRicorrenti: number
  entrateRicorrenti: number
}

interface SaldoScalareChartProps {
  data: ChartDataPoint[]
  showZeroLine?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.[0]) return null

  const data = payload[0].payload as ChartDataPoint
  const dateFormatted = format(parseISO(data.date), 'd MMMM', { locale: it })

  return (
    <div className="rounded-lg border bg-background p-3 shadow-md">
      <p className="text-sm font-semibold mb-2">{dateFormatted}</p>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Saldo</span>
          <span className="font-medium">{formatCurrency(data.saldo)}</span>
        </div>
        {data.uscite > 0 && (
          <>
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground">Uscite</span>
              <span className="font-medium text-rose-600">{formatCurrency(data.uscite)}</span>
            </div>
            {data.usciteRicorrenti > 0 && (
              <div className="flex justify-between gap-6 pl-2">
                <span className="text-xs text-muted-foreground">di cui ricorrenti</span>
                <span className="text-xs">{formatCurrency(data.usciteRicorrenti)}</span>
              </div>
            )}
          </>
        )}
        {data.entrate > 0 && (
          <>
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground">Entrate</span>
              <span className="font-medium text-emerald-600">{formatCurrency(data.entrate)}</span>
            </div>
            {data.entrateRicorrenti > 0 && (
              <div className="flex justify-between gap-6 pl-2">
                <span className="text-xs text-muted-foreground">di cui ricorrenti</span>
                <span className="text-xs">{formatCurrency(data.entrateRicorrenti)}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function SaldoScalareChart({ data, showZeroLine = false }: SaldoScalareChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[250px] text-muted-foreground">
        Nessun dato disponibile
      </div>
    )
  }

  // Determine if we need to show negative area
  const minValue = Math.min(...data.map(d => d.saldo))
  const maxValue = Math.max(...data.map(d => d.saldo))
  const yMin = Math.min(minValue * 1.1, 0)
  const yMax = maxValue * 1.1

  // Format Y axis ticks
  const formatYAxis = (value: number) => {
    if (Math.abs(value) >= 1000) {
      return `${(value / 1000).toFixed(0)}k €`
    }
    return `${value.toFixed(0)} €`
  }

  // Format X axis - show only some labels
  const tickInterval = Math.max(1, Math.floor(data.length / 8))

  return (
    <div className="h-[250px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <defs>
            <linearGradient id="saldoGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickFormatter={(value) => {
              try {
                return format(parseISO(value), 'd MMM', { locale: it })
              } catch {
                return value
              }
            }}
            interval={tickInterval}
            axisLine={{ stroke: '#e2e8f0' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickFormatter={formatYAxis}
            axisLine={false}
            tickLine={false}
            domain={[yMin, yMax]}
          />
          <Tooltip content={<CustomTooltip />} />
          {showZeroLine && (
            <ReferenceLine
              y={0}
              stroke="#94a3b8"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
          )}
          <Area
            type="monotone"
            dataKey="saldo"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#saldoGradient)"
            dot={false}
            activeDot={{ r: 4, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
