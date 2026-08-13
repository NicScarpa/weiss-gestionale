'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDateShort } from '@/lib/constants'
import type { ContoBancarioDelGestionale, ContoInPannello, Scelta } from './ConnessioniBancarie'

interface Props {
  conto: ContoInPannello
  scelta: Scelta
  contiBancari: ContoBancarioDelGestionale[]
  onCambia: (scelta: Scelta) => void
}

/**
 * Da quando partirebbero i movimenti, detto in modo che si capisca perché la
 * data serve: il rischio è importare due volte ciò che è già entrato via CSV.
 */
function riferimento(ultimoMovimento: string | null): string {
  return ultimoMovimento
    ? `Il movimento più recente che ho per questo conto è del ${formatDateShort(ultimoMovimento)}.`
    : 'Non ho ancora movimenti per questo conto.'
}

export function RigaContoBancario({ conto, scelta, contiBancari, onCambia }: Props) {
  const etichetta = conto.ibanMascherato ?? conto.conto.providerAccountId
  const abbinato = conto.tipo === 'riconosciuto' || conto.tipo === 'gia-collegato'
  // `conto.tipo === 'ignorato'` è il dato del server e non cambia finché non
  // arriva una rilettura: senza `&& scelta.azione !== 'configura'`, una volta
  // scelto il conto a cui abbinarlo la riga restava bloccata sulla sola
  // select, senza mai arrivare al campo data — e quella riga da sola
  // disabilitava «Salva» per l'intero pannello, perché `dataTaglio` restava
  // vuoto per sempre. Abbinarlo (non un'azione separata) è ciò che lo
  // riprende: la riga deve aprirsi alla stessa via d'uscita del conto
  // sconosciuto.
  const ignorato = (conto.tipo === 'ignorato' && scelta.azione !== 'configura') || scelta.azione === 'ignora'

  const idConto = scelta.azione === 'configura' ? scelta.bankAccountId : abbinato ? conto.bankAccountId : ''
  const dataTaglio = scelta.azione === 'configura' ? scelta.dataTaglio : (conto.syncCutoffDate ?? '')
  const acceso = scelta.azione === 'configura' ? scelta.attivo : conto.syncEnabled

  const intestazione = (
    <div className="min-w-0">
      <p className="font-mono text-sm">{etichetta}</p>
      {conto.conto.intestatario && (
        <p className="truncate text-xs text-muted-foreground">{conto.conto.intestatario}</p>
      )}
    </div>
  )

  if (ignorato) {
    return (
      <div className="space-y-2 rounded-md border border-dashed p-3 opacity-70">
        <div className="flex items-center justify-between gap-3">
          {intestazione}
          <Badge variant="outline" className="text-xs">Ignorato</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Resta ignorato finché non lo abbini a un conto: abbinarlo è ciò che lo riprende.
        </p>
        <Select value={idConto || undefined} onValueChange={(id) => onCambia({ azione: 'configura', bankAccountId: id, dataTaglio: '', attivo: false })}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Abbina a un conto…" /></SelectTrigger>
          <SelectContent>
            {contiBancari.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  if (!abbinato && scelta.azione !== 'configura') {
    return (
      <div className="space-y-2 rounded-md border p-3">
        <div className="flex items-center justify-between gap-3">
          {intestazione}
          <Badge variant="outline" className="text-xs">Non riconosciuto</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Questo conto non corrisponde a nessuno di quelli registrati. Abbinalo, oppure ignoralo se
          non riguarda l&apos;attività. Se manca, crealo con «Nuovo conto» qui sopra e poi torna qui.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Select onValueChange={(id) => onCambia({ azione: 'configura', bankAccountId: id, dataTaglio: '', attivo: true })}>
            <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Abbina a un conto…" /></SelectTrigger>
            <SelectContent>
              {contiBancari.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => onCambia({ azione: 'ignora' })}>
            Ignora
          </Button>
        </div>
      </div>
    )
  }

  const nome = abbinato ? conto.nomeConto : contiBancari.find((c) => c.id === idConto)?.name
  const idCampoData = `taglio-${conto.conto.providerAccountId}`

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-3">
        {intestazione}
        <div className="flex items-center gap-2">
          {nome && <span className="hidden text-sm text-muted-foreground sm:inline">{nome}</span>}
          <Switch
            checked={acceso}
            aria-label={`Importa i movimenti di ${etichetta}`}
            onCheckedChange={(valore) =>
              onCambia({ azione: 'configura', bankAccountId: idConto, dataTaglio, attivo: valore })
            }
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={idCampoData} className="text-xs">Importa i movimenti a partire dal</Label>
        <Input
          id={idCampoData}
          type="date"
          value={dataTaglio}
          aria-invalid={scelta.azione === 'configura' && !scelta.dataTaglio}
          onChange={(e) =>
            onCambia({ azione: 'configura', bankAccountId: idConto, dataTaglio: e.target.value, attivo: acceso })
          }
        />
        <p className="text-xs text-muted-foreground">{riferimento(conto.ultimoMovimento)}</p>
      </div>
    </div>
  )
}
