'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { RelationshipConstraintEditor } from '@/components/staff/RelationshipConstraintEditor'
import { ArrowLeft, Users } from 'lucide-react'

export default function RelationshipConstraintsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/staff">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6" />
              Vincoli Relazionali
            </h1>
            <p className="text-muted-foreground">
              Configura vincoli tra dipendenti (lavorare insieme, separati, stesso giorno libero, etc.)
            </p>
          </div>
        </div>
      </div>

      {/* Editor vincoli relazionali */}
      <RelationshipConstraintEditor />
    </div>
  )
}
