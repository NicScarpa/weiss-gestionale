import { auth } from '@/lib/auth'

export default async function CorrispettiviPage() {
  const session = await auth()

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Corrispettivi Giornalieri</h1>
      <p className="text-muted-foreground">Tab Corrispettivi - Coming soon</p>
    </div>
  )
}
