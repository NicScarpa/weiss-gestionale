'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { FileText, Download, Trash2 } from 'lucide-react'

interface DocumentsTabProps {
  userId: string
  isAdmin: boolean
}

const CATEGORIES = [
  { value: 'all', label: 'Tutti' },
  { value: 'CEDOLINI', label: 'Cedolini' },
  { value: 'ATTESTATI', label: 'Attestati' },
  { value: 'ALTRO', label: 'Altri' },
]

export function DocumentsTab({ userId }: DocumentsTabProps) {
  const [categoryFilter, setCategoryFilter] = useState('all')

  const { data, isLoading } = useQuery({
    queryKey: ['employee-documents', userId],
    queryFn: async () => {
      const res = await fetch(`/api/documents?userId=${userId}`)
      if (!res.ok) return { documents: [] }
      return res.json()
    },
  })

  const allDocuments = data?.documents || data?.data || []
  const documents = categoryFilter === 'all'
    ? allDocuments
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    : allDocuments.filter((d: any) => d.category === categoryFilter)

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="space-y-4">
      {/* Category filter */}
      <div className="flex gap-1">
        {CATEGORIES.map(c => (
          <Button
            key={c.value}
            variant={categoryFilter === c.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCategoryFilter(c.value)}
          >
            {c.label}
          </Button>
        ))}
      </div>

      {/* Documents list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Nessun documento trovato
        </div>
      ) : (
        <div className="space-y-2">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {documents.map((doc: any) => (
            <Card key={doc.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{doc.originalFilename || doc.filename}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-xs">
                        {doc.category}
                      </Badge>
                      {doc.periodLabel && <span>{doc.periodLabel}</span>}
                      {doc.fileSize && <span>{formatSize(doc.fileSize)}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => window.open(`/api/documents/${doc.id}`, '_blank')}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
