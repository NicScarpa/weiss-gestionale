'use client'

import * as React from 'react'
import { useState, useEffect, useRef } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
    UploadIcon,
    CheckCircle2Icon,
    FileSpreadsheetIcon,
    Loader2Icon,
    XCircleIcon,
    EyeIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ImportResult } from '@/types/reconciliation'

interface CaricaMovimentiDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onImportComplete?: () => void
}

type Step = 'upload' | 'result'

export function CaricaMovimentiDialog({
    open,
    onOpenChange,
    onImportComplete,
}: CaricaMovimentiDialogProps) {
    const [step, setStep] = useState<Step>('upload')
    const [isDragging, setIsDragging] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [uploadResult, setUploadResult] = useState<ImportResult | null>(null)
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Reset state when dialog opens/closes
    useEffect(() => {
        if (!open) {
            setTimeout(() => {
                setStep('upload')
                setSelectedFile(null)
                setUploadResult(null)
                setIsUploading(false)
            }, 300)
        }
    }, [open])

    // Handle file selection
    const handleFileSelect = (file: File) => {
        const validExtensions = ['.csv', '.xls', '.xlsx', '.txt']
        const ext = '.' + file.name.split('.').pop()?.toLowerCase()
        if (!validExtensions.includes(ext)) {
            toast.error('Formato non supportato. Usa CSV, XLS, XLSX o TXT.')
            return
        }
        setSelectedFile(file)
    }

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
        const file = e.dataTransfer.files[0]
        if (file) handleFileSelect(file)
    }

    // Upload file
    const handleUpload = async () => {
        if (!selectedFile) return
        setIsUploading(true)

        try {
            const formData = new FormData()
            formData.append('file', selectedFile)

            // Upload to bank-transactions import API
            const res = await fetch('/api/bank-transactions/import', {
                method: 'POST',
                body: formData,
            })

            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || 'Errore durante l\'importazione')
            }

            const result: ImportResult = await res.json()
            setUploadResult(result)
            setStep('result')

            // Now convert imported bank transactions to journal entries
            if (result.recordsImported > 0) {
                try {
                    await fetch('/api/prima-nota/import', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ batchId: result.batchId }),
                    })
                } catch {
                    // Journal entry creation is secondary - log but don't block
                    console.warn('Could not auto-create journal entries from imported transactions')
                }
            }

            toast.success(`${result.recordsImported} movimenti importati`)
            onImportComplete?.()
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Errore sconosciuto'
            toast.error(message)
        } finally {
            setIsUploading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-lg">
                        <FileSpreadsheetIcon className="h-5 w-5 text-primary" />
                        {step === 'result' ? 'Importazione completata' : 'Carica movimenti'}
                    </DialogTitle>
                </DialogHeader>

                {/* Step 1: File Upload */}
                {step === 'upload' && (
                    <div className="space-y-5">
                        <p className="text-sm text-muted-foreground">
                            Carica un file CSV o Excel per iniziare il processo di importazione
                        </p>

                        {/* Duplicate Warning */}
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
                            <div className="flex items-center gap-2">
                                <EyeIcon className="h-4 w-4 text-amber-600" />
                                <span className="font-semibold text-sm text-amber-800">
                                    Occhio ai duplicati! 👀
                                </span>
                            </div>
                            <p className="text-sm text-amber-700">
                                L&apos;app non rileva le transazioni duplicate. Verifica con attenzione prima di confermare.
                            </p>
                        </div>

                        {/* Drop Zone */}
                        <div
                            className={cn(
                                'relative border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer',
                                'hover:border-primary/50 hover:bg-primary/5',
                                isDragging && 'border-primary bg-primary/10 scale-[1.02]',
                                selectedFile && 'border-green-400 bg-green-50'
                            )}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv,.xls,.xlsx,.txt"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) handleFileSelect(file)
                                }}
                            />

                            {selectedFile ? (
                                <div className="space-y-2">
                                    <CheckCircle2Icon className="h-10 w-10 mx-auto text-green-500" />
                                    <p className="font-medium text-green-700">{selectedFile.name}</p>
                                    <p className="text-xs text-green-600">
                                        {(selectedFile.size / 1024).toFixed(1)} KB • Clicca per cambiare file
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-center gap-3">
                                        <div className="relative">
                                            <FileSpreadsheetIcon className="h-12 w-12 text-muted-foreground/40" />
                                            <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                                                <UploadIcon className="h-3 w-3" />
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <p className="font-medium text-sm">Scegli un file o trascinalo qui</p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Formati supportati: .csv, .xls, .xlsx, .txt
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end">
                            <Button
                                onClick={handleUpload}
                                disabled={!selectedFile || isUploading}
                            >
                                {isUploading ? (
                                    <>
                                        <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
                                        Importazione in corso...
                                    </>
                                ) : (
                                    'Importa movimenti'
                                )}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Step 2: Result */}
                {step === 'result' && uploadResult && (
                    <div className="space-y-5">
                        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center space-y-3">
                            <CheckCircle2Icon className="h-12 w-12 mx-auto text-green-500" />
                            <div>
                                <p className="text-lg font-semibold text-green-800">
                                    Importazione completata!
                                </p>
                                <p className="text-sm text-green-600 mt-1">
                                    I movimenti sono stati importati con successo
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-muted/50 rounded-lg p-3 text-center">
                                <p className="text-2xl font-bold text-green-600">
                                    {uploadResult.recordsImported}
                                </p>
                                <p className="text-xs text-muted-foreground">Importati</p>
                            </div>
                            <div className="bg-muted/50 rounded-lg p-3 text-center">
                                <p className="text-2xl font-bold text-amber-600">
                                    {uploadResult.duplicatesSkipped}
                                </p>
                                <p className="text-xs text-muted-foreground">Duplicati</p>
                            </div>
                            <div className="bg-muted/50 rounded-lg p-3 text-center">
                                <p className="text-2xl font-bold text-red-600">
                                    {uploadResult.errors.length}
                                </p>
                                <p className="text-xs text-muted-foreground">Errori</p>
                            </div>
                        </div>

                        {/* Errors detail */}
                        {uploadResult.errors.length > 0 && (
                            <div className="border border-red-200 rounded-lg overflow-hidden">
                                <div className="bg-red-50 px-3 py-2 flex items-center gap-2">
                                    <XCircleIcon className="h-4 w-4 text-red-500" />
                                    <span className="text-sm font-medium text-red-800">Dettaglio errori</span>
                                </div>
                                <div className="max-h-[150px] overflow-y-auto divide-y divide-red-100">
                                    {uploadResult.errors.slice(0, 10).map((err, i) => (
                                        <div key={i} className="px-3 py-2 text-xs text-red-700">
                                            <span className="font-medium">Riga {err.row}:</span>{' '}
                                            {err.message}
                                            {err.value && (
                                                <span className="text-red-500"> ({err.value})</span>
                                            )}
                                        </div>
                                    ))}
                                    {uploadResult.errors.length > 10 && (
                                        <div className="px-3 py-2 text-xs text-red-500 font-medium">
                                            ...e altri {uploadResult.errors.length - 10} errori
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end">
                            <Button onClick={() => onOpenChange(false)}>
                                Chiudi
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
