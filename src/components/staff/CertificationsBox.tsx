'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Plus,
  Pencil,
  Trash2,
  FileText,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react'
import { CertificationDialog } from './CertificationDialog'
import {
  CERTIFICATION_TYPES,
  getCertificationStatus,
  getMandatoryCertifications,
  type CertificationType,
  type Certification,
  type CertificationStatus,
} from '@/types/certifications'

interface CertificationsBoxProps {
  userId: string
  contractType?: string | null
  roleName?: string | null
  isReadOnly?: boolean
}

const STATUS_BADGE: Record<
  CertificationStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  valid: { label: 'Valida', variant: 'default' },
  expiring: { label: 'In scadenza', variant: 'secondary' },
  expired: { label: 'Scaduta', variant: 'destructive' },
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function CertificationsBox({
  userId,
  contractType,
  roleName,
  isReadOnly = false,
}: CertificationsBoxProps) {
  const queryClient = useQueryClient()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingCert, setEditingCert] = useState<Certification | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [dialogKey, setDialogKey] = useState(0)

  // Fetch certificazioni
  const { data: certsData, isLoading } = useQuery({
    queryKey: ['staff-certifications', userId],
    queryFn: async () => {
      const res = await fetch(`/api/staff/${userId}/certifications`)
      if (!res.ok) throw new Error('Errore nel caricamento certificazioni')
      return res.json()
    },
  })

  const certifications: Certification[] = certsData?.data || []
  const existingTypes = certifications.map((c) => c.type)

  // Certificazioni obbligatorie mancanti
  const mandatoryTypes = getMandatoryCertifications(contractType, roleName)
  const missingMandatory = mandatoryTypes.filter(
    (t) => !existingTypes.includes(t)
  )

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: {
      type: CertificationType
      obtainedDate: string
      expiryDate: string
      documentUrl?: string | null
    }) => {
      const res = await fetch(`/api/staff/${userId}/certifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nella creazione')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['staff-certifications', userId],
      })
      toast.success('Certificazione aggiunta')
      handleCloseDialog()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({
      certId,
      data,
    }: {
      certId: string
      data: {
        obtainedDate: string
        expiryDate: string
        documentUrl?: string | null
      }
    }) => {
      const res = await fetch(
        `/api/staff/${userId}/certifications/${certId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      )
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nella modifica')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['staff-certifications', userId],
      })
      toast.success('Certificazione aggiornata')
      handleCloseDialog()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (certId: string) => {
      const res = await fetch(
        `/api/staff/${userId}/certifications/${certId}`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Errore nell'eliminazione")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['staff-certifications', userId],
      })
      toast.success('Certificazione eliminata')
      setDeleteId(null)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleOpenDialog = (cert?: Certification) => {
    if (cert) {
      // Per modifica: recupero dettaglio con documentUrl
      fetch(`/api/staff/${userId}/certifications/${cert.id}`)
        .then((res) => res.json())
        .then((res) => {
          setEditingCert(res.data)
          setDialogKey((k) => k + 1)
          setIsDialogOpen(true)
        })
        .catch(() => {
          // Fallback: usa dati dalla lista
          setEditingCert(cert)
          setDialogKey((k) => k + 1)
          setIsDialogOpen(true)
        })
    } else {
      setEditingCert(null)
      setDialogKey((k) => k + 1)
      setIsDialogOpen(true)
    }
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingCert(null)
  }

  const handleSubmit = (data: {
    type: CertificationType
    obtainedDate: string
    expiryDate: string
    documentUrl?: string | null
  }) => {
    if (editingCert) {
      updateMutation.mutate({
        certId: editingCert.id,
        data: {
          obtainedDate: data.obtainedDate,
          expiryDate: data.expiryDate,
          documentUrl: data.documentUrl,
        },
      })
    } else {
      createMutation.mutate(data)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Certificazioni
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Certificazioni
          </CardTitle>
          {!isReadOnly && (
            <Button
              size="sm"
              onClick={() => handleOpenDialog()}
              disabled={existingTypes.length >= Object.keys(CERTIFICATION_TYPES).length}
            >
              <Plus className="h-4 w-4 mr-1" />
              Aggiungi
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Warning certificazioni obbligatorie mancanti */}
          {missingMandatory.length > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  Certificazioni obbligatorie mancanti
                </p>
                <p className="text-amber-700 dark:text-amber-300 mt-1">
                  {missingMandatory
                    .map((t) => CERTIFICATION_TYPES[t].label)
                    .join(', ')}
                </p>
              </div>
            </div>
          )}

          {/* Lista certificazioni */}
          {certifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nessuna certificazione registrata
            </p>
          ) : (
            <div className="space-y-2">
              {certifications.map((cert) => {
                const status = getCertificationStatus(cert.expiryDate)
                const badgeConfig = STATUS_BADGE[status]

                return (
                  <div
                    key={cert.id}
                    className="flex items-center gap-3 p-3 rounded-md border"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {CERTIFICATION_TYPES[cert.type]?.label || cert.type}
                        </span>
                        <Badge variant={badgeConfig.variant} className="text-xs">
                          {badgeConfig.label}
                        </Badge>
                        {cert.hasDocument && (
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Scadenza: {formatDate(cert.expiryDate)}
                      </p>
                    </div>

                    {!isReadOnly && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleOpenDialog(cert)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(cert.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog creazione/modifica */}
      <CertificationDialog
        key={dialogKey}
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseDialog()
          else setIsDialogOpen(true)
        }}
        certification={editingCert}
        existingTypes={existingTypes}
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      {/* Conferma eliminazione */}
      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina certificazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare questa certificazione? L&apos;azione non
              può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
