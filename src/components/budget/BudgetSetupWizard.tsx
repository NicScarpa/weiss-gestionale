'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import {
  Layers,
  Target,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Sparkles,
} from 'lucide-react'

interface BudgetSetupWizardProps {
  venueId: string
  venueName: string
  year: number
  budgetId?: string
  onComplete: () => void
  onSkip?: () => void
}

type WizardStep = 'welcome' | 'template' | 'confirm' | 'complete'

const STEPS: { id: WizardStep; title: string }[] = [
  { id: 'welcome', title: 'Benvenuto' },
  { id: 'template', title: 'Template' },
  { id: 'confirm', title: 'Conferma' },
  { id: 'complete', title: 'Completato' },
]

export function BudgetSetupWizard({
  venueId,
  venueName,
  year,
  budgetId,
  onComplete,
  onSkip,
}: BudgetSetupWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('welcome')
  const [loading, setLoading] = useState(false)
  const [templateChoice, setTemplateChoice] = useState<'default' | 'empty'>('default')

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep)
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100

  const handleSeedTemplate = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/budget-categories/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Errore nella creazione')
      }

      toast.success('Categorie create con successo')
      setCurrentStep('confirm')
    } catch (error: unknown) {
      if (error instanceof Error) {
        toast.error(error.message)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleTemplateChoice = () => {
    if (templateChoice === 'default') {
      handleSeedTemplate()
    } else {
      setCurrentStep('confirm')
    }
  }

  const handleComplete = () => {
    setCurrentStep('complete')
    setTimeout(() => {
      onComplete()
    }, 1500)
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between mb-4">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Configurazione Budget
          </CardTitle>
          <span className="text-sm text-muted-foreground">
            {currentStepIndex + 1} di {STEPS.length}
          </span>
        </div>
        <Progress value={progress} className="h-2" />
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Welcome Step */}
        {currentStep === 'welcome' && (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
              <Target className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">
              Benvenuto nella configurazione del Budget {year}
            </h2>
            <p className="text-muted-foreground">
              Configura il budget per <strong>{venueName}</strong> in pochi semplici passi.
              Definirai le categorie di spesa e i target di ricavo mensili.
            </p>
            <div className="flex justify-center gap-4 pt-4">
              {onSkip && (
                <Button variant="outline" onClick={onSkip}>
                  Configura dopo
                </Button>
              )}
              <Button onClick={() => setCurrentStep('template')}>
                Inizia
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Template Step */}
        {currentStep === 'template' && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">
                Scegli come iniziare
              </h2>
              <p className="text-muted-foreground">
                Puoi usare le categorie predefinite o partire da zero
              </p>
            </div>

            <div className="grid gap-4">
              <button
                onClick={() => setTemplateChoice('default')}
                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                  templateChoice === 'default'
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/30'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                    <Layers className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-medium">Template predefinito (Consigliato)</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Include categorie standard: Personale, Food Cost, Costi Fissi,
                      Marketing, ecc. Puoi personalizzarle in seguito.
                    </p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setTemplateChoice('empty')}
                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                  templateChoice === 'empty'
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/30'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <Target className="h-5 w-5 text-slate-600" />
                  </div>
                  <div>
                    <h3 className="font-medium">Inizia da zero</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Creerai le tue categorie personalizzate manualmente
                      nelle impostazioni.
                    </p>
                  </div>
                </div>
              </button>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setCurrentStep('welcome')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Indietro
              </Button>
              <Button onClick={handleTemplateChoice} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creazione...
                  </>
                ) : (
                  <>
                    Continua
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Confirm Step */}
        {currentStep === 'confirm' && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">
                Configurazione completata
              </h2>
              <p className="text-muted-foreground">
                {templateChoice === 'default'
                  ? 'Le categorie predefinite sono state create. Puoi modificarle in qualsiasi momento dalle impostazioni.'
                  : 'Potrai creare le tue categorie personalizzate dalle impostazioni.'}
              </p>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <h3 className="font-medium text-sm">Prossimi passi:</h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  {templateChoice === 'default'
                    ? 'Categorie budget create'
                    : 'Crea le tue categorie nelle impostazioni'}
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                  Mappa i conti alle categorie
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                  Imposta i target di ricavo mensili
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                  Compila i valori budget per ogni categoria
                </li>
              </ul>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setCurrentStep('template')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Indietro
              </Button>
              <Button onClick={handleComplete}>
                Vai al Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Complete Step */}
        {currentStep === 'complete' && (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold mt-4">
              Tutto pronto!
            </h2>
            <p className="text-muted-foreground mt-2">
              Caricamento del dashboard in corso...
            </p>
            <div className="mt-4">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
