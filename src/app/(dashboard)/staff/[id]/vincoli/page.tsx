'use client'

import { use } from 'react'
import { redirect } from 'next/navigation'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function StaffConstraintsPage({ params }: PageProps) {
  const resolvedParams = use(params)
  redirect(`/staff/${resolvedParams.id}?tab=impostazioni`)
}
