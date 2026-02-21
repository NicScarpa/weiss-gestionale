'use client'

import * as React from 'react'
import { useState, useCallback, useEffect, useRef } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Progress } from '@/components/ui/progress'
import {
    UploadIcon,
    CheckCircle2Icon,
    FileTextIcon,
    Loader2Icon,
    XCircleIcon,
    AlertTriangleIcon,
    FileIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { extractXmlFromP7m, isP7mFile } from '@/lib/p7m-utils'

interface FileImportStatus {
    fileName: string
    status: 'pending' | 'parsing' | 'importing' | 'success' | 'error' | 'duplicate'
    error?: string
    invoiceNumber?: string
    supplierName?: string
    totalAmount?: number
}

interface CaricaFattureDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onImportComplete?: () => void
}

export function CaricaFattureDialog({
    open,
    onOpenChange,
    onImportComplete,
}: CaricaFattureDialogProps) {
    const [files, setFiles] = useState<File[]>([])
    const [fileStatuses, setFileStatuses] = useState<FileImportStatus[]>([])
    const [isProcessing, setIsProcessing] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [isComplete, setIsComplete] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Reset state when dialog opens/closes
    useEffect(() => {
        if (!open) {
            setTimeout(() => {
                setFiles([])
                setFileStatuses([])
                setIsProcessing(false)
                setIsComplete(false)
            }, 300)
        }
    }, [open])

    const handleFileSelect = useCallback((selectedFiles: FileList | File[]) => {
        const validFiles: File[] = []
        const validExtensions = ['.xml', '.p7m']

        Array.from(selectedFiles).forEach(file => {
            const ext = '.' + file.name.split('.').pop()?.toLowerCase()
            const isP7m = file.name.toLowerCase().endsWith('.xml.p7m') || ext === '.p7m'
            if (validExtensions.includes(ext) || isP7m) {
                validFiles.push(file)
            }
        })

        if (validFiles.length === 0) {
            toast.error('Nessun file valido. Seleziona file XML o P7M.')
            return
        }

        setFiles(prev => [...prev, ...validFiles])
        setFileStatuses(prev => [
            ...prev,
            ...validFiles.map(f => ({
                fileName: f.name,
                status: 'pending' as const,
            })),
        ])
    }, [])

    // Handle drag and drop
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        handleFileSelect(e.dataTransfer.files)
    }

    // Remove a file from the list
    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index))
        setFileStatuses(prev => prev.filter((_, i) => i !== index))
    }

    // Process all files
    const processFiles = async () => {
        setIsProcessing(true)

        for (let i = 0; i < files.length; i++) {
            const file = files[i]

            // Update status to parsing
            setFileStatuses(prev =>
                prev.map((s, idx) => idx === i ? { ...s, status: 'parsing' } : s)
            )

            try {
                // Read file content
                let xmlContent: string

                if (isP7mFile(file.name)) {
                    // Extract XML from P7M
                    const buffer = await file.arrayBuffer()
                    xmlContent = extractXmlFromP7m(buffer)
                } else {
                    xmlContent = await file.text()
                }

                // First parse for preview info
                const parseRes = await fetch('/api/invoices/parse', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        xmlContent,
                        fileName: file.name,
                    }),
                })

                if (!parseRes.ok) {
                    const err = await parseRes.json()
                    throw new Error(err.error || 'Errore nel parsing')
                }

                const parseData = await parseRes.json()

                // Update status with preview info
                setFileStatuses(prev =>
                    prev.map((s, idx) => idx === i ? {
                        ...s,
                        status: 'importing',
                        invoiceNumber: parseData.parsed?.numero,
                        supplierName: parseData.parsed?.fornitore?.denominazione,
                        totalAmount: parseData.parsed?.importi?.totalAmount,
                    } : s)
                )

                // Check if already exists
                if (parseData.existingInvoice) {
                    setFileStatuses(prev =>
                        prev.map((s, idx) => idx === i ? {
                            ...s,
                            status: 'duplicate',
                            error: `Fattura già importata (${parseData.existingInvoice.status})`,
                        } : s)
                    )
                    continue
                }

                // Import the invoice
                const importRes = await fetch('/api/invoices', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        xmlContent,
                        fileName: file.name,
                        venueId: 'auto', // Will be overridden by API
                        createSupplier: true, // Auto-create supplier if not found
                        supplierId: parseData.supplierMatch?.supplier?.id || undefined,
                        supplierData: parseData.supplierMatch?.suggestedData || undefined,
                        accountId: parseData.suggestedAccount?.id || undefined,
                    }),
                })

                if (!importRes.ok) {
                    const err = await importRes.json()
                    if (importRes.status === 409) {
                        // Duplicate
                        setFileStatuses(prev =>
                            prev.map((s, idx) => idx === i ? {
                                ...s,
                                status: 'duplicate',
                                error: 'Fattura già importata',
                            } : s)
                        )
                        continue
                    }
                    throw new Error(err.error || 'Errore nell\'import')
                }

                // Success
                setFileStatuses(prev =>
                    prev.map((s, idx) => idx === i ? { ...s, status: 'success' } : s)
                )
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Errore sconosciuto'
                setFileStatuses(prev =>
                    prev.map((s, idx) => idx === i ? { ...s, status: 'error', error: message } : s)
                )
            }
        }

        setIsProcessing(false)
        setIsComplete(true)
        onImportComplete?.()
    }

    // Summary counts
    const successCount = fileStatuses.filter(s => s.status === 'success').length
    const errorCount = fileStatuses.filter(s => s.status === 'error').length
    const duplicateCount = fileStatuses.filter(s => s.status === 'duplicate').length
    const progressPercent = files.length > 0
        ? (fileStatuses.filter(s => ['success', 'error', 'duplicate'].includes(s.status)).length / files.length) * 100
        : 0

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('it-IT', {
            style: 'currency',
            currency: 'EUR',
        }).format(amount)
    }

    const getStatusIcon = (status: FileImportStatus['status']) => {
        switch (status) {
            case 'pending':
                return <FileIcon className="h-4 w-4 text-muted-foreground" />
            case 'parsing':
            case 'importing':
                return <Loader2Icon className="h-4 w-4 text-blue-500 animate-spin" />
            case 'success':
                return <CheckCircle2Icon className="h-4 w-4 text-green-500" />
            case 'duplicate':
                return <AlertTriangleIcon className="h-4 w-4 text-amber-500" />
            case 'error':
                return <XCircleIcon className="h-4 w-4 text-red-500" />
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[580px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-lg">
                        <FileTextIcon className="h-5 w-5 text-primary" />
                        Carica fatture
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5">
                    {/* Info text */}
                    <p className="text-sm text-muted-foreground">
                        Carica i file XML delle fatture elettroniche esportati dal cassetto fiscale.
                        Sono supportati anche i file firmati (.p7m).
                    </p>

                    {/* Drop Zone - only show if not processing */}
                    {!isProcessing && !isComplete && (
                        <div
                            className={cn(
                                'relative border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer',
                                'hover:border-primary/50 hover:bg-primary/5',
                                isDragging && 'border-primary bg-primary/10 scale-[1.02]',
                            )}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xml,.p7m"
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                    if (e.target.files) handleFileSelect(e.target.files)
                                    e.target.value = '' // Reset to allow re-selection
                                }}
                            />

                            <div className="space-y-3">
                                <div className="flex items-center justify-center gap-3">
                                    <div className="relative">
                                        <FileTextIcon className="h-12 w-12 text-muted-foreground/40" />
                                        <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                                            <UploadIcon className="h-3 w-3" />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <p className="font-medium text-sm">Scegli i file o trascinali qui</p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Formati supportati: .xml, .xml.p7m
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* File List */}
                    {fileStatuses.length > 0 && (
                        <div className="border rounded-lg overflow-hidden">
                            {isProcessing && (
                                <div className="px-4 py-2 bg-muted/50">
                                    <Progress value={progressPercent} className="h-1.5" />
                                </div>
                            )}
                            <div className="max-h-[300px] overflow-y-auto divide-y">
                                {fileStatuses.map((fs, i) => (
                                    <div
                                        key={i}
                                        className={cn(
                                            'flex items-center gap-3 px-4 py-3 text-sm',
                                            fs.status === 'error' && 'bg-red-50/50',
                                            fs.status === 'duplicate' && 'bg-amber-50/50',
                                            fs.status === 'success' && 'bg-green-50/50',
                                        )}
                                    >
                                        {getStatusIcon(fs.status)}
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate text-xs">{fs.fileName}</p>
                                            {fs.invoiceNumber && (
                                                <p className="text-xs text-muted-foreground">
                                                    {fs.supplierName} • N. {fs.invoiceNumber}
                                                    {fs.totalAmount != null && ` • ${formatCurrency(fs.totalAmount)}`}
                                                </p>
                                            )}
                                            {fs.error && (
                                                <p className="text-xs text-red-600">{fs.error}</p>
                                            )}
                                        </div>
                                        {!isProcessing && !isComplete && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    removeFile(i)
                                                }}
                                                className="text-muted-foreground hover:text-foreground p-1"
                                            >
                                                <XCircleIcon className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Summary */}
                    {isComplete && (
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                                <p className="text-2xl font-bold text-green-600">{successCount}</p>
                                <p className="text-xs text-green-700">Importate</p>
                            </div>
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                                <p className="text-2xl font-bold text-amber-600">{duplicateCount}</p>
                                <p className="text-xs text-amber-700">Duplicate</p>
                            </div>
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                                <p className="text-2xl font-bold text-red-600">{errorCount}</p>
                                <p className="text-xs text-red-700">Errori</p>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between">
                        {isComplete ? (
                            <div className="flex-1 flex justify-end">
                                <Button onClick={() => onOpenChange(false)}>Chiudi</Button>
                            </div>
                        ) : (
                            <>
                                <span className="text-xs text-muted-foreground">
                                    {files.length > 0 ? `${files.length} file selezionati` : ''}
                                </span>
                                <Button
                                    onClick={processFiles}
                                    disabled={files.length === 0 || isProcessing}
                                >
                                    {isProcessing ? (
                                        <>
                                            <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
                                            Importazione in corso...
                                        </>
                                    ) : (
                                        `Importa ${files.length > 0 ? files.length : ''} fattur${files.length === 1 ? 'a' : 'e'}`
                                    )}
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
