/**
 * Mostra un testo evidenziando la porzione che corrisponde alla parola chiave
 * di una regola. Serve a rendere visibile *perché* una regola aggancia una
 * riga: il conteggio dice quante, l'evidenziazione dice quali e come.
 *
 * La corrispondenza è letterale e insensibile alle maiuscole, esattamente come
 * quella del motore (`description.toLowerCase().includes(kw.toLowerCase())` in
 * recategorize/route.ts): non serve nulla di più sofisticato, e qualcosa di più
 * sofisticato mentirebbe sul comportamento reale.
 *
 * Evidenzia la prima occorrenza soltanto. Una causale che ripete la stessa
 * parola due volte è agganciata per la prima: mostrare tutte le occorrenze
 * suggerirebbe un conteggio che il motore non fa.
 */
export function TestoEvidenziato({ testo, chiave }: { testo: string; chiave: string }) {
  if (!chiave) return <>{testo}</>

  const indice = testo.toLowerCase().indexOf(chiave.toLowerCase())
  if (indice === -1) return <>{testo}</>

  return (
    <>
      {testo.slice(0, indice)}
      <mark className="rounded bg-yellow-200 px-0.5 dark:bg-yellow-900/60">
        {testo.slice(indice, indice + chiave.length)}
      </mark>
      {testo.slice(indice + chiave.length)}
    </>
  )
}
