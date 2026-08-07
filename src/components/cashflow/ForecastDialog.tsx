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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/lib/constants'
import {
  FORECAST_TYPE_LABELS,
  ForecastType,
  TIPI_PREVISIONE,
  type Previsione,
} from './previsioni'

export interface DatiPrevisione {
  nome: string
  descrizione?: string
  dataInizio: string
  dataFine: string
  saldoIniziale?: number
  tipo: ForecastType
}

interface ForecastDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Deve sollevare un errore se il salvataggio fallisce: il dialog resta aperto. */
  onSubmit: (dati: DatiPrevisione) => Promise<void>
  previsione?: Previsione | null
  /** Saldo di cassa e banca di oggi, da cui la previsione parte se non se ne indica un altro. */
  saldoAttuale?: number
}

function giornoCivile(valore: string | Date | null | undefined): string {
  return valore ? String(valore).slice(0, 10) : ''
}

/** Oggi e fra tre mesi: il periodo che si vuole quasi sempre. */
function periodoPredefinito(): { inizio: string; fine: string } {
  const oggi = new Date()
  const fine = new Date(oggi)
  fine.setMonth(fine.getMonth() + 3)
  return { inizio: giornoCivile(oggi.toISOString()), fine: giornoCivile(fine.toISOString()) }
}

export function ForecastDialog({
  open,
  onOpenChange,
  onSubmit,
  previsione,
  saldoAttuale,
}: ForecastDialogProps) {
  const inModifica = Boolean(previsione)

  const [nome, setNome] = useState('')
  const [descrizione, setDescrizione] = useState('')
  const [dataInizio, setDataInizio] = useState('')
  const [dataFine, setDataFine] = useState('')
  const [saldoIniziale, setSaldoIniziale] = useState('')
  const [tipo, setTipo] = useState<ForecastType>(ForecastType.BASE)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  useEffect(() => {
    if (!open) return
    const predefinito = periodoPredefinito()
    setNome(previsione?.nome ?? '')
    setDescrizione(previsione?.descrizione ?? '')
    setDataInizio(giornoCivile(previsione?.dataInizio) || predefinito.inizio)
    setDataFine(giornoCivile(previsione?.dataFine) || predefinito.fine)
    setSaldoIniziale(previsione ? String(Number(previsione.saldoIniziale)) : '')
    setTipo(previsione?.tipo ?? ForecastType.BASE)
    setErrore(null)
  }, [open, previsione])

  async function salva(evento: React.FormEvent) {
    evento.preventDefault()
    if (inCorso) return

    if (!nome.trim()) {
      setErrore('Il nome è obbligatorio')
      return
    }
    if (!dataInizio || !dataFine) {
      setErrore('Il periodo è obbligatorio')
      return
    }
    if (dataFine < dataInizio) {
      setErrore('La data di fine viene prima di quella di inizio')
      return
    }

    const partenza = saldoIniziale.trim() ? Number(saldoIniziale.replace(',', '.')) : undefined
    if (partenza !== undefined && !Number.isFinite(partenza)) {
      setErrore('Il saldo di partenza non è un numero')
      return
    }

    setErrore(null)
    setInCorso(true)
    try {
      await onSubmit({
        nome: nome.trim(),
        descrizione: descrizione.trim() || undefined,
        dataInizio,
        dataFine,
        saldoIniziale: partenza,
        tipo,
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
          <DialogTitle>{inModifica ? 'Modifica previsione' : 'Nuova previsione'}</DialogTitle>
          <DialogDescription>
            Una previsione è un elenco di entrate e uscite attese in un periodo, con il saldo
            che ne risulta giorno per giorno.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={salva} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome *</Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Autunno 2026"
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dataInizio">Dal *</Label>
              <Input
                id="dataInizio"
                type="date"
                value={dataInizio}
                onChange={(e) => setDataInizio(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dataFine">Al *</Label>
              <Input
                id="dataFine"
                type="date"
                value={dataFine}
                onChange={(e) => setDataFine(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tipo">Scenario</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as ForecastType)}>
              <SelectTrigger id="tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPI_PREVISIONE.map((t) => (
                  <SelectItem key={t} value={t}>
                    {FORECAST_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="saldoIniziale">Saldo di partenza</Label>
            <Input
              id="saldoIniziale"
              inputMode="decimal"
              value={saldoIniziale}
              onChange={(e) => setSaldoIniziale(e.target.value)}
              placeholder={
                saldoAttuale !== undefined ? formatCurrency(saldoAttuale) : 'Liquidità di oggi'
              }
            />
            <p className="text-xs text-muted-foreground">
              Lascialo vuoto per partire dalla liquidità di oggi
              {saldoAttuale !== undefined ? ` (${formatCurrency(saldoAttuale)})` : ''}, la stessa
              cifra della card «Saldo Attuale».
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="descrizione">Note</Label>
            <Textarea
              id="descrizione"
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              rows={2}
            />
          </div>

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
              {inCorso ? 'Salvataggio…' : inModifica ? 'Salva modifiche' : 'Crea previsione'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
