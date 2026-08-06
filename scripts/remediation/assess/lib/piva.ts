/**
 * Normalizzazione della partita IVA, come espressione SQL.
 *
 * Riproduce la convenzione già usata dall'applicazione in
 * `src/lib/sdi/parser.ts` e `src/lib/sdi/matcher.ts`: si tolgono spazi e
 * punteggiatura, si toglie il prefisso `IT`, si tengono le sole cifre e si
 * riempie a sinistra con zeri fino a undici.
 *
 * Con un'aggiunta rispetto all'originale: un prefisso di due lettere diverso
 * da `IT` viene conservato nella chiave. Senza, una partita IVA tedesca
 * `DE01234567890` e una italiana `01234567890` risulterebbero lo stesso
 * fornitore, e il censimento proporrebbe di fonderli.
 *
 * Non si crea una funzione SQL: creare una funzione è una scrittura, e questi
 * script non ne fanno nessuna. L'espressione viene quindi generata e messa
 * in linea nella query.
 */

/**
 * L'argomento è sempre un riferimento a colonna scritto da noi, mai un valore
 * proveniente dall'esterno; il controllo è una rete di sicurezza contro un
 * futuro uso disattento.
 */
function verificaRiferimento(colonna: string): void {
  if (!/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i.test(colonna)) {
    throw new Error(`Riferimento di colonna non valido: ${colonna}`)
  }
}

/**
 * Espressione SQL che restituisce la partita IVA normalizzata, oppure NULL se
 * la colonna è vuota o non contiene cifre.
 */
export function pivaNormalizzata(colonna: string): string {
  verificaRiferimento(colonna)

  const compatta = `upper(regexp_replace(coalesce(${colonna}, ''), '[^A-Za-z0-9]', '', 'g'))`
  const cifre = `regexp_replace(regexp_replace(${compatta}, '^IT', ''), '[^0-9]', '', 'g')`
  const prefisso = `(CASE WHEN ${compatta} ~ '^[A-Z]{2}' AND ${compatta} !~ '^IT' THEN left(${compatta}, 2) ELSE '' END)`

  return `(CASE
    WHEN ${cifre} = '' THEN NULL
    WHEN length(${cifre}) < 11 THEN ${prefisso} || lpad(${cifre}, 11, '0')
    ELSE ${prefisso} || ${cifre}
  END)`
}
