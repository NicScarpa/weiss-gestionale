"use client"

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { ScheduleStatusBadge } from '@/components/scadenzario/schedule-status-badge'
import { PriorityBadge } from '@/components/scadenzario/priority-badge'
import { PaymentProgressBar } from '@/components/scadenzario/payment-progress-bar'
import { PaymentDialog, PaymentFormData } from '@/components/scadenzario/payment-dialog'
import { RecurrencePreview } from '@/components/scadenzario/recurrence-preview'
import { CreateScheduleDialog } from '@/components/scadenzario/create-schedule-sheet'
import {
  Schedule,
  SchedulePayment,
  ScheduleStatus,
  CreateScheduleInput,
  SCHEDULE_TYPE_LABELS,
  SCHEDULE_TYPE_COLORS,
  SCHEDULE_DOCUMENT_TYPE_LABELS,
  SCHEDULE_PAYMENT_METHOD_LABELS,
  ScheduleDocumentType,
  SchedulePaymentMethod,
  ScheduleSource,
} from '@/types/schedule'
import { formatCurrency, cn } from '@/lib/utils'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  RefreshCcw,
  StopCircle,
  XCircle,
  Loader2,
  FileText,
  Upload,
  Download,
} from 'lucide-react'
import { toast } from 'sonner'

const SOURCE_LABELS: Record<string, string> = {
  manuale: 'Manuale',
  import_csv: 'Import CSV',
  import_fatture_sdi: 'Import fatture SDI',
  ricorrenza_auto: 'Ricorrenza automatica',
}

export default function ScadenzarioDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [payments, setPayments] = useState<SchedulePayment[]>([])
  const [occurrences, setOccurrences] = useState<Schedule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [editSheetOpen, setEditSheetOpen] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [attachments, setAttachments] = useState<any[]>([])
  const [isDeletingPayment, setIsDeletingPayment] = useState<string | null>(null)
  const [isUploadingFile, setIsUploadingFile] = useState(false)
  const [activeTab, setActiveTab] = useState('informazioni')

  const fetchSchedule = useCallback(async () => {
    try {
      const resp = await fetch(`/api/scadenzario/${id}`)
      const data = await resp.json()
      if (resp.ok) {
        setSchedule(data.schedule)
      } else {
        toast.error('Scadenza non trovata')
        router.push('/scadenzario')
      }
    } catch {
      toast.error('Errore nel caricamento')
      router.push('/scadenzario')
    }
  }, [id, router])

  const fetchPayments = useCallback(async () => {
    try {
      const resp = await fetch(`/api/scadenzario/${id}/pagamenti`)
      const data = await resp.json()
      if (resp.ok) {
        setPayments(data.payments || [])
      }
    } catch {
      console.error('Errore fetch pagamenti')
    }
  }, [id])

  const fetchOccurrences = useCallback(async () => {
    try {
      const resp = await fetch(`/api/scadenzario/${id}/occorrenze`)
      const data = await resp.json()
      if (resp.ok) {
        setOccurrences(data.occurrences || [])
      }
    } catch {
      // endpoint might not exist yet
    }
  }, [id])

  const fetchAttachments = useCallback(async () => {
    try {
      const resp = await fetch(`/api/scadenzario/${id}/allegati`)
      const data = await resp.json()
      if (resp.ok) {
        setAttachments(data.attachments || [])
      }
    } catch {
      // endpoint might not exist yet
    }
  }, [id])

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      await fetchSchedule()
      await fetchPayments()
      await fetchOccurrences()
      await fetchAttachments()
      setIsLoading(false)
    }
    loadData()
  }, [fetchSchedule, fetchPayments, fetchOccurrences, fetchAttachments])

  const handlePayment = async (data: PaymentFormData) => {
    try {
      const resp = await fetch(`/api/scadenzario/${id}/pagamenti`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (resp.ok) {
        toast.success('Pagamento registrato')
        setPaymentDialogOpen(false)
        await fetchSchedule()
        await fetchPayments()
      } else {
        const err = await resp.json()
        toast.error(err.error || 'Errore nella registrazione')
      }
    } catch {
      toast.error('Errore nella registrazione del pagamento')
    }
  }

  const handleDeletePayment = async (paymentId: string) => {
    setIsDeletingPayment(paymentId)
    try {
      const resp = await fetch(`/api/scadenzario/${id}/pagamenti/${paymentId}`, {
        method: 'DELETE',
      })
      if (resp.ok) {
        toast.success('Pagamento eliminato')
        await fetchSchedule()
        await fetchPayments()
      } else {
        toast.error('Errore nell\'eliminazione del pagamento')
      }
    } catch {
      toast.error('Errore nell\'eliminazione')
    }
    setIsDeletingPayment(null)
  }

  const handleCancelSchedule = async () => {
    try {
      const resp = await fetch(`/api/scadenzario/${id}`, {
        method: 'DELETE',
      })
      if (resp.ok) {
        toast.success('Scadenza annullata')
        await fetchSchedule()
      } else {
        toast.error('Errore nell\'annullamento')
      }
    } catch {
      toast.error('Errore nell\'annullamento della scadenza')
    }
  }

  const handleGenerateNext = async () => {
    try {
      const resp = await fetch(`/api/scadenzario/${id}/genera-prossima`, {
        method: 'POST',
      })
      if (resp.ok) {
        toast.success('Prossima occorrenza generata')
        await fetchSchedule()
        await fetchOccurrences()
      } else {
        const err = await resp.json()
        toast.error(err.error || 'Errore nella generazione')
      }
    } catch {
      toast.error('Errore nella generazione della prossima occorrenza')
    }
  }

  const handleEditSchedule = async (data: CreateScheduleInput) => {
    try {
      const resp = await fetch(`/api/scadenzario/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (resp.ok) {
        toast.success('Scadenza aggiornata')
        setEditSheetOpen(false)
        await fetchSchedule()
      } else {
        const err = await resp.json()
        toast.error(err.error || 'Errore nell\'aggiornamento')
      }
    } catch {
      toast.error('Errore nell\'aggiornamento della scadenza')
    }
  }

  const handleUploadAttachment = async (file: File) => {
    setIsUploadingFile(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const resp = await fetch(`/api/scadenzario/${id}/allegati`, {
        method: 'POST',
        body: formData,
      })
      if (resp.ok) {
        toast.success('Allegato caricato')
        await fetchAttachments()
      } else {
        const err = await resp.json()
        toast.error(err.error || 'Errore nel caricamento')
      }
    } catch {
      toast.error('Errore nel caricamento dell\'allegato')
    }
    setIsUploadingFile(false)
  }

  const handleDeleteAttachment = async (attachmentId: string) => {
    try {
      const resp = await fetch(`/api/scadenzario/${id}/allegati/${attachmentId}`, {
        method: 'DELETE',
      })
      if (resp.ok) {
        toast.success('Allegato eliminato')
        await fetchAttachments()
      } else {
        toast.error('Errore nell\'eliminazione')
      }
    } catch {
      toast.error('Errore nell\'eliminazione dell\'allegato')
    }
  }

  const handleDeactivateRecurrence = async () => {
    try {
      const resp = await fetch(`/api/scadenzario/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ricorrenzaAttiva: false }),
      })
      if (resp.ok) {
        toast.success('Ricorrenza disattivata')
        await fetchSchedule()
      } else {
        toast.error('Errore nella disattivazione')
      }
    } catch {
      toast.error('Errore nella disattivazione della ricorrenza')
    }
  }

  if (isLoading || !schedule) {
    return (
      <div className="flex-1 p-8">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Caricamento...
        </div>
      </div>
    )
  }

  const importoResiduo = Number(schedule.importoTotale) - Number(schedule.importoPagato)
  const canPay = schedule.stato !== ScheduleStatus.PAGATA && schedule.stato !== ScheduleStatus.ANNULLATA
  const canCancel = canPay

  return (
    <div className="flex-1 space-y-6 p-8">
      {/* Back button + Header */}
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/scadenzario')}
          className="gap-2 text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Scadenzario
        </Button>

        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={cn(SCHEDULE_TYPE_COLORS[schedule.tipo], 'text-sm')}>
                {SCHEDULE_TYPE_LABELS[schedule.tipo]}
              </Badge>
              <ScheduleStatusBadge stato={schedule.stato} />
              <PriorityBadge priorita={schedule.priorita} showIcon />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {schedule.descrizione}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {canPay && (
              <Button size="sm" variant="outline" onClick={() => setEditSheetOpen(true)}>
                <Pencil className="h-4 w-4 mr-1" />
                Modifica
              </Button>
            )}
            {canPay && (
              <Button size="sm" onClick={() => setPaymentDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Registra pagamento
              </Button>
            )}
            {canCancel && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <XCircle className="h-4 w-4 mr-1" />
                    Annulla
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Annullare la scadenza?</AlertDialogTitle>
                    <AlertDialogDescription>
                      La scadenza verrà contrassegnata come annullata. Questa azione non può essere annullata.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Indietro</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCancelSchedule}>
                      Annulla scadenza
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>

      {/* Progress Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-3 gap-6 mb-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Importo totale</p>
              <p className="text-2xl font-bold">{formatCurrency(Number(schedule.importoTotale))}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Pagato</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(Number(schedule.importoPagato))}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Residuo</p>
              <p className="text-2xl font-bold text-amber-600">{formatCurrency(importoResiduo)}</p>
            </div>
          </div>
          <PaymentProgressBar
            importoTotale={Number(schedule.importoTotale)}
            importoPagato={Number(schedule.importoPagato)}
          />
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="informazioni">Informazioni</TabsTrigger>
          <TabsTrigger value="pagamenti">
            Pagamenti {payments.length > 0 && `(${payments.length})`}
          </TabsTrigger>
          <TabsTrigger value="allegati">
            Allegati {attachments.length > 0 && `(${attachments.length})`}
          </TabsTrigger>
          {schedule.isRicorrente && (
            <TabsTrigger value="occorrenze">
              Occorrenze {occurrences.length > 0 && `(${occurrences.length})`}
            </TabsTrigger>
          )}
        </TabsList>

        {/* Tab Informazioni */}
        <TabsContent value="informazioni" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dettagli scadenza</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DetailRow label="Tipo documento" value={
                  schedule.tipoDocumento
                    ? SCHEDULE_DOCUMENT_TYPE_LABELS[schedule.tipoDocumento as ScheduleDocumentType] || schedule.tipoDocumento
                    : null
                } />
                <DetailRow label="Numero documento" value={schedule.numeroDocumento} />
                <DetailRow label="Riferimento" value={schedule.riferimentoDocumento} />
                <DetailRow label="Controparte" value={schedule.controparteNome || schedule.supplier?.name} />
                <DetailRow label="IBAN controparte" value={schedule.controparteIban} />
                <DetailRow label="Data emissione" value={
                  schedule.dataEmissione
                    ? format(new Date(schedule.dataEmissione), 'dd/MM/yyyy', { locale: it })
                    : null
                } />
                <DetailRow label="Data scadenza" value={
                  format(new Date(schedule.dataScadenza), 'dd/MM/yyyy', { locale: it })
                } bold />
                <DetailRow label="Data pagamento" value={
                  schedule.dataPagamento
                    ? format(new Date(schedule.dataPagamento), 'dd/MM/yyyy', { locale: it })
                    : null
                } />
                <DetailRow label="Metodo pagamento" value={
                  schedule.metodoPagamento
                    ? SCHEDULE_PAYMENT_METHOD_LABELS[schedule.metodoPagamento as SchedulePaymentMethod] || schedule.metodoPagamento
                    : null
                } />
                <DetailRow label="Origine" value={
                  SOURCE_LABELS[schedule.source as string] || schedule.source
                } />
                {schedule.note && (
                  <div className="col-span-2">
                    <DetailRow label="Note" value={schedule.note} />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Ricorrenza */}
          {schedule.isRicorrente && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ricorrenza</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <RecurrencePreview
                  isRicorrente={schedule.isRicorrente}
                  ricorrenzaTipo={schedule.ricorrenzaTipo}
                  ricorrenzaAttiva={schedule.ricorrenzaAttiva}
                  ricorrenzaProssimaGenerazione={schedule.ricorrenzaProssimaGenerazione}
                />
                {schedule.ricorrenzaFine && (
                  <p className="text-sm text-muted-foreground">
                    Fine ricorrenza: {format(new Date(schedule.ricorrenzaFine), 'dd/MM/yyyy', { locale: it })}
                  </p>
                )}
                {schedule.ricorrenzaParentId && (
                  <p className="text-sm text-muted-foreground">
                    Generata dalla scadenza:{' '}
                    <Button
                      variant="link"
                      className="p-0 h-auto text-sm"
                      onClick={() => router.push(`/scadenzario/${schedule.ricorrenzaParentId}`)}
                    >
                      {schedule.ricorrenzaParent?.descrizione || schedule.ricorrenzaParentId}
                    </Button>
                  </p>
                )}
                {schedule.ricorrenzaAttiva && canPay && (
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={handleGenerateNext}>
                      <RefreshCcw className="h-4 w-4 mr-1" />
                      Genera prossima
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleDeactivateRecurrence}>
                      <StopCircle className="h-4 w-4 mr-1" />
                      Disattiva ricorrenza
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab Pagamenti */}
        <TabsContent value="pagamenti" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Pagamenti registrati</CardTitle>
              {canPay && (
                <Button size="sm" onClick={() => setPaymentDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Registra pagamento
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {payments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nessun pagamento registrato
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Importo</TableHead>
                      <TableHead>Metodo</TableHead>
                      <TableHead>Riferimento</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(payment.dataPagamento), 'dd/MM/yyyy', { locale: it })}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(Number(payment.importo))}
                        </TableCell>
                        <TableCell>
                          {payment.metodo
                            ? SCHEDULE_PAYMENT_METHOD_LABELS[payment.metodo as SchedulePaymentMethod] || payment.metodo
                            : '—'}
                        </TableCell>
                        <TableCell>{payment.riferimento || '—'}</TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {payment.note || '—'}
                        </TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={isDeletingPayment === payment.id}
                              >
                                {isDeletingPayment === payment.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Eliminare il pagamento?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Il pagamento di {formatCurrency(Number(payment.importo))} verrà rimosso e il saldo della scadenza verrà aggiornato.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Indietro</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeletePayment(payment.id)}>
                                  Elimina
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Occorrenze */}
        {schedule.isRicorrente && (
          <TabsContent value="occorrenze" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Occorrenze generate</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {occurrences.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nessuna occorrenza generata
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Descrizione</TableHead>
                        <TableHead>Data scadenza</TableHead>
                        <TableHead className="text-right">Importo</TableHead>
                        <TableHead>Stato</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {occurrences.map((occ) => (
                        <TableRow
                          key={occ.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => router.push(`/scadenzario/${occ.id}`)}
                        >
                          <TableCell className="max-w-[250px] truncate">
                            {occ.descrizione}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(occ.dataScadenza), 'dd/MM/yyyy', { locale: it })}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(Number(occ.importoTotale))}
                          </TableCell>
                          <TableCell>
                            <ScheduleStatusBadge stato={occ.stato} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Tab Allegati */}
        <TabsContent value="allegati" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Allegati</CardTitle>
              <div>
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.xml"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleUploadAttachment(file)
                    e.target.value = ''
                  }}
                />
                <Button
                  size="sm"
                  onClick={() => document.getElementById('file-upload')?.click()}
                  disabled={isUploadingFile}
                >
                  {isUploadingFile ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-1" />
                  )}
                  Carica allegato
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {attachments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nessun allegato caricato
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Dimensione</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {attachments.map((att: any) => (
                      <TableRow key={att.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{att.originalFilename}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {att.contentType}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatFileSize(att.fileSize)}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {format(new Date(att.createdAt), 'dd/MM/yyyy', { locale: it })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(`/api/scadenzario/${id}/allegati/${att.id}`, '_blank')}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Eliminare l&apos;allegato?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Il file &quot;{att.originalFilename}&quot; verrà eliminato permanentemente.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Indietro</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteAttachment(att.id)}>
                                    Elimina
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* Payment Dialog */}
      {schedule && (
        <PaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          onSubmit={handlePayment}
          importoResiduo={importoResiduo}
        />
      )}

      {/* Edit Sheet */}
      {schedule && (
        <CreateScheduleDialog
          mode="edit"
          open={editSheetOpen}
          onOpenChange={setEditSheetOpen}
          onSubmit={handleEditSchedule}
          initialData={{
            tipo: schedule.tipo,
            descrizione: schedule.descrizione,
            importoTotale: Number(schedule.importoTotale),
            dataScadenza: new Date(schedule.dataScadenza),
            dataEmissione: schedule.dataEmissione ? new Date(schedule.dataEmissione) : undefined,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tipoDocumento: schedule.tipoDocumento as any,
            numeroDocumento: schedule.numeroDocumento || undefined,
            controparteNome: schedule.controparteNome || undefined,
            controparteIban: schedule.controparteIban || undefined,
            priorita: schedule.priorita,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            metodoPagamento: schedule.metodoPagamento as any,
            isRicorrente: schedule.isRicorrente,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ricorrenzaTipo: schedule.ricorrenzaTipo as any,
            ricorrenzaFine: schedule.ricorrenzaFine ? new Date(schedule.ricorrenzaFine) : undefined,
            ricorrenzaAttiva: schedule.ricorrenzaAttiva,
            note: schedule.note || undefined,
          }}
        />
      )}
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function DetailRow({
  label,
  value,
  bold,
}: {
  label: string
  value: string | null | undefined
  bold?: boolean
}) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn('text-sm', bold && 'font-semibold')}>
        {value || '—'}
      </p>
    </div>
  )
}
