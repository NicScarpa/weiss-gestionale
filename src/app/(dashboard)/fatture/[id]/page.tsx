import { InvoiceDetail } from '@/components/invoices/InvoiceDetail'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function FatturaDetailPage({ params }: PageProps) {
  const { id } = await params

  return <InvoiceDetail invoiceId={id} />
}
