# Prompt: Unificazione Anagrafiche nel Gestionale

```xml
<role>
Sei un senior frontend architect specializzato in refactoring UI/UX e riorganizzazione di information architecture in applicazioni Next.js con shadcn/ui. Il tuo obiettivo è analizzare, proporre e eseguire un riposizionamento logico delle anagrafiche in un gestionale contabile.
</role>

<context>
**PROGETTO**: Gestionale contabile in Next.js 15 con App Router, TypeScript, Prisma, shadcn/ui
**STACK TECNOLOGICO**:
- Frontend: Next.js 15, React 19, TypeScript
- UI: shadcn/ui, Tailwind CSS, Lucide Icons
- Stato: React Context + Server Components
- Autenticazione: sistema con ruoli (admin, manager, staff)

**STRUTTURA ATTUALE DELLA SIDEBAR** (src/components/layout/sidebar.tsx):
```
Prima Nota
├─ Movimenti
├─ Pagamenti
├─ Regole
Budget
Fatture
Personale
├─ Staff
├─ Turni
├─ Ferie/Permessi
├─ Presenze
Impostazioni
├─ Generali
├─ Utenti           ← DA RIMUOVERE
├─ Fornitori        ← DA RIMUOVERE
├─ Piano dei conti
├─ Budget
Cash Flow
```

**POSIZIONE ATTUALE DELLE ANAGRAFICHE**:

1. **Personale** - `/staff` - Navigazione principale (accordion "Personale")
   - File: `src/app/(dashboard)/staff/page.tsx`
   - Già corretto come posizione

2. **Utenti** - `/impostazioni/utenti` - Sotto-voce "Impostazioni"
   - File: `src/app/(dashboard)/impostazioni/utenti/page.tsx`
   - Componente: UserManagement
   - DA SPOSTARE sotto "Anagrafiche"

3. **Fornitori** - `/impostazioni/fornitori` - Sotto-voce "Impostazioni"
   - File: `src/app/(dashboard)/impostazioni/fornitori/page.tsx`
   - Componente: SupplierManagement
   - DA SPOSTARE sotto "Anagrafiche"

4. **Clienti** - NON ESISTE come anagrafica dedicata
   - Presente solo come tabella in `/fatture` con dati mock
   - DA CREARE da zero come anagrafica

**REQUISITO UTENTE**:
Le anagrafiche sono sparse in punti non logici:
- Personale sta nella navigazione principale (corretto)
- Utenti e Fornitori stanno sotto Impostazioni (errato - non sono impostazioni!)
- Clienti non esiste come anagrafica

L'utente vuole unificare tutte le anagrafiche in un unico punto logico: una voce "Anagrafiche" che contenga a sua volta le singole anagrafiche (Clienti, Personale, Fornitori, Utenti).
</context>

<task>
Esegui le fasi seguenti in ordine:

## FASE 1: Analisi e Mappatura (NON MODIFICARE CODICE)
Analizza e documenta in modo strutturato:

1.1. Leggi il file della sidebar attuale per capire la struttura dati dei menu items
1.2. Leggi i file delle pagine da spostare:
    - `src/app/(dashboard)/impostazioni/utenti/page.tsx`
    - `src/app/(dashboard)/impostazioni/fornitori/page.tsx`
1.3. Identifica se esistono hardcoded link, breadcrumb, o altri riferimenti alle route `/impostazioni/utenti` e `/impostazioni/fornitori`
1.4. Verifica se la pagina Personale deve diventare una sotto-sezione di Anagrafiche o rimanere come standalone
1.5. Documenta eventuali dipendenze (imports, shared components, API routes) tra le pagine

Output atteso della Fase 1:
```markdown
## ANALISI DELLO STATO ATTUALE

### Mappatura Anagrafiche
| Anagrafica | Route Attuale | Nuova Route | Azione |
|------------|---------------|--------------|--------|
| Clienti | /fatture (tabella mock) | /anagrafiche/clienti | CREARE |
| Fornitori | /impostazioni/fornitori | /anagrafiche/fornitori | SPOSTARE |
| Personale | /staff | /anagrafiche/personale OPPURE /staff | DA DECIDERE |
| Utenti | /impostazioni/utenti | /anagrafiche/utenti | SPOSTARE |

### Dipendenze Identificate
- [Lista di dipendenze tra componenti/pagine]

### Riferimenti Hardcoded da Aggiornare
- [Lista di file con link hardcoded alle vecchie route]
```

## FASE 2: Proposta Architetturale
Propone il nuovo albero di navigazione con due alternative:

**Opzione A**: Anagrafiche come sezione autonoma in sidebar
```
Impostazioni
├─ Generali
├─ Piano dei conti
├─ Budget
Anagrafiche          ← NUOVO, livello principale
├─ Clienti            ← nuovo
├─ Fornitori           ← spostato
├─ Personale           ├── spostato OPURE mantieni /staff
└─ Utenti              ← spostato
```

**Opzione B**: Anagrafiche come sotto-voce di Impostazioni
```
Impostazioni
├─ Generali
├─ Piano dei conti
├─ Budget
├─ Anagrafiche          ← sotto-voce
│   ├─ Clienti           ← nuovo
│   ├─ Fornitori
│   ├─ Personale
│   └─ Utenti
```

Per ogni opzione indica:
- Pro: vantaggi UX/UI
- Contro: svantaggi
- Impatto su routing e navigazione
- Raccomandazione finale con motivazione

## FASE 3: Piano di Implementazione
Una volta approvata l'opzione, fornisce un piano step-by-step che includa:

3.1. **Creazione anagrafica Clienti da zero**
    - Struttura pagina: layout + components
    - CRUD operation (create, read, update, delete)
    - Integrazione con Prisma (verifica se modello Cliente esiste)
    - UI consistency con altre anagrafiche

3.2. **Spostamento Fornitori**
    - Sposta cartella: `impostazioni/fornitori` → `anagrafiche/fornitori`
    - Aggiorna tutti i riferimenti alla route

3.3. **Spostamento Utenti**
    - Sposta cartella: `impostazioni/utenti` → `anagrafiche/utenti`
    - Aggiorna tutti i riferimenti alla route

3.4. **Decisione su Personale**
    - Se spostare: implementare come 3.2 e 3.3
    - Se mantenere: lasciare `/staff` ma aggiungere link da Anagrafiche

3.5. **Aggiornamento Sidebar**
    - Modifica structure menu items
    - Aggiunge nuova voce "Anagrafiche" con relative sotto-voci
    - Rimuove "Utenti" e "Fornitori" da sotto "Impostazioni"

3.6. **Verifica e Testing**
    - Checklist dei test da eseguire:
      - Navigazione funziona per tutte le nuove route
      - Breadcrumb aggiornato correttamente
      - Permessi utente mantenuti (admin-only per alcune sezioni)
      - Nessun link broken o 404
      - UI responsive e consistente

Output atteso della Fase 3:
```markdown
## PIANO DI IMPLEMENTAZIONE

### Struttura Cartelle
src/app/(dashboard)/
├── anagrafiche/           ← NUOVA cartella
│   ├── layout.tsx          ← layout condiviso
│   ├── page.tsx             ← redirect alla prima anagrafica
│   ├── clienti/              ← NUOVO
│   │   └── page.tsx
│   ├── fornitori/            ← SPOSTATO da impostazioni/
│   │   └── page.tsx
│   ├── personale/            ← SPOSTATO o mantenuto /staff
│   │   └── page.tsx
│   └── utenti/               ← SPOSTATO da impostazioni/
│       └── page.tsx

### Checklist Implementazione
- [ ] Creazione cartella anagrafiche/ e layout.tsx
- [ ] Creazione anagrafica Clienti
- [ ] Spostamento Fornitori
- [ ] Spostamento Utenti
- [ ] Gestione Personale
- [ ] Aggiornamento Sidebar
- [ ] Verifica routing
- [ ] Test permessi
- [ ] Test UI/UX
```

## VINCOLI
- NON modificare il database schema (Prisma)
- Mantenere i permessi esistenti (admin, manager, staff)
- NON rompere funzionalità esistenti
- Mantenere consistency UI con shadcn/ui components
- Le API routes possono essere spostate/aggiornate se necessario

## OUTPUT FORMAT
Rispondi in questo formato esatto:

---
### FASE 1: ANALISI DELLO STATO ATTUALE
[Inserisci qui l'output della Fase 1]

---

### FASE 2: PROPOSTA ARCHITETTURALE
[Inserisci qui l'output della Fase 2 con le due opzioni]

---

### FASE 3: PIANO DI IMPLEMENTAZIONE
[Inserisci qui l'output della Fase 3]

---

### RACCOMANDAZIONE FINALE
Basandomi sull'analisite, raccomando: **[Opzione A o B]**
Motivazione: [spiega perché]

Procedi con l'implementazione?
SI - Procedi con Fase 3
NO - Vorrei modifiche alla proposta
</output_format>

<quality_criteria>
Alla fine dell'analisite, auto-verifica:
1. Tutte le anagrafiche sono state mappate correttamente
2. Le dipendenze tra componenti sono state identificate
3. La proposta architetturale è logica e coerente con il resto dell'applicazione
4. Il piano di implementazione è completo e eseguibile
5. I permessi utente sono presi in considerazione
</quality_criteria>
```

---

## Tecniche Applicate

| Tecnica | Motivazione |
|---------|-------------|
| **XML Tags** | Struttura chiara e separazione tra contesto, task, vincoli e output |
| **Role Assignment** | Esplicita il ruolo di "senior frontend architect" per giustificare l'approccio |
| **Context Completo** | Include stack tecnologico, struttura attuale, posizioni file - tutto il contesto necessario |
| **Chain of Thought** | Richiede un'analis multi-step (3 fasi) con output intermedi definito |
| **Structured Output** | Format output esatto con sezioni e markdown per consistenza |
| **Constraints** | Vincoli espliciti su cosa NON fare (non modificare Prisma, non rompere funzionalità) |
| **Quality Criteria** | Auto-verifica finale per assicurare completezza |
| **Examples** | Include strutture di cartelle e tabelle per chiarire l'output atteso |

---

## Note d'uso

**Placeholder da personalizzare**: Nessuno - il prompt è completo e autonomo

**Dove incollarlo**: Incolla come **user message** in una nuova conversazione con Claude (o un altro LLM). Il role assignment e il contesto sono già inclusi.

**Parametri da adattare**:
- Se l'utente vuole un'opzione specifica (A o B) per l'architettura, modificare la FASE 2
- Se ci sono vincoli aggiuntivi (es. non spostare Personale), aggiungere ai CONSTRAINTS

---

## Suggerimenti di iterazione

**Se l'analis iniziale non è abbastanza dettagliata**:
- Aggiungi alla FASE 1: "Includi screenshot/snippet della sidebar attuale"
- Specifica: "Mostra anche il codice delle sezioni rilevanti dei componenti"

**Se vuoi un output più sintetico**:
- Rimuovi le sezioni "Output atteso" e usa un formato più compatto

**Se vuoi che l'agente proceda direttamente con l'implementazione**:
- Aggiungi alla fine: "Dopo l'analisie, procedi immediatamente con l'implementazione della FASE 3 senza chiedere conferma"

**Per varianti architetturali**:
- Modica la FASE 2 per includere opzioni aggiuntive (es. Anagrafiche come tab orizzontale invece che accordion)
