import { redirect } from 'next/navigation'

// Redirect a /movimenti come da specifiche
export default function PrimaNotaPage() {
  redirect('/prima-nota/movimenti')
}
