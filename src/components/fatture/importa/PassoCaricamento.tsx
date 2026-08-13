'use client'

import { useRef, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileCode2Icon, Loader2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OpzioniImport, PoliticaDuplicati } from './tipi'

const FORMATI_ACCETTATI = '.xml,.p7m,.zip,.XML,.P7M,.ZIP'

interface Props {
  opzioni: OpzioniImport
  onOpzioniChange: (opzioni: OpzioniImport) => void
  fileScelti: File[]
  onFileScelti: (files: File[]) => void
  inLettura: boolean
}

export function PassoCaricamento({ opzioni, onOpzioniChange, fileScelti, onFileScelti, inLettura }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [trascinamento, setTrascinamento] = useState(false)

  const aggiungi = (lista: FileList | null) => {
    if (!lista || lista.length === 0) return
    onFileScelti([...fileScelti, ...Array.from(lista)])
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border p-4">
        <Checkbox
          id="sovrascrivi-anagrafica"
          checked={opzioni.sovrascriviAnagrafica}
          onCheckedChange={(valore) =>
            onOpzioniChange({ ...opzioni, sovrascriviAnagrafica: valore === true })
          }
        />
        <div className="space-y-1">
          <Label htmlFor="sovrascrivi-anagrafica" className="font-medium">
            Sovrascrivi dati anagrafici esistenti
          </Label>
          <p className="text-sm text-muted-foreground">
            Se attivo, i dati anagrafici (indirizzo, città, provincia, CAP e codice fiscale) dei
            fornitori già presenti vengono aggiornati con quelli del file importato. La partita
            IVA non viene toccata: è la chiave con cui il fornitore viene riconosciuto.
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <p className="font-medium">Come gestire i duplicati?</p>
        <RadioGroup
          value={opzioni.politicaDuplicati}
          onValueChange={(valore) =>
            onOpzioniChange({ ...opzioni, politicaDuplicati: valore as PoliticaDuplicati })
          }
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="salta" id="duplicati-salta" />
            <Label htmlFor="duplicati-salta" className="font-normal cursor-pointer">
              Salta le righe duplicate (mantieni i dati esistenti)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="sostituisci" id="duplicati-sostituisci" />
            <Label htmlFor="duplicati-sostituisci" className="font-normal cursor-pointer">
              Sostituisci con i nuovi dati
            </Label>
          </div>
        </RadioGroup>
      </div>

      <div
        className={cn(
          'rounded-lg border-2 border-dashed p-8 text-center transition-colors',
          trascinamento && 'border-primary bg-primary/5'
        )}
        onDragOver={(e) => {
          e.preventDefault()
          setTrascinamento(true)
        }}
        onDragLeave={() => setTrascinamento(false)}
        onDrop={(e) => {
          e.preventDefault()
          setTrascinamento(false)
          aggiungi(e.dataTransfer.files)
        }}
      >
        <FileCode2Icon className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <p className="mt-3 font-medium">Seleziona uno o più file di fattura elettronica</p>
        <p className="mx-auto mt-1 max-w-2xl text-xs text-muted-foreground">
          Formati supportati: XML, P7M (FPA12, FPR12, FSM10), ZIP mensile dell&apos;Agenzia delle
          Entrate. I file _metaDato.xml vengono ignorati automaticamente.
        </p>

        {fileScelti.length > 0 && (
          <div className="mt-4 space-y-2">
            <Badge variant="secondary">{fileScelti.length} file selezionati</Badge>
            <ul className="mx-auto max-h-40 max-w-md space-y-0.5 overflow-y-auto text-left text-xs text-muted-foreground">
              {fileScelti.slice(0, 10).map((file, indice) => (
                <li key={`${file.name}-${indice}`} className="truncate">{file.name}</li>
              ))}
              {fileScelti.length > 10 && <li>… e altri {fileScelti.length - 10}</li>}
            </ul>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={FORMATI_ACCETTATI}
          multiple
          className="hidden"
          onChange={(e) => {
            aggiungi(e.target.files)
            e.target.value = ''
          }}
        />

        <Button type="button" className="mt-4" onClick={() => inputRef.current?.click()} disabled={inLettura}>
          {inLettura ? (
            <>
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              Lettura in corso…
            </>
          ) : (
            'Seleziona File'
          )}
        </Button>
      </div>
    </div>
  )
}
