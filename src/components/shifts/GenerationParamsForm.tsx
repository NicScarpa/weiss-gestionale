'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Wand2, Loader2, Users } from 'lucide-react'
import { StaffingConfiguration } from './StaffingConfiguration'

interface ShiftDefinition {
  id: string
  name: string
  code: string
  minStaff: number
}

interface GenerationParams {
  preferFixedStaff: boolean
  balanceHours: boolean
  minimizeCost: boolean
  staffingRequirements?: Record<string, number>
}

interface GenerationParamsFormProps {
  onGenerate: (params: GenerationParams) => Promise<void>
  isGenerating?: boolean
  startDate: Date
  endDate: Date
  shiftDefinitions: ShiftDefinition[]
  onStaffingChange?: (requirements: Record<string, number>) => void
  initialStaffingRequirements?: Record<string, number>
}

export function GenerationParamsForm({
  onGenerate,
  isGenerating,
  startDate,
  endDate,
  shiftDefinitions,
  onStaffingChange,
  initialStaffingRequirements,
}: GenerationParamsFormProps) {
  const [params, setParams] = useState<GenerationParams>({
    preferFixedStaff: true,
    balanceHours: true,
    minimizeCost: false,
  })
  const [staffingRequirements, setStaffingRequirementsState] = useState<Record<string, number>>(
    initialStaffingRequirements || {}
  )

  // Sincronizza quando initialStaffingRequirements cambia (es. caricato dal database)
  useEffect(() => {
    if (initialStaffingRequirements && Object.keys(initialStaffingRequirements).length > 0) {
      queueMicrotask(() => setStaffingRequirementsState(initialStaffingRequirements))
    }
  }, [initialStaffingRequirements])
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  // Wrapper per aggiornare sia lo state locale che notificare il parent
  const setStaffingRequirements = (requirements: Record<string, number>) => {
    setStaffingRequirementsState(requirements)
    onStaffingChange?.(requirements)
  }

  const handleGenerate = async () => {
    await onGenerate({
      ...params,
      staffingRequirements,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Wand2 className="h-5 w-5" />
          Generazione Automatica
        </CardTitle>
        <CardDescription>
          Configura i parametri per la generazione automatica dei turni
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Bilancia ore</Label>
            <p className="text-xs text-muted-foreground">
              Distribuisci equamente le ore tra i dipendenti
            </p>
          </div>
          <Switch
            checked={params.balanceHours}
            onCheckedChange={v => setParams(p => ({ ...p, balanceHours: v }))}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Minimizza costi</Label>
            <p className="text-xs text-muted-foreground">
              Preferisci dipendenti con tariffa più bassa
            </p>
          </div>
          <Switch
            checked={params.minimizeCost}
            onCheckedChange={v => setParams(p => ({ ...p, minimizeCost: v }))}
          />
        </div>

        <div className="pt-2">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full mb-2">
                <Users className="h-4 w-4 mr-2" />
                Configura Fabbisogno Staff
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Fabbisogno Staff
                </DialogTitle>
                <DialogDescription>
                  Personalizza il numero di persone richieste per ogni turno giornaliero
                </DialogDescription>
              </DialogHeader>
              <StaffingConfiguration
                startDate={startDate}
                endDate={endDate}
                shiftDefinitions={shiftDefinitions}
                onRequirementsChange={setStaffingRequirements}
                initialRequirements={staffingRequirements}
                hideHeader
              />
              <DialogFooter>
                <Button onClick={() => setIsDialogOpen(false)}>
                  Conferma
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button
            className="w-full"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generazione in corso...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4 mr-2" />
                Genera Turni
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
