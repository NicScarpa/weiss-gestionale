'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface DownloadButtonsProps {
  closureId: string
}

export function DownloadButtons({ closureId }: DownloadButtonsProps) {
  const [loadingPdf, setLoadingPdf] = useState(false)
  const [loadingExcel, setLoadingExcel] = useState(false)

  const handleDownload = async (type: 'pdf' | 'excel') => {
    const setLoading = type === 'pdf' ? setLoadingPdf : setLoadingExcel
    setLoading(true)
    try {
      const res = await fetch(`/api/chiusure/${closureId}/${type}`)
      if (!res.ok) throw new Error('Download fallito')
      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        throw new Error('Risposta non valida')
      }
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `chiusura-${closureId}.${type === 'pdf' ? 'pdf' : 'xlsx'}`
      a.click()
      URL.revokeObjectURL(blobUrl)
    } catch {
      toast.error('Errore nel download. Riprova.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => handleDownload('pdf')} disabled={loadingPdf}>
        <Download className="mr-2 h-4 w-4" />
        {loadingPdf ? 'Scaricando...' : 'PDF'}
      </Button>
      <Button variant="outline" onClick={() => handleDownload('excel')} disabled={loadingExcel}>
        <Download className="mr-2 h-4 w-4" />
        {loadingExcel ? 'Scaricando...' : 'Excel'}
      </Button>
    </>
  )
}
