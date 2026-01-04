'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Wand2, Loader2 } from 'lucide-react'

interface GenerationParams {
  preferFixedStaff: boolean
  balanceHours: boolean
  minimizeCost: boolean
}

interface GenerationParamsFormProps {
  onGenerate: (params: GenerationParams) => Promise<void>
  isGenerating?: boolean
}

export function GenerationParamsForm({ onGenerate, isGenerating }: GenerationParamsFormProps) {
  const [params, setParams] = useState<GenerationParams>({
    preferFixedStaff: true,
    balanceHours: true,
    minimizeCost: false,
  })

  const handleGenerate = async () => {
    await onGenerate(params)
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
            <Label>Preferisci staff fisso</Label>
            <p className="text-xs text-muted-foreground">
              Assegna priorità ai dipendenti con contratto fisso
            </p>
          </div>
          <Switch
            checked={params.preferFixedStaff}
            onCheckedChange={v => setParams(p => ({ ...p, preferFixedStaff: v }))}
          />
        </div>

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
      </CardContent>
    </Card>
  )
}
