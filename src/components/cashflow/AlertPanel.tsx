'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, CheckCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { AlertType, AlertStatus } from '@/types/cash-flow'

const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  SOTTO_SOGLIA: 'Sotto soglia',
  SOPRA_SOGLIA: 'Sopra soglia',
  SALDO_NEGATIVO: 'Saldo negativo',
  VARIANZA_ALTA: 'Varianza alta',
}

interface Alert {
  id: string
  tipo: AlertType
  dataPrevista: string
  messaggio: string
  stato: AlertStatus
}

export function AlertPanel() {
  const [isOpen, setIsOpen] = useState(true)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadAlerts() {
      try {
        const res = await fetch('/api/cashflow/alerts')
        if (res.ok) {
          const data = await res.json()
          setAlerts(data || [])
        }
      } catch (error) {
        console.error('Errore caricamento alert:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadAlerts()
  }, [])

  if (isLoading) return null
  if (alerts.length === 0) return null

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <span className="font-medium">Alert Attivi ({alerts.length})</span>
          </div>
          <Button variant="ghost" size="sm">
            {isOpen ? 'Nascondi' : 'Mostra'}
          </Button>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4">
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-start justify-between p-3 bg-background border rounded-lg"
            >
              <div className="flex-1">
                <p className="text-sm font-medium">{ALERT_TYPE_LABELS[alert.tipo]}</p>
                <p className="text-sm text-muted-foreground">{alert.messaggio}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(alert.dataPrevista).toLocaleDateString('it-IT')}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline">
                  Risolvi
                </Button>
                <Button size="sm" variant="ghost">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
