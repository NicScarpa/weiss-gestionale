'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreato: () => void
}

interface ContoBancario {
  id: string
  name: string
}

/** Stessa chiave della Select dei filtri: i conti si leggono una volta sola. */
async function leggiConti(): Promise<ContoBancario[]> {
  const r = await fetch('/api/bank-accounts?type=BANK')
  if (!r.ok) throw new Error('Errore nel recupero dei conti bancari')
  const risposta = await r.json()
  return Array.isArray(risposta?.accounts) ? risposta.accounts : []
}

export function NuovoMovimentoDialog({ open, onOpenChange, onCreato }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Nuovo movimento</DialogTitle>
          <DialogDescription>
            Una riga inserita a mano: entra nell&apos;estratto conto come le altre, con l&apos;etichetta
            «Manuale».
          </DialogDescription>
        </DialogHeader>
        {/* Il modulo vive dentro il dialogo: chiudendolo si smonta, e alla
            riapertura i campi ripartono vuoti senza azzerarli a mano. */}
        <Modulo onOpenChange={onOpenChange} onCreato={onCreato} />
      </DialogContent>
    </Dialog>
  )
}

function Modulo({ onOpenChange, onCreato }: { onOpenChange: (o: boolean) => void; onCreato: () => void }) {
  const { data: conti } = useQuery({ queryKey: ['bank-accounts', 'BANK'], queryFn: leggiConti })

  const [contoId, impostaContoId] = useState('')
  const [data, impostaData] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  // Il caso frequente è un pagamento: partire da «Uscita» risparmia un clic e
  // sbaglia meno di un campo vuoto da riempire per forza.
  const [tipo, impostaTipo] = useState('uscita')
  const [importo, impostaImporto] = useState('')
  const [descrizione, impostaDescrizione] = useState('')
  const [causale, impostaCausale] = useState('')
  const [note, impostaNote] = useState('')
  const [inCorso, impostaInCorso] = useState(false)

  // Un conto solo si sceglie da sé.
  const elenco = conti ?? []
  const contoScelto = contoId || (elenco.length === 1 ? elenco[0].id : '')

  const numero = Number(importo.replace(',', '.'))
  const valido = !!contoScelto && !!data && Number.isFinite(numero) && numero > 0 && !!descrizione.trim()

  async function crea() {
    if (!valido) return
    impostaInCorso(true)
    try {
      const r = await fetch('/api/bank-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankAccountId: contoScelto,
          transactionDate: data,
          amount: tipo === 'uscita' ? -numero : numero,
          descrizione: descrizione.trim(),
          ...(causale.trim() ? { causale: causale.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      })
      const risposta = (await r.json().catch(() => ({}))) as { error?: string }
      if (!r.ok) {
        toast.error(risposta.error ?? 'Creazione non riuscita')
        return
      }
      toast.success('Movimento creato')
      onCreato()
      onOpenChange(false)
    } catch {
      toast.error('Creazione non riuscita')
    } finally {
      impostaInCorso(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="nuovo-conto">Conto bancario</Label>
        <Select value={contoScelto} onValueChange={impostaContoId}>
          <SelectTrigger id="nuovo-conto" className="w-full">
            <SelectValue placeholder="Scegli il conto" />
          </SelectTrigger>
          <SelectContent>
            {elenco.map((conto) => (
              <SelectItem key={conto.id} value={conto.id}>
                {conto.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="nuovo-data">Data</Label>
          <Input
            id="nuovo-data"
            type="date"
            value={data}
            onChange={(e) => impostaData(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nuovo-tipo">Tipo</Label>
          <Select value={tipo} onValueChange={impostaTipo}>
            <SelectTrigger id="nuovo-tipo" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="entrata">Entrata (Accredito)</SelectItem>
              <SelectItem value="uscita">Uscita (Addebito)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="nuovo-importo">Importo</Label>
        {/* Sempre positivo: il verso lo dice «Tipo», così non ci sono due modi
            di scrivere un'uscita (il meno davanti e la scelta) che si
            contraddicono. */}
        <Input
          id="nuovo-importo"
          type="number"
          step="0.01"
          min="0"
          value={importo}
          onChange={(e) => impostaImporto(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="nuovo-descrizione">Descrizione</Label>
        <Input
          id="nuovo-descrizione"
          value={descrizione}
          onChange={(e) => impostaDescrizione(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nuovo-causale">Causale</Label>
        <Input id="nuovo-causale" value={causale} onChange={(e) => impostaCausale(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nuovo-note">Note</Label>
        <Textarea id="nuovo-note" value={note} onChange={(e) => impostaNote(e.target.value)} />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={inCorso}>
          Annulla
        </Button>
        <Button onClick={crea} disabled={!valido || inCorso}>
          Crea
        </Button>
      </DialogFooter>
    </div>
  )
}
