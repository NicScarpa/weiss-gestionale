'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronLeft, ChevronRight, Clock, CalendarDays, AlertTriangle, TrendingUp } from 'lucide-react'
import { format, addMonths, subMonths } from 'date-fns'
import { it } from 'date-fns/locale'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface StatisticsTabProps {
  userId: string
}

export function StatisticsTab({ userId }: StatisticsTabProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const monthParam = format(currentMonth, 'yyyy-MM')

  const { data, isLoading } = useQuery({
    queryKey: ['staff-statistics', userId, monthParam],
    queryFn: async () => {
      const res = await fetch(`/api/staff/${userId}/statistics?month=${monthParam}`)
      if (!res.ok) return null
      return res.json()
    },
  })

  const kpi = data?.kpi || {
    totalHours: 0,
    avgHoursPerDay: 0,
    daysWorked: 0,
    lateArrivals: 0,
    absences: 0,
    overtimeHours: 0,
  }

  const weeklyData = data?.weeklyBreakdown || []

  const kpiCards = [
    { label: 'Ore totali', value: `${Number(kpi.totalHours).toFixed(1)}h`, icon: Clock },
    { label: 'Media ore/giorno', value: `${Number(kpi.avgHoursPerDay).toFixed(1)}h`, icon: TrendingUp },
    { label: 'Giorni lavorati', value: kpi.daysWorked, icon: CalendarDays },
    { label: 'Ritardi', value: kpi.lateArrivals, icon: AlertTriangle },
    { label: 'Assenze', value: kpi.absences, icon: CalendarDays },
    { label: 'Straordinari', value: `${Number(kpi.overtimeHours).toFixed(1)}h`, icon: Clock },
  ]

  return (
    <div className="space-y-6">
      {/* Month nav */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="icon" onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium w-40 text-center capitalize">
          {format(currentMonth, 'MMMM yyyy', { locale: it })}
        </span>
        <Button variant="outline" size="icon" onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {kpiCards.map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <kpi.icon className="h-4 w-4" />
                  <span className="text-xs font-medium">{kpi.label}</span>
                </div>
                <p className="text-2xl font-bold">{kpi.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Bar Chart */}
      {!isLoading && weeklyData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ore lavorate per settimana</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="week" tick={{ fontSize: 12 }} tickFormatter={(v) => `Sett. ${v}`} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}h`} />
                  <Tooltip formatter={(value: number) => [`${value.toFixed(1)}h`, 'Ore']} />
                  <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
