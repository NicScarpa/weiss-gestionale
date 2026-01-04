'use client'

import { Card, CardContent } from '@/components/ui/card'
import {
  Users,
  LogIn,
  Coffee,
  Home,
  AlertTriangle,
  Clock,
  Calendar,
} from 'lucide-react'

interface AttendanceStatsProps {
  stats: {
    totalScheduled: number
    clockedIn: number
    onBreak: number
    clockedOut: number
    absent: number
    notYetStarted: number
    withAnomalies: number
    totalScheduledHours: number
    totalWorkedHours: number
  }
}

export function AttendanceStats({ stats }: AttendanceStatsProps) {
  const statCards = [
    {
      label: 'Schedulati',
      value: stats.totalScheduled,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'In servizio',
      value: stats.clockedIn,
      icon: LogIn,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      label: 'In pausa',
      value: stats.onBreak,
      icon: Coffee,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
    },
    {
      label: 'Usciti',
      value: stats.clockedOut,
      icon: Home,
      color: 'text-gray-600',
      bgColor: 'bg-gray-50',
    },
    {
      label: 'Non iniziati',
      value: stats.notYetStarted,
      icon: Calendar,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      label: 'Assenti',
      value: stats.absent,
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
  ]

  return (
    <div className="space-y-4">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Hours Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalScheduledHours}h</p>
                <p className="text-xs text-muted-foreground">Ore Schedulate</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-50">
                <Clock className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalWorkedHours}h</p>
                <p className="text-xs text-muted-foreground">Ore Lavorate</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg ${stats.withAnomalies > 0 ? 'bg-yellow-50' : 'bg-gray-50'}`}
              >
                <AlertTriangle
                  className={`h-5 w-5 ${stats.withAnomalies > 0 ? 'text-yellow-600' : 'text-gray-400'}`}
                />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.withAnomalies}</p>
                <p className="text-xs text-muted-foreground">Con Anomalie</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
