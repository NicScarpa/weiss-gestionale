import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { normalizeProductName } from '@/lib/price-tracking'

interface AlimentaMemoriaInput {
  venueId: string
  supplierId: string
  descrizione: string
  codiceArticolo: string | null
  accountId: string
}

/**
 * Registra nella memoria fornitore-prodotto che questo prodotto, di questo
 * fornitore, va su questo conto.
 *
 * Sta qui e non nella rotta perché i percorsi che insegnano sono due — la
 * conferma riga per riga e «Conferma tutte» — e finché la scrittura viveva
 * dentro il primo, il secondo non insegnava niente (F2-ALL-008): chi usava il
 * pulsante più comodo dell'interfaccia rivedeva le stesse righe gialle il mese
 * dopo, con la relativa chiamata a pagamento.
 *
 * **Best-effort per scelta.** Il chiamante ha già scritto la conferma
 * dell'utente: quella è il dato, questa è la deduzione. Un errore qui si
 * registra e non risale.
 *
 * Una descrizione che normalizza a stringa vuota (vuota, soli spazi, soli
 * simboli) non entra in memoria: senza questa guardia prodotti diversi dello
 * stesso fornitore collasserebbero tutti sulla stessa chiave.
 */
export async function alimentaMemoriaFornitore({
  venueId,
  supplierId,
  descrizione,
  codiceArticolo,
  accountId,
}: AlimentaMemoriaInput): Promise<void> {
  const nomeNormalizzato = normalizeProductName(descrizione)
  if (!nomeNormalizzato) return

  try {
    await prisma.supplierProductAccount.upsert({
      where: {
        venueId_supplierId_nomeNormalizzato: { venueId, supplierId, nomeNormalizzato },
      },
      create: {
        venueId,
        supplierId,
        nomeNormalizzato,
        codiceArticolo,
        accountId,
        conferme: 1,
      },
      update: {
        accountId,
        conferme: { increment: 1 },
        // Il codice si scrive solo se questa fattura ne porta uno (F2-ALL-012).
        // Prima il ramo update assegnava `codiceArticolo ?? null`: bastava
        // riconfermare lo stesso prodotto partendo da una fattura che quella
        // volta non riportava il codice, e il codice appreso in precedenza
        // spariva — con esso il riconoscimento per codice di quel prodotto.
        // Un'assenza non è una smentita.
        ...(codiceArticolo ? { codiceArticolo } : {}),
      },
    })
  } catch (error) {
    logger.error('Errore aggiornamento memoria fornitore-prodotto', error, {
      venueId,
      supplierId,
      nomeNormalizzato,
    })
  }
}
