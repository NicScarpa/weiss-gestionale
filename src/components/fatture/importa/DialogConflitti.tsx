'use client'

/**
 * Finestra che mostra i conflitti fra i termini di pagamento del file e
 * quelli concordati in anagrafica, e chiede all'utente quale lato deve
 * vincere — fornitore per fornitore o in blocco.
 *
 * È l'idea più matura vista nel flusso del competitor, e il motivo per cui
 * viene copiata qui: quando file e anagrafica non concordano, il prodotto
 * *chiede* invece di far vincere un lato in silenzio.
 *
 * `giorniDalFile` su un conflitto è il valore della prima fattura di quel
 * fornitore (deciso nel Task 5): se due fatture dello stesso fornitore
 * implicano termini diversi, qui se ne vede solo uno. Questa finestra sceglie
 * solo *quale lato vince*; la scelta viene poi applicata fattura per
 * fattura, ciascuna con il proprio valore, a valle nel Task 11.
 *
 * `aliquote` è solo contesto mostrato accanto ai termini: non esiste
 * un'aliquota IVA predefinita per fornitore in questo sistema, quindi non
 * c'è nulla con cui confrontarla.
 */
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export interface ConflittoTermini {
  partitaIva: string
  denominazione: string
  giorniDalFile: number
  giorniAnagrafica: number
  /** Solo contesto da mostrare accanto ai termini: non entra nel confronto. */
  aliquote: number[]
  chiavi: string[]
}

export type SceltaConflitto = 'importazione' | 'anagrafica'

interface Props {
  aperto: boolean
  conflitti: ConflittoTermini[]
  onAnnulla: () => void
  onContinua: (scelte: Record<string, SceltaConflitto>) => void // chiave = partita IVA
}

const giorniInParole = (giorni: number) =>
  giorni === 1 ? '1 giorno data fattura' : `${giorni} giorni data fattura`

export function DialogConflitti({ aperto, conflitti, onAnnulla, onContinua }: Props) {
  // Si tiene in stato solo ciò che l'utente ha scelto esplicitamente (righe
  // toccate o selezione massiva). La scelta per un fornitore non ancora
  // toccato è sempre «importazione», derivata al momento di leggerla — mai
  // salvata come stato iniziale, così non serve un effect per ricostruirla
  // quando la lista dei conflitti cambia da un caricamento all'altro.
  const [scelteUtente, setScelteUtente] = useState<Record<string, SceltaConflitto>>({})

  const totaleFatture = conflitti.reduce((somma, c) => somma + c.chiavi.length, 0)

  const scelte = Object.fromEntries(
    conflitti.map((c) => [c.partitaIva, scelteUtente[c.partitaIva] ?? 'importazione'])
  )

  const impostaTutti = (scelta: SceltaConflitto) => {
    setScelteUtente(Object.fromEntries(conflitti.map((c) => [c.partitaIva, scelta])))
  }

  return (
    <Dialog open={aperto} onOpenChange={(valore) => !valore && onAnnulla()}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Termini di pagamento in conflitto</DialogTitle>
          <DialogDescription>
            Trovate {totaleFatture} fatture con valori in conflitto. Per alcuni fornitori i
            termini di pagamento del file non corrispondono a quelli concordati in anagrafica.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Selezione massiva:</span>
          <Button variant="outline" size="sm" onClick={() => impostaTutti('importazione')}>
            Tutti Importazione
          </Button>
          <Button variant="outline" size="sm" onClick={() => impostaTutti('anagrafica')}>
            Tutti Anagrafica
          </Button>
        </div>

        <div className="max-h-[52vh] overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead>Fornitore</TableHead>
                <TableHead>Valori dal file</TableHead>
                <TableHead>Predefiniti anagrafica</TableHead>
                <TableHead>Usa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conflitti.map((c) => {
                const scelta = scelte[c.partitaIva]
                return (
                  <TableRow key={c.partitaIva}>
                    <TableCell>{c.denominazione}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline">IVA: {c.aliquote.join('/')}%</Badge>
                        <Badge variant="outline">{giorniInParole(c.giorniDalFile)}</Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{giorniInParole(c.giorniAnagrafica)}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant={scelta === 'importazione' ? 'default' : 'outline'}
                          aria-label={`Usa l importazione per ${c.denominazione}`}
                          onClick={() =>
                            setScelteUtente((precedenti) => ({ ...precedenti, [c.partitaIva]: 'importazione' }))
                          }
                        >
                          Importazione
                        </Button>
                        <Button
                          size="sm"
                          variant={scelta === 'anagrafica' ? 'default' : 'outline'}
                          aria-label={`Usa l anagrafica per ${c.denominazione}`}
                          onClick={() =>
                            setScelteUtente((precedenti) => ({ ...precedenti, [c.partitaIva]: 'anagrafica' }))
                          }
                        >
                          Anagrafica
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onAnnulla}>
            Annulla
          </Button>
          <Button onClick={() => onContinua(scelte)}>Continua Importazione</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
