'use client'

import { useState } from 'react'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { RigaEstrattoConto } from '@/types/reconciliation'
import { CronologiaModifiche } from './CronologiaModifiche'

interface Props {
  riga: RigaEstrattoConto | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onSalvata: () => void
}

/**
 * La banca dà un giorno, non un istante: la data si prende com'è scritta,
 * senza passare per il fuso locale. Un `new Date(...)` formattato in locale
 * sposterebbe di un giorno chi legge a ovest di Greenwich.
 */
function perInput(valore: Date | string | null): string {
  if (!valore) return ''
  const testo = typeof valore === 'string' ? valore : valore.toISOString()
  return testo.slice(0, 10)
}

/** Il testo ripulito, o `null`: è la forma che la PATCH si aspetta. */
const ripulito = (v: string) => v.trim() || null

function DallaBanca() {
  return <span className="text-xs text-muted-foreground">dalla banca</span>
}

export function ModificaMovimentoDialog({ riga, open, onOpenChange, onSalvata }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Modifica movimento</DialogTitle>
          <DialogDescription>
            {riga?.importSource === 'MANUAL'
              ? 'La riga è stata inserita a mano: si modifica per intero.'
              : 'Descrizione, causale e note si modificano; data, importo e conto restano quelli della banca.'}
          </DialogDescription>
        </DialogHeader>
        {/* Il `key` fa ripartire i campi dai valori della riga nuova: senza,
            servirebbe un effetto che li reimposta a ogni cambio di riga. */}
        {riga && (
          <Modulo key={riga.id} riga={riga} onOpenChange={onOpenChange} onSalvata={onSalvata} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Modulo({
  riga,
  onOpenChange,
  onSalvata,
}: {
  riga: RigaEstrattoConto
  onOpenChange: (o: boolean) => void
  onSalvata: () => void
}) {
  const manuale = riga.importSource === 'MANUAL'
  const cestinato = !!riga.deletedAt
  const iniziale = {
    data: perInput(riga.transactionDate),
    dataValuta: perInput(riga.valueDate),
    tipo: riga.amount < 0 ? 'uscita' : 'entrata',
    importo: String(Math.abs(riga.amount)),
    descrizione: riga.descrizione ?? riga.description ?? '',
    causale: riga.causale ?? '',
    note: riga.note ?? '',
  }

  const [data, impostaData] = useState(iniziale.data)
  const [dataValuta, impostaDataValuta] = useState(iniziale.dataValuta)
  const [tipo, impostaTipo] = useState(iniziale.tipo)
  const [importo, impostaImporto] = useState(iniziale.importo)
  const [descrizione, impostaDescrizione] = useState(iniziale.descrizione)
  const [causale, impostaCausale] = useState(iniziale.causale)
  const [note, impostaNote] = useState(iniziale.note)
  const [inCorso, impostaInCorso] = useState(false)

  async function salva() {
    // Solo ciò che è cambiato: la rotta registra in cronologia ogni campo che
    // riceve, e rimandare un valore identico scriverebbe una modifica che non
    // è avvenuta.
    const corpo: Record<string, unknown> = {}
    if (ripulito(descrizione) !== ripulito(iniziale.descrizione)) corpo.descrizione = ripulito(descrizione)
    if (ripulito(causale) !== ripulito(iniziale.causale)) corpo.causale = ripulito(causale)
    if (ripulito(note) !== ripulito(iniziale.note)) corpo.note = ripulito(note)

    if (manuale) {
      if (data !== iniziale.data) {
        if (!data) {
          toast.error('La data non può restare vuota')
          return
        }
        corpo.transactionDate = data
      }
      if (dataValuta !== iniziale.dataValuta) corpo.valueDate = dataValuta || null
      const numero = Number(importo.replace(',', '.'))
      if (!Number.isFinite(numero) || numero === 0) {
        toast.error("L'importo dev'essere un numero diverso da zero")
        return
      }
      const firmato = tipo === 'uscita' ? -Math.abs(numero) : Math.abs(numero)
      if (firmato !== riga.amount) corpo.amount = firmato
    }

    if (Object.keys(corpo).length === 0) {
      onOpenChange(false)
      return
    }

    impostaInCorso(true)
    try {
      const r = await fetch(`/api/bank-transactions/${riga.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      const risposta = (await r.json().catch(() => ({}))) as { error?: string }
      if (!r.ok) {
        toast.error(risposta.error ?? 'Modifica non riuscita')
        return
      }
      toast.success('Movimento aggiornato')
      onSalvata()
      onOpenChange(false)
    } catch {
      toast.error('Modifica non riuscita')
    } finally {
      impostaInCorso(false)
    }
  }

  return (
    // La prima scheda non si chiama «Descrizione» come il campo che contiene:
    // il pannello prende il nome dalla sua linguetta (`aria-labelledby`), e
    // due elementi con lo stesso nome accessibile rendono ambiguo sia il test
    // sia il lettore di schermo.
    <Tabs defaultValue="movimento">
      <TabsList>
        <TabsTrigger value="movimento">Movimento</TabsTrigger>
        <TabsTrigger value="cronologia">Cronologia modifiche</TabsTrigger>
      </TabsList>

      <TabsContent value="movimento" className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="modifica-data">Data</Label>
            <Input
              id="modifica-data"
              type="date"
              value={data}
              readOnly={!manuale}
              onChange={(e) => impostaData(e.target.value)}
            />
            {!manuale && <DallaBanca />}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="modifica-data-valuta">Data valuta</Label>
            <Input
              id="modifica-data-valuta"
              type="date"
              value={dataValuta}
              readOnly={!manuale}
              onChange={(e) => impostaDataValuta(e.target.value)}
            />
            {!manuale && <DallaBanca />}
          </div>

          <div className="space-y-1.5">
            {manuale ? (
              <>
                <Label htmlFor="modifica-tipo">Tipo</Label>
                <Select value={tipo} onValueChange={impostaTipo}>
                  <SelectTrigger id="modifica-tipo" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entrata">Entrata (Accredito)</SelectItem>
                    <SelectItem value="uscita">Uscita (Addebito)</SelectItem>
                  </SelectContent>
                </Select>
              </>
            ) : (
              <>
                <span className="text-sm font-medium">Tipo</span>
                <p className="text-sm">
                  {riga.amount < 0 ? 'Uscita (Addebito)' : 'Entrata (Accredito)'}
                </p>
                <DallaBanca />
              </>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="modifica-importo">Importo</Label>
            <Input
              id="modifica-importo"
              type="number"
              step="0.01"
              value={importo}
              readOnly={!manuale}
              onChange={(e) => impostaImporto(e.target.value)}
            />
            {!manuale && <DallaBanca />}
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium">Conto</span>
          <p className="text-sm">{riga.bankAccount?.name ?? '—'}</p>
          {!manuale && <DallaBanca />}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="modifica-descrizione">Descrizione</Label>
          <Input
            id="modifica-descrizione"
            value={descrizione}
            onChange={(e) => impostaDescrizione(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="modifica-causale">Causale</Label>
          <Input
            id="modifica-causale"
            value={causale}
            onChange={(e) => impostaCausale(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="modifica-note">Note</Label>
          <Textarea id="modifica-note" value={note} onChange={(e) => impostaNote(e.target.value)} />
        </div>

        {/* Il testo originale resta visibile: la descrizione si può riscrivere,
            ma ciò che la banca ha mandato non si perde. */}
        <p className="text-xs text-muted-foreground">Testo della banca: {riga.description}</p>

        {/* Dal Cestino la rotta non vede più la riga e risponderebbe «non
            trovato»: meglio dire prima che la strada è il ripristino, invece
            di offrire un «Salva» che fallisce. */}
        {cestinato && (
          <p className="text-sm text-muted-foreground">
            Il movimento è nel Cestino: ripristinalo per poterlo modificare.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={inCorso}>
            Annulla
          </Button>
          <Button onClick={salva} disabled={inCorso || cestinato}>
            Salva
          </Button>
        </DialogFooter>
      </TabsContent>

      <TabsContent value="cronologia">
        <CronologiaModifiche bankTransactionId={riga.id} />
      </TabsContent>
    </Tabs>
  )
}
