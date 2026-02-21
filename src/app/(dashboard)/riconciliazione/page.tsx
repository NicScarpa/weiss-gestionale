import { RiconciliazioneClient } from './RiconciliazioneClient'

export const metadata = {
  title: 'Riconciliazione Bancaria | Weiss Gestionale',
  description: 'Importa e riconcilia i movimenti bancari',
}

export default function RiconciliazionePage() {
  return <RiconciliazioneClient />
}
