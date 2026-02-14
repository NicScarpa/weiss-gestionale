import { redirect } from 'next/navigation'

export default function StaffRedirectPage() {
  // Reindirizza alla nuova posizione
  redirect('/anagrafiche/personale')
}
