'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { FileText, Download, Loader2 } from 'lucide-react'

interface PortalDocument {
  id: string
  category: string
  originalFilename: string
  fileSize: number
  period: string | null
  periodLabel: string | null
  description: string | null
  createdAt: string
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function PortaleDocumentiPage() {
  const [activeTab, setActiveTab] = useState('CEDOLINI')

  const { data, isLoading } = useQuery<{ documents: PortalDocument[] }>({
    queryKey: ['portal-documents', activeTab],
    queryFn: async () => {
      const params = new URLSearchParams({ category: activeTab })
      const res = await fetch(`/api/portal/documents?${params}`)
      return res.json()
    },
  })

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">I miei Documenti</h2>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full">
          <TabsTrigger value="CEDOLINI" className="flex-1">Cedolini</TabsTrigger>
          <TabsTrigger value="ATTESTATI" className="flex-1">Attestati</TabsTrigger>
          <TabsTrigger value="ALTRO" className="flex-1">Altro</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : data?.documents?.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileText className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">Nessun documento disponibile</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data?.documents?.map((doc) => (
                <Card key={doc.id} className="hover:bg-gray-50 transition-colors">
                  <CardContent className="p-4">
                    <a
                      href={`/api/portal/documents/${doc.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex-shrink-0 h-10 w-10 bg-gray-100 rounded-lg flex items-center justify-center">
                          <FileText className="h-5 w-5 text-gray-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate">
                            {doc.periodLabel || doc.description || doc.originalFilename}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatFileSize(doc.fileSize)} &middot;{' '}
                            {new Date(doc.createdAt).toLocaleDateString('it-IT')}
                          </p>
                        </div>
                      </div>
                      <Download className="h-5 w-5 text-gray-400 flex-shrink-0" />
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
