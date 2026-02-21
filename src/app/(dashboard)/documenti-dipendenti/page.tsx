'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Upload,
  FileText,
  Download,
  Trash2,
  CheckCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

const MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

const CATEGORIES = [
  { value: 'CEDOLINI', label: 'Cedolini' },
  { value: 'ATTESTATI', label: 'Attestati' },
  { value: 'ALTRO', label: 'Altro' },
]

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface Document {
  id: string
  category: string
  originalFilename: string
  fileSize: number
  period: string | null
  periodLabel: string | null
  description: string | null
  createdAt: string
  user: { id: string; firstName: string; lastName: string }
  uploadedBy: { id: string; firstName: string; lastName: string }
}

interface Employee {
  id: string
  firstName: string
  lastName: string
  isActive: boolean
}

interface BulkResult {
  matched: Array<{ userId: string; name: string; documentId: string; pages: number[] }>
  unmatched: Array<{ pages: number[]; textSnippet: string }>
  summary: { totalPages: number; matchedCount: number; unmatchedCount: number }
}

export default function DocumentiDipendentiPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Documenti Dipendenti</h1>
        <p className="text-sm text-slate-500 mt-1">
          Gestisci cedolini, attestati e altri documenti per i dipendenti
        </p>
      </div>

      <Tabs defaultValue="upload-bulk">
        <TabsList>
          <TabsTrigger value="upload-bulk">Upload Cedolini</TabsTrigger>
          <TabsTrigger value="tutti">Tutti i Documenti</TabsTrigger>
          <TabsTrigger value="upload-singolo">Upload Singolo</TabsTrigger>
        </TabsList>

        <TabsContent value="upload-bulk" className="mt-6">
          <BulkUploadTab />
        </TabsContent>

        <TabsContent value="tutti" className="mt-6">
          <AllDocumentsTab />
        </TabsContent>

        <TabsContent value="upload-singolo" className="mt-6">
          <SingleUploadTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ========== TAB: Upload Bulk Cedolini ==========
function BulkUploadTab() {
  const [file, setFile] = useState<File | null>(null)
  const [month, setMonth] = useState('')
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [result, setResult] = useState<BulkResult | null>(null)

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file || !month || !year) throw new Error('Compila tutti i campi')
      const formData = new FormData()
      formData.append('file', file)
      const period = `${year}-${month.padStart(2, '0')}`
      const periodLabel = `${MONTHS[parseInt(month) - 1]} ${year}`
      formData.append('period', period)
      formData.append('periodLabel', periodLabel)

      const res = await fetch('/api/documents/upload-bulk', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Errore upload')
      }
      return res.json()
    },
    onSuccess: (data) => {
      setResult(data)
      toast.success(`${data.summary.matchedCount} cedolini salvati con successo`)
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Carica PDF Cedolini</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Mese</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona mese" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Anno</Label>
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                min={2020}
                max={2030}
              />
            </div>
            <div>
              <Label>File PDF</Label>
              <Input
                type="file"
                accept=".pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>

          {file && (
            <p className="text-sm text-slate-500">
              {file.name} ({formatFileSize(file.size)})
            </p>
          )}

          <Button
            onClick={() => uploadMutation.mutate()}
            disabled={!file || !month || !year || uploadMutation.isPending}
          >
            {uploadMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analizzando PDF...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Carica e Analizza
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Risultato Analisi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Badge variant="default" className="text-sm">
                <CheckCircle className="h-3 w-3 mr-1" />
                {result.summary.matchedCount} abbinati
              </Badge>
              {result.summary.unmatchedCount > 0 && (
                <Badge variant="destructive" className="text-sm">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {result.summary.unmatchedCount} non abbinati
                </Badge>
              )}
              <Badge variant="secondary" className="text-sm">
                {result.summary.totalPages} pagine totali
              </Badge>
            </div>

            {result.matched.length > 0 && (
              <div>
                <h4 className="font-medium text-sm mb-2">Cedolini salvati:</h4>
                <div className="space-y-1">
                  {result.matched.map((m) => (
                    <div key={m.documentId} className="flex items-center gap-2 text-sm text-slate-600">
                      <CheckCircle className="h-3 w-3 text-green-500" />
                      <span>{m.name}</span>
                      <span className="text-slate-400">
                        (pag. {m.pages.map((p) => p + 1).join(', ')})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.unmatched.length > 0 && (
              <div>
                <h4 className="font-medium text-sm mb-2">Non abbinati:</h4>
                <div className="space-y-2">
                  {result.unmatched.map((u, i) => (
                    <div key={i} className="p-3 bg-red-50 rounded-lg text-sm">
                      <p className="font-medium text-red-700">
                        Pagine {u.pages.map((p) => p + 1).join(', ')}
                      </p>
                      <p className="text-red-600 text-xs mt-1 truncate">
                        {u.textSnippet}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ========== TAB: Tutti i Documenti ==========
function AllDocumentsTab() {
  const [filterUser, setFilterUser] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterPeriod, setFilterPeriod] = useState('')
  const queryClient = useQueryClient()

  const { data: employeesData } = useQuery<{ users: Employee[] }>({
    queryKey: ['employees-list'],
    queryFn: async () => {
      const res = await fetch('/api/users?active=true&limit=200')
      return res.json()
    },
  })

  const { data, isLoading } = useQuery<{
    documents: Document[]
    pagination: { page: number; total: number; totalPages: number }
  }>({
    queryKey: ['documents', filterUser, filterCategory, filterPeriod],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filterUser) params.set('userId', filterUser)
      if (filterCategory) params.set('category', filterCategory)
      if (filterPeriod) params.set('period', filterPeriod)
      const res = await fetch(`/api/documents?${params}`)
      return res.json()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Errore eliminazione')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      toast.success('Documento eliminato')
    },
    onError: () => toast.error('Errore eliminazione documento'),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select value={filterUser} onValueChange={setFilterUser}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Tutti i dipendenti" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            {employeesData?.users?.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.lastName} {e.firstName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tutte le categorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="month"
          value={filterPeriod}
          onChange={(e) => setFilterPeriod(e.target.value)}
          className="w-[180px]"
          placeholder="Periodo"
        />

        {(filterUser || filterCategory || filterPeriod) && (
          <Button
            variant="ghost"
            onClick={() => {
              setFilterUser('')
              setFilterCategory('')
              setFilterPeriod('')
            }}
          >
            Azzera filtri
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dipendente</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Periodo</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Dimensione</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : data?.documents?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                    Nessun documento trovato
                  </TableCell>
                </TableRow>
              ) : (
                data?.documents?.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">
                      {doc.user.lastName} {doc.user.firstName}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{doc.category}</Badge>
                    </TableCell>
                    <TableCell>{doc.periodLabel || doc.period || '-'}</TableCell>
                    <TableCell className="flex items-center gap-1">
                      <FileText className="h-3 w-3 text-slate-400" />
                      <span className="text-sm truncate max-w-[200px]">
                        {doc.originalFilename}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {formatFileSize(doc.fileSize)}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {new Date(doc.createdAt).toLocaleDateString('it-IT')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            window.open(`/api/documents/${doc.id}`, '_blank')
                          }}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => {
                            if (confirm('Eliminare questo documento?')) {
                              deleteMutation.mutate(doc.id)
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

// ========== TAB: Upload Singolo ==========
function SingleUploadTab() {
  const [file, setFile] = useState<File | null>(null)
  const [userId, setUserId] = useState('')
  const [category, setCategory] = useState('')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [description, setDescription] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)

  const { data: employeesData } = useQuery<{ users: Employee[] }>({
    queryKey: ['employees-list'],
    queryFn: async () => {
      const res = await fetch('/api/users?active=true&limit=200')
      return res.json()
    },
  })

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file || !userId || !category) throw new Error('Compila i campi obbligatori')
      const formData = new FormData()
      formData.append('file', file)
      formData.append('userId', userId)
      formData.append('category', category)
      if (month && year) {
        formData.append('period', `${year}-${month.padStart(2, '0')}`)
        formData.append('periodLabel', `${MONTHS[parseInt(month) - 1]} ${year}`)
      }
      if (description) formData.append('description', description)

      const res = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Errore upload')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Documento caricato con successo')
      setFile(null)
      setUserId('')
      setCategory('')
      setMonth('')
      setDescription('')
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 3000)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Upload Documento Singolo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Dipendente *</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona dipendente" />
              </SelectTrigger>
              <SelectContent>
                {employeesData?.users?.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.lastName} {e.firstName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Categoria *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona categoria" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Mese</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger>
                <SelectValue placeholder="Opzionale" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Anno</Label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              min={2020}
              max={2030}
            />
          </div>
        </div>

        <div>
          <Label>Descrizione</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descrizione opzionale..."
            rows={2}
          />
        </div>

        <div>
          <Label>File *</Label>
          <Input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          {file && (
            <p className="text-sm text-slate-500 mt-1">
              {file.name} ({formatFileSize(file.size)})
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => uploadMutation.mutate()}
            disabled={!file || !userId || !category || uploadMutation.isPending}
          >
            {uploadMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Caricamento...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Carica Documento
              </>
            )}
          </Button>

          {showSuccess && (
            <span className="text-sm text-green-600 flex items-center gap-1">
              <CheckCircle className="h-4 w-4" /> Salvato!
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
