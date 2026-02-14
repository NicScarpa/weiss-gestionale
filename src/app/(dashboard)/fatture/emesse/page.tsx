import { auth } from '@/lib/auth'

export default async function EmessePage() {
  const session = await auth()

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Fatture Emesse</h1>
      <p className="text-muted-foreground">Tab Emesse - Coming soon</p>
    </div>
  )
}
