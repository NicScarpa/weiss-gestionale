import { ProspettoClient } from './ProspettoClient'

export const metadata = {
  title: 'Prospetto di cash flow',
}

export default function ProspettoPage() {
  return <ProspettoClient annoIniziale={new Date().getFullYear()} />
}
