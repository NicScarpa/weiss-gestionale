"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  ScheduleRule,
  ScheduleRuleDirection,
  ScheduleDocumentType,
  SchedulePaymentMethod,
  SCHEDULE_DOCUMENT_TYPE_LABELS,
  SCHEDULE_PAYMENT_METHOD_LABELS,
} from '@/types/schedule'
import { ChevronDown, Search, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Account {
  id: string
  code: string
  name: string
  type: string
}

interface CreateRulePageProps {
  direzione: ScheduleRuleDirection
  initialData?: ScheduleRule
}

export function CreateRulePage({ direzione, initialData }: CreateRulePageProps) {
  const router = useRouter()

  const [tipoDocumento, setTipoDocumento] = useState<string>(initialData?.tipoDocumento || '')
  const [tipoPagamento, setTipoPagamento] = useState<string>(initialData?.tipoPagamento || '')
  const [contoId, setContoId] = useState<string>(initialData?.contoId || '')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountSearch, setAccountSearch] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [docOpen, setDocOpen] = useState(true)
  const [pagOpen, setPagOpen] = useState(true)
  const [actionOpen, setActionOpen] = useState(true)

  const isEditing = !!initialData

  useEffect(() => {
    fetch('/api/accounts')
      .then(res => res.json())
      .then(data => setAccounts(data.accounts || []))
      .catch(() => {})
  }, [])

  const filteredAccounts = accounts.filter(a =>
    !accountSearch ||
    a.name.toLowerCase().includes(accountSearch.toLowerCase()) ||
    a.code.toLowerCase().includes(accountSearch.toLowerCase())
  )

  const canSubmit = (tipoDocumento || tipoPagamento) && contoId

  const handleSubmit = async () => {
    if (!canSubmit) return
    setIsSubmitting(true)

    try {
      const url = isEditing
        ? `/api/scadenzario/regole/${initialData!.id}`
        : '/api/scadenzario/regole'

      const method = isEditing ? 'PATCH' : 'POST'

      const body = isEditing
        ? {
            tipoDocumento: tipoDocumento || null,
            tipoPagamento: tipoPagamento || null,
            contoId,
          }
        : {
            direzione,
            tipoDocumento: tipoDocumento || undefined,
            tipoPagamento: tipoPagamento || undefined,
            contoId,
          }

      const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (resp.ok) {
        toast.success(isEditing ? 'Regola aggiornata' : 'Regola creata')
        router.push('/scadenzario/regole')
      } else {
        const err = await resp.json()
        toast.error(err.error || 'Errore nel salvataggio')
      }
    } catch {
      toast.error('Errore nel salvataggio della regola')
    }

    setIsSubmitting(false)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Torna alle regole
        </button>
        <h1 className="text-2xl font-bold tracking-tight">
          {isEditing ? 'Modifica regola' : 'Crea una regola'}
        </h1>
        <p className="text-muted-foreground mt-1">
          Imposta le azioni che verranno applicate automaticamente alle scadenze che corrispondono ai criteri selezionati.
        </p>
      </div>

      {/* Sezione Criteri */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Criteri di corrispondenza</h2>
        <p className="text-sm text-muted-foreground">
          Seleziona almeno un criterio. La regola si attiverà quando una scadenza corrisponde.
        </p>

        {/* Tipo documento */}
        <Collapsible open={docOpen} onOpenChange={setDocOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-muted/50 rounded-lg hover:bg-muted/80 transition-colors">
            <div className="text-left">
              <p className="font-medium text-sm">Tipo documento</p>
              <p className="text-xs text-muted-foreground">
                Filtra per tipo di documento della scadenza
              </p>
            </div>
            <ChevronDown className={cn("h-4 w-4 transition-transform", docOpen && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 px-1">
            <Label className="text-sm text-muted-foreground">Tipo documento</Label>
            <Select
              value={tipoDocumento || '__none__'}
              onValueChange={(v) => setTipoDocumento(v === '__none__' ? '' : v)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Seleziona tipo documento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Qualsiasi</SelectItem>
                {Object.entries(SCHEDULE_DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CollapsibleContent>
        </Collapsible>

        {/* Tipo pagamento */}
        <Collapsible open={pagOpen} onOpenChange={setPagOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-muted/50 rounded-lg hover:bg-muted/80 transition-colors">
            <div className="text-left">
              <p className="font-medium text-sm">Tipo pagamento</p>
              <p className="text-xs text-muted-foreground">
                Filtra per metodo di pagamento della scadenza
              </p>
            </div>
            <ChevronDown className={cn("h-4 w-4 transition-transform", pagOpen && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 px-1">
            <Label className="text-sm text-muted-foreground">Tipo pagamento</Label>
            <Select
              value={tipoPagamento || '__none__'}
              onValueChange={(v) => setTipoPagamento(v === '__none__' ? '' : v)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Seleziona tipo pagamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Qualsiasi</SelectItem>
                {Object.entries(SCHEDULE_PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Sezione Azioni */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Scegli azioni da applicare</h2>

        <Collapsible open={actionOpen} onOpenChange={setActionOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-muted/50 rounded-lg hover:bg-muted/80 transition-colors">
            <div className="text-left">
              <p className="font-medium text-sm">Crea e riconcilia automaticamente un movimento</p>
              <p className="text-xs text-muted-foreground">
                Seleziona il conto su cui verrà creato il movimento
              </p>
            </div>
            <ChevronDown className={cn("h-4 w-4 transition-transform", actionOpen && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 space-y-3">
            {/* Barra ricerca conti */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca conto..."
                className="pl-9"
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
              />
            </div>

            {/* Lista conti */}
            <div className="border rounded-lg max-h-64 overflow-y-auto divide-y">
              {filteredAccounts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nessun conto trovato
                </p>
              ) : (
                filteredAccounts.map((account) => {
                  const isSelected = contoId === account.id
                  const initials = account.code.slice(0, 2).toUpperCase()
                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => setContoId(isSelected ? '' : account.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                        isSelected && "bg-slate-900 text-white hover:bg-slate-800"
                      )}
                    >
                      <div className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0",
                        isSelected
                          ? "bg-white/20 text-white"
                          : "bg-slate-100 text-slate-600"
                      )}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-medium truncate", isSelected && "text-white")}>
                          {account.name}
                        </p>
                        <p className={cn("text-xs", isSelected ? "text-white/70" : "text-muted-foreground")}>
                          {account.code} | (EUR)
                        </p>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t">
        <Button variant="outline" onClick={() => router.back()}>
          Annulla
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit || isSubmitting}
        >
          {isSubmitting
            ? 'Salvataggio...'
            : isEditing
              ? 'Salva regola'
              : 'Crea la regola'
          }
        </Button>
      </div>
    </div>
  )
}
