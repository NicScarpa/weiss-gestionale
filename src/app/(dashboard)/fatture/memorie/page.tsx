import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { MemorieFornitore } from '@/components/invoices/MemorieFornitore'

export default function MemorieFornitorePage() {
  return (
    <div className="space-y-4">
      <Link
        href="/fatture/ricevute"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Fatture ricevute
      </Link>
      <MemorieFornitore />
    </div>
  )
}
