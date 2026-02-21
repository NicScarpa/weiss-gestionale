import { auth } from '@/lib/auth'
import { PagamentiClient } from './PagamentiClient'

export default async function PagamentiPage() {
  const session = await auth()

  return <PagamentiClient />
}
