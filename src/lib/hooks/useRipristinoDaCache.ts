'use client'

import { useEffect } from 'react'

/**
 * Esegue `alRipristino` quando la pagina torna dalla cache del browser.
 *
 * ## Perché serve
 *
 * Il collegamento bancario porta l'utente **fuori dal sito**, sul portale
 * dell'istituto. Al ritorno — col tasto Indietro, o premendolo prima di aver
 * completato l'autenticazione — i browser ripristinano la pagina dalla
 * *back/forward cache*: il documento non viene ricostruito, i componenti non si
 * rimontano e nessuna query si rilegge. Il pannello resta quindi com'era prima
 * di partire, con i quattro pulsanti presenti e nessuno che porti a un esito
 * diverso, finché non si ricarica a mano.
 *
 * `pageshow` è l'unico evento che distingue il caso: `persisted` è vero solo
 * per un ripristino da bfcache. `focus` e `visibilitychange` non bastano —
 * possono non scattare affatto, e comunque scattano anche in mille casi in cui
 * non è successo nulla.
 */
export function useRipristinoDaCache(alRipristino: () => void): void {
  useEffect(() => {
    function suPageShow(evento: PageTransitionEvent) {
      if (evento.persisted) alRipristino()
    }

    window.addEventListener('pageshow', suPageShow)
    return () => window.removeEventListener('pageshow', suPageShow)
  }, [alRipristino])
}
