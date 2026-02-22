'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { format, startOfMonth, endOfMonth, addMonths, subMonths, eachDayOfInterval, isWeekend } from 'date-fns'
import { it } from 'date-fns/locale'

interface AttendanceTabProps {
  userId: string
  isAdmin: boolean
}

interface AttendanceRecord {
  id: string
  punchType: 'IN' | 'OUT' | 'BREAK_START' | 'BREAK_END'
  punchedAt: string
  isManual: boolean
  notes?: string
}

export function AttendanceTab({ userId }: AttendanceTabProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())

  const from = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
  const to = format(endOfMonth(currentMonth), 'yyyy-MM-dd')

  const { data, isLoading } = useQuery({
    queryKey: ['attendance-records', userId, from, to],
    queryFn: async () => {
      const res = await fetch(`/api/attendance/records?userId=${userId}&from=${from}&to=${to}`)
      if (!res.ok) return { records: [] }
      return res.json()
    },
  })

  const records: AttendanceRecord[] = data?.records || []

  // Group records by date
  const recordsByDate = records.reduce((acc: Record<string, AttendanceRecord[]>, r) => {
    const date = r.punchedAt.split('T')[0]
    if (!acc[date]) acc[date] = []
    acc[date].push(r)
    return acc
  }, {})

  // Calculate hours for a day from IN/OUT pairs
  const calculateHours = (dayRecords: AttendanceRecord[]): number => {
    const sorted = dayRecords
      .filter(r => r.punchType === 'IN' || r.punchType === 'OUT')
      .sort((a, b) => new Date(a.punchedAt).getTime() - new Date(b.punchedAt).getTime())

    let totalMs = 0
    for (let i = 0; i < sorted.length - 1; i += 2) {
      if (sorted[i].punchType === 'IN' && sorted[i + 1]?.punchType === 'OUT') {
        totalMs += new Date(sorted[i + 1].punchedAt).getTime() - new Date(sorted[i].punchedAt).getTime()
      }
    }
    return totalMs / (1000 * 60 * 60)
  }

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  })

  const totalHours = Object.values(recordsByDate).reduce((sum, recs) => sum + calculateHours(recs), 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Totale: <strong>{totalHours.toFixed(1)}h</strong>
          </span>
        </div>
        <div className="flex items-center gap-2">
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
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {days.map(day => {
                const dateKey = format(day, 'yyyy-MM-dd')
                const dayRecords = recordsByDate[dateKey] || []
                const hours = calculateHours(dayRecords)
                const hasRecords = dayRecords.length > 0

                return (
                  <div
                    key={dateKey}
                    className={`flex items-center px-4 py-3 text-sm ${
                      !hasRecords ? 'bg-muted/30 text-muted-foreground' : ''
                    } ${isWeekend(day) ? 'bg-muted/50' : ''}`}
                  >
                    <div className="w-32 font-medium capitalize">
                      {format(day, 'EEE dd MMM', { locale: it })}
                    </div>
                    <div className="w-20 text-right font-mono">
                      {hours > 0 ? `${hours.toFixed(1)}h` : '-'}
                    </div>
                    <div className="flex-1 ml-4 flex gap-1">
                      {dayRecords
                        .filter(r => r.punchType === 'IN' || r.punchType === 'OUT')
                        .map(r => (
                          <span
                            key={r.id}
                            className={`text-xs px-1.5 py-0.5 rounded ${
                              r.punchType === 'IN'
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            }`}
                          >
                            {r.punchType === 'IN' ? '▶' : '■'} {format(new Date(r.punchedAt), 'HH:mm')}
                          </span>
                        ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
