# Modifica e Cancellazione Richieste Ferie (Admin)

## Requisito

Aggiungere la possibilità per admin di modificare e cancellare le richieste ferie approvate e in attesa.

## Implementazione Completata

**Commit**: `f01cd51` - feat(ferie-permessi): Aggiunge modifica e cancellazione richieste per admin

**Data**: 2026-01-10

## File Modificati

### 1. `src/app/api/leave-requests/[id]/route.ts`

**Modifiche API**:

- **PUT** - Nuovo endpoint per modificare richieste (solo admin)
  - Schema Zod per validazione: `startDate`, `endDate`, `leaveTypeId`, `notes`, `isPartialDay`, `startTime`, `endTime`
  - Ricalcolo automatico giorni se cambiano le date
  - Se la richiesta era già APPROVED, aggiorna i saldi ferie del dipendente
  - Gestisce cambio tipo assenza con riallocazione saldi (decrementa vecchio tipo, incrementa nuovo)

- **DELETE** - Modificato per permettere ad admin di cancellare anche richieste approvate passate
  - Rimossa restrizione `startDate <= new Date()` per admin
  - Admin può cancellare qualsiasi richiesta non ancora CANCELLED
  - Ripristina correttamente il saldo ferie

### 2. `src/app/(dashboard)/ferie-permessi/page.tsx`

**Modifiche UI**:

- Nuovi stati per dialog modifica/cancellazione
- Nuove mutations per PUT e DELETE
- Pulsanti modifica (matita) e cancella (cestino) visibili solo ad admin
- I pulsanti non appaiono per richieste già CANCELLED

**Dialog Modifica**:
- Data inizio e fine (input date)
- Tipo assenza (select dropdown)
- Note (textarea)
- Pulsanti Annulla/Salva modifiche

**AlertDialog Cancellazione**:
- Mostra nome dipendente, tipo assenza e date
- Avviso speciale per richieste già approvate: "Il saldo ferie del dipendente verrà ripristinato"
- Pulsanti Annulla/Conferma annullamento (rosso)

## Logica Saldi Ferie

### Modifica Date (richiesta APPROVED)
```
nuoviGiorni = calculateWorkingDays(nuovaDataInizio, nuovaDataFine)
diffGiorni = nuoviGiorni - vecchiGiorni
LeaveBalance.used += diffGiorni
```

### Cambio Tipo Assenza (richiesta APPROVED)
```
// Vecchio tipo
LeaveBalance[vecchioTipo].used -= giorni

// Nuovo tipo
LeaveBalance[nuovoTipo].used += giorni
```

### Cancellazione
```
if (status === 'APPROVED') {
  LeaveBalance.used -= giorni
} else if (status === 'PENDING') {
  LeaveBalance.pending -= giorni
}
```

## Test Eseguiti

1. ✅ Dialog modifica si apre con dati precompilati
2. ✅ Dialog cancellazione mostra avviso per richieste approvate
3. ✅ Pulsanti visibili solo per admin
4. ✅ Pulsanti nascosti per richieste CANCELLED
