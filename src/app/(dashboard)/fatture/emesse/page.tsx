import { FileTextIcon } from 'lucide-react'

export default function EmessePage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <FileTextIcon className="h-12 w-12 text-muted-foreground/40 mb-4" />
      <h1 className="text-xl font-semibold mb-2">Fatture Emesse</h1>
      <p className="text-muted-foreground max-w-md">
        L&apos;emissione delle fatture di vendita arriverà con l&apos;integrazione
        del provider di fatturazione elettronica. Nel frattempo le fatture emesse
        restano gestite con gli strumenti attuali.
      </p>
    </div>
  )
}
