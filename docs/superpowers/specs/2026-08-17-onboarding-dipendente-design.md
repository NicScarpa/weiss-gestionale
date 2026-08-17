# L'onboarding di un dipendente — progetto

> Stato: **approvato nelle decisioni**, da tradurre in piano.
> Contesto: il 17 agosto 2026, in produzione, 14 utenti su 16 non erano mai entrati.
> Le cause sono in `onboarding-dipendenti-mai-consegnato` (memoria) e nella PR #31.

## Il problema, in una riga

Assumere una persona e darle accesso sono oggi due gesti separati, e il secondo
non arriva mai a destinazione.

## Cos'è già in piedi (e non va rifatto)

Il pezzo grosso esiste, sparso in tre punti che non si conoscono fra loro:

| Pezzo | Dove | Stato |
|---|---|---|
| Password temporanea + `mustChangePassword` | `src/lib/password-temporanea.ts` (PR #31) | funziona |
| Credenziale mostrata a schermo, creazione **e** reset | `CredentialsDialog` (PR #31) | funziona |
| Invito con link a scadenza per account esistente | `sendPortalAccessEmail` → `/reset-password?token=`, 7 giorni | funziona |
| Invito alla **creazione** dell'utente | `POST /api/users` (PR #31) | funziona |
| Invito in blocco per chi è già a sistema | azione `invite` di `/api/staff/bulk`, dalla pagina Personale | funziona, e riporta già `emailsSent` / `emailsFailed` / `missingEmail` |
| Invio email | Resend, dominio `weisscafe.com` verificato | **configurato in produzione il 17 ago**, prova `delivered` |
| Invito per chi **non** è ancora a sistema | `/api/staff/invite` + pagina `/invito` | scritto e **mai chiamato da nessuna schermata** |

Quindi il lavoro che resta non è costruire: è **chiudere tre buchi** e **decidere
la sorte di un pezzo orfano**.

## Le decisioni prese con l'utente (17 agosto 2026)

1. **Nella mail va un link a scadenza, non la password.** Una password in chiaro
   resta nella casella per sempre, si inoltra per sbaglio, e chi legge la posta
   entra nel gestionale; un link monouso scade e si brucia. Ed è anche la strada
   che costa meno, perché il meccanismo esiste già.
2. **L'invito parte dalla creazione del dipendente**: salvi la scheda con
   l'email e l'accesso è già in viaggio. Un gesto solo.
3. **La credenziale resta comunque leggibile a schermo.** Due canali, non uno:
   se la mail non arriva — ed è quello che è successo per sei mesi — l'operatore
   deve avere in mano qualcosa da consegnare.
4. **Lo username diventa `cognome.nome`**, tutto minuscolo, senza accenti né
   spazi: `piazzon.alessandra`, `momesso.matteo`. Si detta al telefono e ordina
   l'elenco come si cercano le persone.
5. **Omonimia: numero progressivo** (`rossi.mario`, `rossi.mario2`), e lo
   username resta **modificabile a mano prima di salvare**. Nessuna regola
   automatica indovina i casi veri; una proposta sensata più un campo aperto li
   copre tutti.
6. **I 16 username esistenti passano al formato nuovo**, tranne i due account di
   sistema `admin@weisscafe.it` e `manager@weisscafe.it`, che restano come sono.
   Per 14 persone su 16 il cambio è indolore: non sono mai entrate.
7. **Le email personali le inserisce l'utente** dall'anagrafica: nessuna
   generazione automatica di indirizzi.

## I tre buchi da chiudere

### A. Lo username

Oggi `src/lib/utils/username.ts` produce `NomeCognome` per lo staff e **usa
l'email come username per admin e manager** (`shouldUseEmailAsUsername`). Da qui
i due account a forma di indirizzo. La regola non è nemmeno applicata in modo
uniforme: Andrea Segatto è manager e ha username `AndreaSegatto`, perché i
percorsi di creazione sono due e non concordano.

Il cambio tocca un file e quattro chiamanti:

| File | Cosa |
|---|---|
| `src/lib/utils/username.ts` | il formato, e via la regola dell'email per i nuovi |
| `src/app/api/users/route.ts:220-223` | creazione da Anagrafiche → Utenti |
| `src/app/api/staff/route.ts:267` | creazione da Anagrafiche → Personale |
| `src/app/api/staff/invite/complete/route.ts:192` | completamento dell'invito |
| `src/components/users/UserForm.tsx:116` | l'anteprima nel form |

⚠️ **Quel generatore non ha nessun test** (`src/lib/utils/__tests__/` contiene
solo `api-error.test.ts`). I test vanno scritti prima del cambio: sono la rete
che dice se `De Andrè` → `deandre.nicolo` e se il progressivo si comporta.

⚠️ **`UserForm.tsx` è in mano a un'altra sessione** (bug della select «Ruolo»):
attendere che la lasci.

Migrazione dei 14: script idempotente che mostra il piano prima di scrivere
(vecchio → nuovo, chi salta e perché), sul modello di `scripts/reset-password.ts`.
Chi è già entrato conserva l'accesso perché **il login accetta username oppure
email** (`src/lib/auth.ts:90` e `:100`).

### B. L'email obbligatoria per chi ha accesso al portale

Oggi è `z.string().email().optional().nullable()` e nello schema `String?`: si
può creare un dipendente senza email, e quindi senza invito. È esattamente ciò
che ha permesso di inventare sedici indirizzi. Va resa obbligatoria **quando
l'utente ha accesso al portale**, non sempre: un collaboratore senza portale non
ha bisogno di una casella.

### C. Il pezzo orfano

Con l'invito che parte dalla creazione, `/api/staff/invite` +
`sendStaffInvitationEmail` + la pagina `/invito` restano senza chiamante — e
`src/CLAUDE.md` vieta il codice irraggiungibile. Due strade, da decidere:
**collegare** il link generico (un invito senza destinatario, da condividere a
mano) a un bottone nella pagina Personale, oppure **rimuovere** i tre pezzi.
La pagina `/invito` è pubblica: finché esiste, esiste anche la sua superficie.

## Come si vede che funziona

Non «la rotta risponde 200», ma: **la credenziale è leggibile da qualche parte
alla fine**. Tre prove concrete, sui dati veri:

1. Si crea un dipendente con un'email vera → la mail arriva, il link porta a
   impostare la password, e la persona entra con `cognome.nome` o con la sua
   email.
2. La stessa creazione **senza** email → la credenziale compare a schermo e il
   dialogo dice che la mail non è partita.
3. I 9 dipendenti attivi che non sono mai entrati ricevono l'invito in blocco
   dalla pagina Personale, e il risultato dice quanti inviti sono partiti,
   quanti no e quanti erano senza email.

## Fuori perimetro

- Sanare i 16 indirizzi (lo fa l'utente).
- Le caselle `@weisscafe.com` per admin e manager: esistono su Hostinger e non
  si toccano.
- Notifiche WhatsApp: solo 3 utenti su 16 hanno un recapito, non è una strada.
