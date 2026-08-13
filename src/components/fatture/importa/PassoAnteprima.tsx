'use client'

/**
 * Passo 2 del wizard: la tabella di ciò che è stato letto dai file scelti.
 *
 * È qui che si vede la differenza con CashKing: la loro anteprima mostra 226
 * righe senza dire quali sono già in archivio, quindi la scelta della
 * politica duplicati (passo 1) viene fatta alla cieca. Qui ogni riga
 * duplicata è marcata e può essere esclusa singolarmente prima di importare.
 *
 * Due dettagli non negoziabili, entrambi già decisi a monte (Task 6):
 * - una scadenza stimata (XML senza data di pagamento) va detta stimata, mai
 *   spacciata per letta — il competitor la mette sulla data fattura, facendo
 *   sembrare i debiti già scaduti;
 * - tutte le aliquote IVA del documento, non una sola: 32 fatture su 226
 *   nell'archivio reale ne hanno più di una.
 */
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { InfoIcon } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { FatturaLetta } from '@/lib/sdi/lettura-file'

export interface RigaAnteprima extends FatturaLetta {
  duplicata: boolean
  esclusa: boolean
}

interface Props {
  righe: RigaAnteprima[]
  onEsclusioneChange: (chiave: string, esclusa: boolean) => void
  metadatiIgnorati: number
  scartati: Array<{ nomeFile: string; motivo: string }>
}

/** `YYYY-MM-DD` (o null) in `gg/mm/aaaa`: qui non serve altro che uno split. */
function formattaData(data: string | null): string {
  if (!data) return '—'
  const [anno, mese, giorno] = data.split('-')
  return `${giorno}/${mese}/${anno}`
}

export function PassoAnteprima({ righe, onEsclusioneChange, metadatiIgnorati, scartati }: Props) {
  return (
    <div className="space-y-3">
      <p className="font-medium">{righe.length} fatture trovate nei file caricati</p>

      <div className="max-h-[52vh] overflow-y-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead>Includi</TableHead>
              <TableHead>#</TableHead>
              <TableHead>File</TableHead>
              <TableHead>Numero</TableHead>
              <TableHead>Tipo Doc.</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Scadenza</TableHead>
              <TableHead>Fornitore</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Netto</TableHead>
              <TableHead>IVA %</TableHead>
              <TableHead>Lordo</TableHead>
              <TableHead>Ritenuta</TableHead>
              <TableHead>Stato</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {righe.map((r, indice) => (
              <TableRow key={r.chiave} className={cn(r.duplicata && 'opacity-60')}>
                <TableCell>
                  <Checkbox
                    aria-label={`Includi ${r.nomeFile}`}
                    checked={!r.esclusa}
                    onCheckedChange={(valore) => onEsclusioneChange(r.chiave, valore !== true)}
                  />
                </TableCell>
                <TableCell>{indice + 1}</TableCell>
                <TableCell className="max-w-40 truncate" title={r.nomeFile}>{r.nomeFile}</TableCell>
                <TableCell>{r.numero}</TableCell>
                <TableCell>{r.tipoDocumento}</TableCell>
                <TableCell>{formattaData(r.data)}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1">
                    {formattaData(r.primaScadenza)}
                    {r.scadenzaStimata && (
                      <span title="Scadenza stimata: l'XML non riporta la data di pagamento">
                        <InfoIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell className="max-w-40 truncate" title={r.denominazioneFornitore}>
                  {r.denominazioneFornitore}
                </TableCell>
                <TableCell className="max-w-40 truncate" title={r.denominazioneCliente}>
                  {r.denominazioneCliente}
                </TableCell>
                <TableCell>{formatCurrency(r.netAmount)}</TableCell>
                <TableCell>{r.aliquote.map((a) => `${a}%`).join(' · ')}</TableCell>
                <TableCell>{formatCurrency(r.totalAmount)}</TableCell>
                <TableCell>
                  {r.ritenuta ? `${formatCurrency(r.ritenuta.importo)} (${r.ritenuta.aliquota}%)` : '—'}
                </TableCell>
                <TableCell>
                  {r.duplicata && <Badge variant="secondary">Duplicato</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {(metadatiIgnorati > 0 || scartati.length > 0) && (
        <div className="space-y-1 text-sm text-muted-foreground">
          {metadatiIgnorati > 0 && (
            <p>{metadatiIgnorati} file di metadati dell&apos;Agenzia ignorati</p>
          )}
          {scartati.length > 0 && (
            <ul className="space-y-0.5">
              {scartati.map((s) => (
                <li key={s.nomeFile}>
                  {s.nomeFile}: {s.motivo}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
