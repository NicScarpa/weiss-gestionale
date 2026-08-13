'use client'

/**
 * Contenitore del wizard d'importazione fatture: cuce insieme i quattro passi
 * (caricamento, anteprima, esecuzione, riepilogo) e la finestra dei conflitti
 * sui termini di pagamento, che può aprirsi sopra il passo 2.
 *
 * Stessa firma di `CaricaFattureDialog`/`InvoiceImportDialog`, così le due
 * pagine che li montavano cambiano solo l'import.
 */
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/formatters'
import { leggiFileFattura } from '@/lib/sdi/lettura-file'
import { OPZIONI_PREDEFINITE, type OpzioniImport } from './tipi'
import { PassoCaricamento } from './PassoCaricamento'
import { PassoAnteprima, type RigaAnteprima } from './PassoAnteprima'
import { DialogConflitti, type ConflittoTermini, type SceltaConflitto } from './DialogConflitti'
import { PassoEsecuzione } from './PassoEsecuzione'
import { RiepilogoFinale, type EsitoRiga } from './RiepilogoFinale'

type Passo = 'caricamento' | 'anteprima' | 'esecuzione' | 'riepilogo'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportComplete?: () => void
}

const PASSI: Array<{ chiave: Passo; etichetta: string }> = [
  { chiave: 'caricamento', etichetta: 'Caricamento' },
  { chiave: 'anteprima', etichetta: 'Anteprima' },
  { chiave: 'esecuzione', etichetta: 'Importazione' },
]

const INDICE_PASSO: Record<Passo, number> = {
  caricamento: 0,
  anteprima: 1,
  esecuzione: 2,
  riepilogo: 3,
}

const STATO_INIZIALE = {
  passo: 'caricamento' as Passo,
  opzioni: OPZIONI_PREDEFINITE,
  fileScelti: [] as File[],
  inLettura: false,
  righe: [] as RigaAnteprima[],
  scartati: [] as Array<{ nomeFile: string; motivo: string }>,
  metadatiIgnorati: 0,
  conflitti: [] as ConflittoTermini[],
  conflittiAperto: false,
  inVerificaConflitti: false,
  scelteConflitti: {} as Record<string, SceltaConflitto>,
  esiti: [] as EsitoRiga[],
  fattureCreate: 0,
  fornitoriCreati: 0,
}

export function ImportaFattureWizard({ open, onOpenChange, onImportComplete }: Props) {
  const [passo, setPasso] = useState<Passo>(STATO_INIZIALE.passo)
  const [opzioni, setOpzioni] = useState<OpzioniImport>(STATO_INIZIALE.opzioni)
  const [fileScelti, setFileScelti] = useState<File[]>(STATO_INIZIALE.fileScelti)
  const [inLettura, setInLettura] = useState(STATO_INIZIALE.inLettura)
  const [righe, setRighe] = useState<RigaAnteprima[]>(STATO_INIZIALE.righe)
  const [scartati, setScartati] = useState(STATO_INIZIALE.scartati)
  const [metadatiIgnorati, setMetadatiIgnorati] = useState(STATO_INIZIALE.metadatiIgnorati)
  const [conflitti, setConflitti] = useState<ConflittoTermini[]>(STATO_INIZIALE.conflitti)
  const [conflittiAperto, setConflittiAperto] = useState(STATO_INIZIALE.conflittiAperto)
  const [inVerificaConflitti, setInVerificaConflitti] = useState(STATO_INIZIALE.inVerificaConflitti)
  const [scelteConflitti, setScelteConflitti] = useState<Record<string, SceltaConflitto>>(
    STATO_INIZIALE.scelteConflitti
  )
  const [esiti, setEsiti] = useState<EsitoRiga[]>(STATO_INIZIALE.esiti)
  const [fattureCreate, setFattureCreate] = useState(STATO_INIZIALE.fattureCreate)
  const [fornitoriCreati, setFornitoriCreati] = useState(STATO_INIZIALE.fornitoriCreati)

  const reset = () => {
    setPasso(STATO_INIZIALE.passo)
    setOpzioni(STATO_INIZIALE.opzioni)
    setFileScelti(STATO_INIZIALE.fileScelti)
    setInLettura(STATO_INIZIALE.inLettura)
    setRighe(STATO_INIZIALE.righe)
    setScartati(STATO_INIZIALE.scartati)
    setMetadatiIgnorati(STATO_INIZIALE.metadatiIgnorati)
    setConflitti(STATO_INIZIALE.conflitti)
    setConflittiAperto(STATO_INIZIALE.conflittiAperto)
    setInVerificaConflitti(STATO_INIZIALE.inVerificaConflitti)
    setScelteConflitti(STATO_INIZIALE.scelteConflitti)
    setEsiti(STATO_INIZIALE.esiti)
    setFattureCreate(STATO_INIZIALE.fattureCreate)
    setFornitoriCreati(STATO_INIZIALE.fornitoriCreati)
  }

  const handleOpenChange = (valore: boolean) => {
    if (!valore) reset()
    onOpenChange(valore)
  }

  // Passo 1 → 2: legge i file (client, incluso lo spacchettamento ZIP), poi
  // marca in un solo giro chi è già in archivio. Il server resta l'unica
  // fonte di verità: qui si legge solo per mostrare l'anteprima.
  const handleFileScelti = async (nuoviFile: File[]) => {
    setFileScelti(nuoviFile)
    setInLettura(true)
    try {
      const esito = await leggiFileFattura(nuoviFile)
      setScartati(esito.scartati)
      setMetadatiIgnorati(esito.metadatiIgnorati)

      let chiaviDuplicate = new Set<string>()
      if (esito.fatture.length > 0) {
        const res = await fetch('/api/fatture/verifica-duplicati', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fatture: esito.fatture.map((f) => ({
              chiave: f.chiave,
              numero: f.numero,
              data: f.data,
              partitaIva: f.partitaIvaFornitore,
            })),
          }),
        })
        if (res.ok) {
          const corpo: { duplicati: Array<{ chiave: string }> } = await res.json()
          chiaviDuplicate = new Set(corpo.duplicati.map((d) => d.chiave))
        } else {
          toast.error('Impossibile verificare i duplicati: procedo senza marcarli')
        }
      }

      setRighe(
        esito.fatture.map((f) => ({ ...f, duplicata: chiaviDuplicate.has(f.chiave), esclusa: false }))
      )
      setPasso('anteprima')
    } catch (errore) {
      toast.error(errore instanceof Error ? errore.message : 'Errore nella lettura dei file')
    } finally {
      setInLettura(false)
    }
  }

  const handleEsclusioneChange = (chiave: string, esclusa: boolean) => {
    setRighe((precedenti) => precedenti.map((r) => (r.chiave === chiave ? { ...r, esclusa } : r)))
  }

  // Passo 2 → 3 (o finestra conflitti in mezzo): controlla se i termini di
  // pagamento dei fornitori coinvolti divergono dall'anagrafica solo per le
  // righe che verranno davvero mandate al server.
  const avviaImportazione = async () => {
    const incluse = righe.filter((r) => !r.esclusa)
    if (incluse.length === 0) {
      toast.error("Nessuna fattura selezionata per l'importazione")
      return
    }

    setInVerificaConflitti(true)
    try {
      const res = await fetch('/api/fatture/conflitti-termini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fatture: incluse.map((r) => ({
            chiave: r.chiave,
            partitaIva: r.partitaIvaFornitore,
            denominazione: r.denominazioneFornitore,
            giorniDalFile: r.giorniDalFile,
            aliquote: r.aliquote,
          })),
        }),
      })

      if (res.ok) {
        const corpo: { conflitti: ConflittoTermini[] } = await res.json()
        if (corpo.conflitti.length > 0) {
          setConflitti(corpo.conflitti)
          setConflittiAperto(true)
          return
        }
      } else {
        toast.error('Impossibile verificare i conflitti sui termini di pagamento: procedo comunque')
      }
      setPasso('esecuzione')
    } catch (errore) {
      // Simmetrico a `handleFileScelti`: una `fetch` che lancia (rete assente,
      // DNS, CORS) non passa dal ramo `else` sopra, che gestisce solo una
      // risposta HTTP arrivata ma non ok. Senza questo catch lo spinner si
      // sarebbe spento comunque (c'è il `finally`), ma l'utente sarebbe
      // rimasto sull'anteprima senza sapere perché.
      toast.error(errore instanceof Error ? errore.message : 'Errore nella verifica dei conflitti')
    } finally {
      setInVerificaConflitti(false)
    }
  }

  const onContinuaConflitti = (scelte: Record<string, SceltaConflitto>) => {
    setScelteConflitti(scelte)
    setConflittiAperto(false)
    setPasso('esecuzione')
  }

  // Passo 3 → 4: l'esecuzione è finita. `fornitoriCreati` viene dal flag che
  // il server ha messo in ogni 201, non da un conteggio lato client.
  // `fattureCreate` va invece riletto dal database: si rimandano le chiavi
  // delle righe dichiarate «importata» a verifica-duplicati, che ora le
  // troverà — è la controprova che sono state scritte davvero.
  const onEsecuzioneFinita = async (esitiFinali: EsitoRiga[]) => {
    setEsiti(esitiFinali)
    onImportComplete?.()

    setFornitoriCreati(esitiFinali.filter((e) => e.fornitoreCreato === true).length)

    const importate = esitiFinali.filter((e) => e.stato === 'importata')
    if (importate.length === 0) {
      setFattureCreate(0)
      setPasso('riepilogo')
      return
    }

    try {
      const res = await fetch('/api/fatture/verifica-duplicati', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fatture: importate.map((e) => ({
            chiave: e.chiave,
            numero: e.numero,
            data: e.fattura.data,
            partitaIva: e.fattura.partitaIvaFornitore,
          })),
        }),
      })
      if (res.ok) {
        const corpo: { duplicati: Array<{ chiave: string }> } = await res.json()
        setFattureCreate(corpo.duplicati.length)
      } else {
        setFattureCreate(0)
      }
    } catch {
      setFattureCreate(0)
    } finally {
      setPasso('riepilogo')
    }
  }

  const indiceCorrente = INDICE_PASSO[passo]
  const righeIncluse = righe.filter((r) => !r.esclusa)
  const incluse = righeIncluse.length
  // Le note di credito sono già in negativo (segno di presentazione, Task 6):
  // sommare i lordi basta, non serve distinguere il tipo documento qui.
  const totaleIncluse = righeIncluse.reduce((somma, r) => somma + r.totalAmount, 0)

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importa fatture</DialogTitle>
          </DialogHeader>

          {passo !== 'riepilogo' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {PASSI.map((p, indice) => (
                <div key={p.chiave} className="flex items-center gap-2">
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full border text-xs',
                      indiceCorrente === indice && 'border-primary bg-primary text-primary-foreground',
                      indiceCorrente > indice && 'border-primary text-primary'
                    )}
                  >
                    {indice + 1}
                  </span>
                  <span className={cn(indiceCorrente === indice && 'font-medium text-foreground')}>
                    {p.etichetta}
                  </span>
                  {indice < PASSI.length - 1 && <span className="mx-1 text-muted-foreground/40">→</span>}
                </div>
              ))}
            </div>
          )}

          {passo === 'caricamento' && (
            <PassoCaricamento
              opzioni={opzioni}
              onOpzioniChange={setOpzioni}
              fileScelti={fileScelti}
              onFileScelti={handleFileScelti}
              inLettura={inLettura}
            />
          )}

          {passo === 'anteprima' && (
            <div className="space-y-4">
              <PassoAnteprima
                righe={righe}
                onEsclusioneChange={handleEsclusioneChange}
                metadatiIgnorati={metadatiIgnorati}
                scartati={scartati}
              />
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {incluse} da importare su {righe.length} — totale {formatCurrency(totaleIncluse)}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setPasso('caricamento')}>
                    Indietro
                  </Button>
                  <Button onClick={avviaImportazione} disabled={righe.length === 0 || inVerificaConflitti}>
                    {inVerificaConflitti ? (
                      <>
                        <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                        Verifica in corso…
                      </>
                    ) : (
                      'Avvia Importazione'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {passo === 'esecuzione' && (
            <PassoEsecuzione
              righe={righe}
              opzioni={opzioni}
              scelteConflitti={scelteConflitti}
              conflitti={conflitti}
              onFinito={onEsecuzioneFinita}
            />
          )}

          {passo === 'riepilogo' && (
            <RiepilogoFinale
              esiti={esiti}
              fattureCreate={fattureCreate}
              fornitoriCreati={fornitoriCreati}
              onChiudi={() => handleOpenChange(false)}
              onRicomincia={reset}
            />
          )}
        </DialogContent>
      </Dialog>

      <DialogConflitti
        aperto={conflittiAperto}
        conflitti={conflitti}
        onAnnulla={() => setConflittiAperto(false)}
        onContinua={onContinuaConflitti}
      />
    </>
  )
}
