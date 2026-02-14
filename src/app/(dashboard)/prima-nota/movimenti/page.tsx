import { auth } from '@/lib/auth'

export default async function MovimentiPage() {
  const session = await auth()

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Movimenti</h1>
      <p className="text-muted-foreground">Tab Movimenti - Coming soon</p>

      {/* TODO: Implementare componente MovimentiTable */}
    </div>
  )
}
