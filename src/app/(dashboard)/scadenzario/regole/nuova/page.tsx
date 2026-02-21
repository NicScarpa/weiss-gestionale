"use client"

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CreateRulePage } from '@/components/scadenzario/create-rule-page'
import { ScheduleRuleDirection } from '@/types/schedule'

function NuovaRegolaContent() {
  const searchParams = useSearchParams()
  const direzione = (searchParams.get('direzione') as ScheduleRuleDirection) || ScheduleRuleDirection.EMESSI

  return <CreateRulePage direzione={direzione} />
}

export default function NuovaRegolaPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Caricamento...</p></div>}>
      <NuovaRegolaContent />
    </Suspense>
  )
}
