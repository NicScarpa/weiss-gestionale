'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertTriangle, AlertCircle, Info } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

interface Warning {
  type: string
  message: string
  date?: string
  severity: 'low' | 'medium' | 'high'
  shiftDefinitionId?: string
  employeeId?: string
}

interface ScheduleWarningsProps {
  warnings: Warning[]
}

export function ScheduleWarnings({ warnings }: ScheduleWarningsProps) {
  if (warnings.length === 0) {
    return (
      <Alert className="bg-green-50 border-green-200">
        <Info className="h-4 w-4 text-green-600" />
        <AlertTitle className="text-green-700">Nessun problema rilevato</AlertTitle>
        <AlertDescription className="text-green-600">
          La pianificazione rispetta tutti i vincoli configurati.
        </AlertDescription>
      </Alert>
    )
  }

  const highSeverity = warnings.filter(w => w.severity === 'high')
  const mediumSeverity = warnings.filter(w => w.severity === 'medium')
  const lowSeverity = warnings.filter(w => w.severity === 'low')

  return (
    <div className="space-y-3">
      {highSeverity.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Problemi Critici ({highSeverity.length})</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 space-y-1">
              {highSeverity.map((warning, idx) => (
                <li key={idx} className="text-sm flex items-center gap-2">
                  <span>•</span>
                  <span>{warning.message}</span>
                  {warning.date && (
                    <span className="text-xs opacity-75">
                      ({format(new Date(warning.date), 'EEE d MMM', { locale: it })})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {mediumSeverity.length > 0 && (
        <Alert className="bg-amber-50 border-amber-200">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-700">Attenzione ({mediumSeverity.length})</AlertTitle>
          <AlertDescription className="text-amber-600">
            <ul className="mt-2 space-y-1">
              {mediumSeverity.map((warning, idx) => (
                <li key={idx} className="text-sm flex items-center gap-2">
                  <span>•</span>
                  <span>{warning.message}</span>
                  {warning.date && (
                    <span className="text-xs opacity-75">
                      ({format(new Date(warning.date), 'EEE d MMM', { locale: it })})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {lowSeverity.length > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Informazioni ({lowSeverity.length})</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 space-y-1">
              {lowSeverity.slice(0, 5).map((warning, idx) => (
                <li key={idx} className="text-sm flex items-center gap-2">
                  <span>•</span>
                  <span>{warning.message}</span>
                </li>
              ))}
              {lowSeverity.length > 5 && (
                <li className="text-sm text-muted-foreground">
                  ... e altri {lowSeverity.length - 5} avvisi
                </li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
