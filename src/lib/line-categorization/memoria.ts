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
    const chiave = { venueId_supplierId_nomeNormalizzato: { venueId, supplierId, nomeNormalizzato } }

    // Il contatore conta le conferme di QUESTA mappatura, non del prodotto.
    // Prima cresceva anche quando l'utente cambiava il conto: una memoria
    // appena corretta si dichiarava confermata trenta volte, quando quelle
    // trenta valevano per il conto vecchio. Ora che il contatore ordina gli
    // esempi che finiscono nel prompt (memoriePerIlPrompt), deve dire il vero.
    //
    // Una lettura in più per riga confermata. La corsa fra due conferme
    // simultanee può sfalsare il conteggio di uno: è un criterio di
    // ordinamento, non un saldo.
    const esistente = await prisma.supplierProductAccount.findUnique({
      where: chiave,
      select: { accountId: true },
    })
    const contoCambiato = !!esistente && esistente.accountId !== accountId

    await prisma.supplierProductAccount.upsert({
      where: chiave,
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
        conferme: contoCambiato ? 1 : { increment: 1 },
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
