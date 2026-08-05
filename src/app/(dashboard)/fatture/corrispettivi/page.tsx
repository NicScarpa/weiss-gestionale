import { ReceiptIcon } from 'lucide-react'

export default function CorrispettiviPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <ReceiptIcon className="h-12 w-12 text-muted-foreground/40 mb-4" />
      <h1 className="text-xl font-semibold mb-2">Corrispettivi</h1>
      <p className="text-muted-foreground max-w-md">
        La consultazione dei corrispettivi telematici arriverà con
        l&apos;integrazione del provider fiscale. I corrispettivi giornalieri
        restano registrati tramite la chiusura cassa.
      </p>
    </div>
  )
}
