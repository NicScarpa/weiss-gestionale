'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency } from '@/lib/constants'
import { TrendingDown } from 'lucide-react'
import {
  FREQUENZE,
  GIORNI_SETTIMANA,
  NOME_FREQUENZA,
  campoRichiesto,
  descriviRicorrenza,
  quotaMensile,
  type Frequenza,
  type SpesaRicorrente,
} from './frequenza'

export interface DatiSpesa {
  name: string
  description?: string
  amount: number
  frequency: Frequenza
  dayOfMonth?: number
  dayOfWeek?: number
  startDate?: string
  endDate?: string
  category?: string
}

interface RecurringExpenseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Deve sollevare un errore se il salvataggio fallisce: è così che il dialog sa di restare aperto. */
  onSubmit: (dati: DatiSpesa) => Promise<void>
  /** Presente in modifica, assente in creazione. */
  spesa?: SpesaRicorrente | null
}

const GIORNI_DEL_MESE = Array.from({ length: 31 }, (_, i) => i + 1)

/** Una data ISO (o `Date`) ridotta al giorno civile che l'input `date` vuole. */
function giornoCivile(valore: string | null | undefined): string {
  return valore ? String(valore).slice(0, 10) : ''
}

export function RecurringExpenseDialog({
  open,
  onOpenChange,
  onSubmit,
  spesa,
}: RecurringExpenseDialogProps) {
  const inModifica = Boolean(spesa)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [frequency, setFrequency] = useState<Frequenza>('MONTHLY')
  const [dayOfMonth, setDayOfMonth] = useState('1')
  const [dayOfWeek, setDayOfWeek] = useState('1')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [category, setCategory] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  // I campi si riallineano a ogni apertura: un dialog riaperto dopo una
  // modifica mostrava ancora i dati della spesa precedente.
  useEffect(() => {
    if (!open) return
    setName(spesa?.name ?? '')
    setDescription(spesa?.description ?? '')
    setAmount(spesa ? String(Number(spesa.amount)) : '')
    setFrequency(spesa?.frequency ?? 'MONTHLY')
    setDayOfMonth(String(spesa?.dayOfMonth ?? 1))
    setDayOfWeek(String(spesa?.dayOfWeek ?? 1))
    setStartDate(giornoCivile(spesa?.startDate))
    setEndDate(giornoCivile(spesa?.endDate))
    setCategory(spesa?.category ?? '')
    setErrore(null)
  }, [open, spesa])

  const richiesto = campoRichiesto(frequency)
  const importo = Number(amount.replace(',', '.'))
  const importoValido = Number.isFinite(importo) && importo > 0

  const anteprima = importoValido
    ? `${formatCurrency(quotaMensile({ amount: importo, frequency }))} al mese, ${descriviRicorrenza({
        frequency,
        dayOfMonth: Number(dayOfMonth),
        dayOfWeek: Number(dayOfWeek),
      })}`
    : null

  async function salva(evento: React.FormEvent) {
    evento.preventDefault()
    if (inCorso) return

    if (!name.trim()) {
      setErrore('Il nome è obbligatorio')
      return
    }
    if (!importoValido) {
      setErrore("L'importo deve essere maggiore di zero")
      return
    }

    setErrore(null)
    setInCorso(true)
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        amount: importo,
        frequency,
        dayOfMonth: richiesto === 'dayOfMonth' ? Number(dayOfMonth) : undefined,
        dayOfWeek: richiesto === 'dayOfWeek' ? Number(dayOfWeek) : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        category: category.trim() || undefined,
      })
      onOpenChange(false)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Salvataggio non riuscito')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{inModifica ? 'Modifica spesa ricorrente' : 'Nuova spesa ricorrente'}</DialogTitle>
          <DialogDescription>
            Affitto, utenze, rate, canoni: quello che esce con regolarità. La previsione di
            cassa le sottrae al saldo nei giorni in cui cadranno.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={salva} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Affitto locale"
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="amount">Importo *</Label>
              <Input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1200.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="frequency">Frequenza *</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequenza)}>
                <SelectTrigger id="frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENZE.map((f) => (
                    <SelectItem key={f} value={f}>
                      {NOME_FREQUENZA[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {richiesto === 'dayOfMonth' && (
            <div className="space-y-2">
              <Label htmlFor="dayOfMonth">Giorno del mese *</Label>
              <Select value={dayOfMonth} onValueChange={setDayOfMonth}>
                <SelectTrigger id="dayOfMonth">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GIORNI_DEL_MESE.map((g) => (
                    <SelectItem key={g} value={String(g)}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {Number(dayOfMonth) > 28 && (
                <p className="text-xs text-amber-600">
                  Nei mesi più corti del giorno {dayOfMonth} la spesa non viene conteggiata.
                </p>
              )}
              {/* Per trimestrale e annuale il giorno non basta: serve sapere in
                  quale mese cade, e quel mese è quello da cui la spesa è attiva. */}
              {(frequency === 'YEARLY' || frequency === 'QUARTERLY') && (
                <p className="text-xs text-muted-foreground">
                  Il mese lo decide la data «Attiva dal»
                  {startDate ? '' : ': indicala qui sotto, altrimenti si parte da gennaio'}.
                </p>
              )}
            </div>
          )}

          {richiesto === 'dayOfWeek' && (
            <div className="space-y-2">
              <Label htmlFor="dayOfWeek">Giorno della settimana *</Label>
              <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                <SelectTrigger id="dayOfWeek">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GIORNI_SETTIMANA.map((giorno, indice) => (
                    <SelectItem key={giorno} value={String(indice)}>
                      {giorno.charAt(0).toUpperCase() + giorno.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="startDate">Attiva dal</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">Fino al</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Categoria</Label>
            <Input
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Utenze, Locazioni, Personale…"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Note</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {anteprima && (
            <p className="flex items-start gap-2 rounded-md bg-muted p-3 text-sm">
              <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>
                Peserà sulla previsione di cassa per <strong>{anteprima}</strong>.
              </span>
            </p>
          )}

          {errore && (
            <p role="alert" className="text-sm font-medium text-red-600">
              {errore}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={inCorso}>
              {inCorso ? 'Salvataggio…' : inModifica ? 'Salva modifiche' : 'Aggiungi spesa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
