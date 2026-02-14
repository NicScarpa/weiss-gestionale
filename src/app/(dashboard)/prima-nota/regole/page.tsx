import { auth } from '@/lib/auth'

export default async function RegolePage() {
  const session = await auth()

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Regole di Categorizzazione</h1>
      <p className="text-muted-foreground">Tab Regole - Coming soon</p>

      {/* TODO: Implementare componente RegoleTable */}
    </div>
  )
}
