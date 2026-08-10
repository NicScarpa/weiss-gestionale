'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Rende utilizzabile su schermo stretto una striscia di elementi affiancati
 * (tab, filtri) che a contenuto è più larga dello spazio disponibile.
 *
 * Da sola `overflow-x-auto` non basta per due motivi, entrambi verificati a
 * 390 px su questo gestionale:
 *
 * 1. serve anche `max-w-full`, perché un contenitore `w-fit` si allarga quanto
 *    le tab e lo scroll non entra mai in funzione: a scorrere finisce la
 *    pagina, e il resto del contenuto va fuori schermo;
 * 2. gli scrollbar dei telefoni sono overlay e da fermi non si vedono, quindi
 *    nulla dice all'utente che ci sono altre tab. La sfumatura sul bordo
 *    destro è quell'indizio, e sparisce quando si è arrivati in fondo.
 *
 * @param selettoreAttivo selettore dell'elemento da riportare in vista quando
 *   la selezione cambia (`[aria-current="page"]` per i link di navigazione,
 *   `[data-state="active"]` per le tab di Radix).
 */
export function useStrisciaScorrevole<T extends HTMLElement = HTMLDivElement>(
  selettoreAttivo = '[data-state="active"]'
) {
  const rifStriscia = useRef<T>(null)
  const [restaDaScorrere, setRestaDaScorrere] = useState(false)

  const aggiorna = useCallback(() => {
    const striscia = rifStriscia.current
    if (!striscia) return
    setRestaDaScorrere(
      striscia.scrollLeft + striscia.clientWidth < striscia.scrollWidth - 1
    )
  }, [])

  useEffect(() => {
    const striscia = rifStriscia.current
    if (!striscia) return

    aggiorna()
    striscia.addEventListener('scroll', aggiorna, { passive: true })

    // `resize` sulla finestra non basta: la striscia cambia larghezza anche
    // quando le tab arrivano dopo il primo render, o quando si apre la sidebar.
    const osservatore =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(aggiorna) : null
    osservatore?.observe(striscia)

    return () => {
      striscia.removeEventListener('scroll', aggiorna)
      osservatore?.disconnect()
    }
  }, [aggiorna])

  /**
   * Riporta in vista l'elemento attivo: dopo un cambio di sezione può essere
   * fuori dalla parte visibile della striscia. `block: 'nearest'` evita che il
   * browser scorra anche la pagina in verticale.
   */
  const centraAttivo = useCallback(() => {
    rifStriscia.current
      ?.querySelector(selettoreAttivo)
      ?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [selettoreAttivo])

  return { rifStriscia, restaDaScorrere, centraAttivo }
}

/** Sfumatura sul bordo destro, da applicare quando `restaDaScorrere` è vero. */
export const SFUMATURA_SCORRIMENTO =
  '[mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)]'
