"use client"

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { CreateRulePage } from '@/components/scadenzario/create-rule-page'
import { ScheduleRule, ScheduleRuleDirection } from '@/types/schedule'

export default function ModificaRegolaPage() {
  const params = useParams()
  const id = params.id as string
  const [rule, setRule] = useState<ScheduleRule | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchRule() {
      try {
        const resp = await fetch(`/api/scadenzario/regole/${id}`)
        if (resp.ok) {
          const data = await resp.json()
          setRule(data.rule)
        } else {
          setError('Regola non trovata')
        }
      } catch {
        setError('Errore nel caricamento della regola')
      }
      setIsLoading(false)
    }
    fetchRule()
  }, [id])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    )
  }

  if (error || !rule) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-destructive">{error || 'Regola non trovata'}</p>
      </div>
    )
  }

  return (
    <CreateRulePage
      direzione={rule.direzione as ScheduleRuleDirection}
      initialData={rule}
    />
  )
}
