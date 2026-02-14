import { auth } from '@/lib/auth'

export default async function PagamentiPage() {
  const session = await auth()

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Pagamenti</h1>
      <p className="text-muted-foreground">Tab Pagamenti - Coming soon</p>

      {/* TODO: Implementare componente PagamentiTable */}
    </div>
  )
}
