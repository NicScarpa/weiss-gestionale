"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

interface AgingBand {
  fascia: string
  conteggio: number
  importo_totale: number
  importo_residuo: number
}

interface AgingChartProps {
  attive: AgingBand[]
  passive: AgingBand[]
}

export function AgingChart({ attive, passive }: AgingChartProps) {
  // Merge fasce
  const data = attive.map((a, i) => ({
    fascia: a.fascia,
    attive: a.importo_residuo,
    passive: passive[i]?.importo_residuo || 0,
  }))

  const formatYAxis = (value: number) => {
    if (value >= 1000) return `${(value / 1000).toFixed(0)}k`
    return value.toString()
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="fascia"
          tick={{ fontSize: 11 }}
          angle={-20}
          textAnchor="end"
          height={50}
        />
        <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value: number) => formatCurrency(value)}
          labelStyle={{ fontWeight: 'bold' }}
        />
        <Legend />
        <Bar
          dataKey="attive"
          name="Da incassare"
          fill="#22c55e"
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey="passive"
          name="Da pagare"
          fill="#ef4444"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
