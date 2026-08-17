import { Suspense } from 'react'
import { RiconciliazioneClient } from './RiconciliazioneClient'

export const metadata = {
  title: 'Riconciliazione Bancaria | Weiss Gestionale',
  description: 'Importa e riconcilia i movimenti bancari',
}

export default function RiconciliazionePage() {
  return (
    <Suspense fallback={null}>
      <RiconciliazioneClient />
    </Suspense>
  )
}
