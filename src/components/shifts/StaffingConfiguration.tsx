'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Users } from 'lucide-react'
import { format, eachDayOfInterval } from 'date-fns'
import { it } from 'date-fns/locale'

interface ShiftDefinition {
  id: string
  name: string
  code: string
  minStaff: number
}

interface StaffingConfigurationProps {
  startDate: Date
  endDate: Date
  shiftDefinitions: ShiftDefinition[]
  onRequirementsChange: (reqs: Record<string, number>) => void
  initialRequirements?: Record<string, number>
}

export function StaffingConfiguration({
  startDate,
  endDate,
  shiftDefinitions,
  onRequirementsChange,
  initialRequirements = {},
}: StaffingConfigurationProps) {
  const [requirements, setRequirements] = useState<Record<string, number>>(initialRequirements)

  // Generate dates
  const dates = eachDayOfInterval({ start: startDate, end: endDate })

  const handleRequirementChange = (date: Date, shiftId: string, value: string) => {
    const numValue = parseInt(value)
    if (isNaN(numValue) || numValue < 0) return

    const key = `${format(date, 'yyyy-MM-dd')}_${shiftId}`
    const newReqs = { ...requirements, [key]: numValue }
    setRequirements(newReqs)
    onRequirementsChange(newReqs)
  }

  const getRequirement = (date: Date, shiftId: string, defaultVal: number) => {
    const key = `${format(date, 'yyyy-MM-dd')}_${shiftId}`
    return requirements[key] !== undefined ? requirements[key] : defaultVal
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5" />
          Fabbisogno Staff
        </CardTitle>
        <CardDescription>
          Personalizza il numero di persone richieste per ogni turno giornaliero
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left font-medium p-2 w-[150px]">Giorno</th>
                {shiftDefinitions.map(shift => (
                  <th key={shift.id} className="text-center font-medium p-2">
                    {shift.name}
                    <span className="block text-xs text-muted-foreground font-normal">
                      (Default: {shift.minStaff})
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map(date => (
                <tr key={date.toString()} className="border-t">
                  <td className="p-2 font-medium capitalize">
                    {format(date, 'EEEE d', { locale: it })}
                  </td>
                  {shiftDefinitions.map(shift => (
                    <td key={shift.id} className="p-2">
                      <div className="flex justify-center">
                        <Input
                          type="number"
                          min="0"
                          className="w-16 text-center h-8"
                          value={getRequirement(date, shift.id, shift.minStaff)}
                          onChange={(e) => handleRequirementChange(date, shift.id, e.target.value)}
                        />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
