/**
 * Tipi e utilità condivisi fra InvoiceDetailSections.tsx (la tabella
 * "Dettaglio Linee") e RigaDivisibile.tsx (le righe figlie di una riga
 * divisa, Task 9): un terzo modulo invece di far importare l'uno dall'altro.
 *
 * Prima RigaDivisibile importava TOLLERANZA_IMPORTI/pallino/RigaVisualizzata
 * da InvoiceDetailSections, che a sua volta importava il componente
 * RigaDivisibile — un ciclo. Funzionava (ogni uso reale era dentro funzioni,
 * mai a livello di modulo) e la build passava, ma restava fragile: sarebbe
 * bastato un valore usato a livello di modulo per finire in una TDZ, nello
 * stesso file che porta già la trappola documentata dell'import che rompe il
 * bundle in un modo che nessuna revisione del diff vede (vedi il commento su
 * TOLLERANZA_IMPORTI qui sotto). Revisione team lead, round 1, minor.
 */

// Stessa soglia di src/lib/scadenzario/stato-schedule.ts, duplicata invece
// che importata: quel modulo porta `@prisma/client` (usato per altro al suo
// interno), e un import così in un componente 'use client' rompe la build
// in un modo che nessuna revisione del diff vede — bisogna lanciare
// `npm run build` per accorgersene.
export const TOLLERANZA_IMPORTI = 0.005

/**
 * Una quota di riga imputata a un conto: un solo elemento nel caso comune,
 * più d'uno per una riga divisa fra conti diversi (Task 9). `progressivo` la
 * distingue dalle altre quote della stessa riga; `imputazioni[0]`, ordinato
 * dal server per progressivo crescente, è "la" imputazione principale per chi
 * non gestisce ancora le righe divise.
 */
export interface ImputazioneQuota {
  progressivo: number
  accountId: string
  importo: number
  stato: 'proposta' | 'confermata'
  fonte: string
  confidence?: number | string | null
  motivazioneAi?: string | null
}

/** Una riga della tabella, vera o di sistema, ridotta ai campi comuni al rendering e al calcolo di copertura. */
export interface RigaVisualizzata {
  numeroLinea: number
  descrizione: string
  isSistema: boolean
  quantita?: number
  unitaMisura?: string
  prezzoUnitario?: number
  aliquotaIVA?: number
  importo: number
  imputazioni: ImputazioneQuota[]
}

/**
 * Colore e titolo del pallino di stato per UNA quota (verde confermata,
 * ambra proposta, assente se la quota non esiste ancora). Serve in due
 * punti: la riga a quota singola in InvoiceDetailSections.tsx, e — quota per
 * quota — RigaDivisibile.tsx (Task 9). Prima di essere estratta qui, il
 * pallino si leggeva solo da `imputazioni[0]`: su una riga divisa con la
 * prima quota confermata e la seconda ancora proposta, il pallino unico
 * mostrava verde e la proposta pendente della seconda quota spariva dalla
 * vista (Task 8, minor 9 del reviewer). Ora ogni quota mostra il proprio
 * pallino, non ce n'è uno solo da far quadrare con lo stato di tutte.
 */
export function pallino(
  imputazione: ImputazioneQuota | undefined
): { className: string; title: string } | undefined {
  if (!imputazione) return undefined
  if (imputazione.stato === 'confermata') {
    return { className: 'bg-green-500', title: 'Imputazione confermata' }
  }
  return {
    className: 'bg-amber-500',
    title: `Imputazione proposta automaticamente${imputazione.motivazioneAi ? ` — ${imputazione.motivazioneAi}` : ''}`,
  }
}
