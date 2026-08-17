import { Suspense } from 'react'
import { RiconciliazioneClient } from './RiconciliazioneClient'

export const metadata = {
  title: 'Riconciliazione assistita | Weiss Gestionale',
  // L'import dell'estratto conto vive nella prima nota: qui si rivedono le
  // proposte del motore, una per volta.
  description: 'Rivedi le proposte di abbinamento fra movimenti bancari e scadenze',
}

export default function RiconciliazionePage() {
  return (
    <Suspense fallback={null}>
      <RiconciliazioneClient />
    </Suspense>
  )
}
