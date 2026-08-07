/**
 * Due nozioni diverse di "predefinito", che il piano dei conti v4 tiene
 * separate di proposito:
 *
 * - il **centro di default di sistema** è STR (struttura/amministrazione), ed
 *   è quello con `isDefault: true` sulla tabella `cost_centers`. Serve alle 46
 *   voci del piano ufficiale che portano la regola `DEFAULT_STR` — consulenze,
 *   compenso amministratore, oneri societari, imposte — e non va cambiato: è
 *   la regola dell'Excel aziendale, fonte di verità in
 *   `src/lib/accounts/piano-conti-weiss-v4.ts`;
 * - il **centro operativo predefinito** è WEISS, il locale principale. È dove
 *   finisce la gestione ordinaria, cioè la stragrande maggioranza dei costi e
 *   delle fatture. È la risposta giusta quando il sistema deve *indovinare*
 *   un centro perché nessuno l'ha scelto (import dell'estratto conto, motore
 *   delle regole, ereditarietà delle fette dalla fattura): un costo di
 *   gestione imputato a Struttura sparisce dal conto economico del locale
 *   senza che nessuno se ne accorga, perché non risulta nemmeno "non
 *   attribuito".
 *
 * Il movimento che nasce da una supposizione resta sempre `verified: false`,
 * così la supposizione passa da un'approvazione umana.
 */
export const CENTRO_OPERATIVO_DEFAULT_CODE = 'WEISS'
