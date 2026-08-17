import { formatCurrency } from '@/lib/formatters'
import type { EsitoPromozione } from '@/lib/services/promozione-riga-bancaria-service'

/**
 * L'esito del servizio tradotto in stato HTTP e corpo, una volta per tutte le
 * rotte: il messaggio finisce nel toast così com'è, e deve dire cosa fare
 * («scollegalo prima»), non solo che non si è potuto.
 */
export function rispostaPerEsito(esito: EsitoPromozione): { status: number; corpo: Record<string, unknown> } {
  switch (esito.outcome) {
    case 'ok':
      return {
        status: 200,
        corpo: {
          ok: true,
          journalEntryId: esito.journalEntryId,
          reconciliationIds: esito.reconciliationIds,
          residuo: esito.residuo,
          creata: esito.creata,
        },
      }
    case 'riga_non_trovata':
      return { status: 404, corpo: { error: 'Movimento non trovato' } }
    case 'scrittura_non_trovata':
      return { status: 404, corpo: { error: 'Scrittura non trovata' } }
    case 'riga_nel_cestino':
      return { status: 409, corpo: { error: 'Il movimento è nel Cestino: ripristinalo prima' } }
    case 'riga_gia_collegata':
      return {
        status: 409,
        corpo: { error: 'Il movimento è già collegato a una scrittura: scollegalo prima', journalEntryId: esito.journalEntryId },
      }
    case 'scrittura_gia_collegata_ad_altra_riga':
      return { status: 409, corpo: { error: 'La scrittura è già collegata a un altro movimento bancario' } }
    case 'importo_eccedente':
      return {
        status: 422,
        corpo: { error: `Gli importi superano il residuo del movimento (${formatCurrency(esito.residuo)})`, residuo: esito.residuo },
      }
    case 'riconciliazione_rifiutata':
      return { status: 422, corpo: { error: esito.motivo, scheduleId: esito.scheduleId } }
    case 'imputazione_non_valida':
      return { status: 400, corpo: { error: esito.motivo, ...(esito.code ? { code: esito.code } : {}) } }
  }
}
