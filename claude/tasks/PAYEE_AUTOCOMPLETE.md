# Autocomplete Beneficiario nella Sezione Uscite

## Status: COMPLETATO

## Modifiche Effettuate

### 1. `src/hooks/useDebounce.ts` (NUOVO)
- Estratto hook `useDebounce<T>` generico da `InvoiceList.tsx`
- Rimosso il duplicato inline in `InvoiceList.tsx` e aggiornato l'import

### 2. `src/app/api/payee-suggestions/route.ts` (NUOVO)
- Endpoint GET con parametri `q` (query, min 2 caratteri) e `venueId` (opzionale)
- Query parallele (Promise.all) su Supplier e DailyExpense
- Fornitori: filtro case-insensitive, max 10, solo attivi
- Storici: distinct payee, esclude [EXTRA]/[PAGATO], max 20, filtro per venue
- Deduplica: se un nome storico corrisponde a un fornitore, tiene solo il fornitore
- Risposta: `{ suggestions: [{ name, source, defaultAccountId? }] }`

### 3. `src/components/ui/payee-autocomplete.tsx` (NUOVO)
- Componente combobox basato su Command + Popover (stesso pattern di AddressAutocomplete)
- Debounce 300ms sulla digitazione via `useDebounce`
- Due gruppi visivi: "Fornitori" (icona Building2) e "Recenti" (icona Clock)
- Touch-friendly con `min-h-[44px]` per ogni item
- `shouldFilter={false}` per filtraggio lato server
- Se payee inizia con `[EXTRA]`/`[PAGATO]`: renderizza Input disabilitato
- Callback `onSupplierSelect` per auto-compilazione accountId

### 4. `src/components/chiusura/ExpensesSection.tsx` (MODIFICATO)
- Aggiunto import di PayeeAutocomplete
- Aggiunto `venueId?: string` alle props
- Sostituito Input beneficiario con PayeeAutocomplete
- Handler `onSupplierSelect`: auto-compila accountId dal fornitore

### 5. `src/components/chiusura/ClosureForm.tsx` (MODIFICATO)
- Aggiunto `venueId={venueId}` come prop a ExpensesSection

## Verifica
- TypeScript check: zero errori (`npx tsc --noEmit`)
- Nessuna migrazione DB necessaria
- Nessun breaking change su interfacce esistenti
