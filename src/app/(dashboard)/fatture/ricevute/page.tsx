import { auth } from '@/lib/auth'
import { InvoiceList } from '@/components/invoices/InvoiceList'

export default async function RicevutePage() {
  const session = await auth()

  return (
    <div className="space-y-6">
      <InvoiceList />
    </div>
  )
}
