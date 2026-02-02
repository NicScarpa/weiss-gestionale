# Tracciamento Certificazioni Dipendenti

## Stato: COMPLETATO

## Riepilogo
Implementato il sistema di tracciamento attestati obbligatori nella scheda dipendente. 5 tipi di certificazione (HACCP, Sicurezza, Antincendio, Primo Soccorso, Preposto) con upload documenti base64, calcolo stato automatico (valida/in scadenza/scaduta), e warning per certificazioni obbligatorie mancanti.

## File Creati/Modificati

### Schema e Tipi
| File | Azione | Descrizione |
|------|--------|-------------|
| `prisma/schema.prisma` | Modificato | Aggiunto enum `CertificationType` e model `Certification` con relazione su User |
| `src/types/certifications.ts` | Creato | Tipi TS, costanti CERTIFICATION_TYPES, `getCertificationStatus()`, `getMandatoryCertifications()` |
| `src/lib/validations/certifications.ts` | Creato | Schemi Zod `CreateCertificationSchema` e `UpdateCertificationSchema` |

### API Routes
| File | Azione | Descrizione |
|------|--------|-------------|
| `src/app/api/staff/[id]/certifications/route.ts` | Creato | GET (lista con hasDocument flag) + POST (crea con check duplicato 409) |
| `src/app/api/staff/[id]/certifications/[certId]/route.ts` | Creato | GET (dettaglio con documentUrl) + PUT (modifica parziale) + DELETE |

### Componenti UI
| File | Azione | Descrizione |
|------|--------|-------------|
| `src/components/staff/CertificationDialog.tsx` | Creato | Dialog aggiunta/modifica con upload file base64 (max 5MB) |
| `src/components/staff/CertificationsBox.tsx` | Creato | Card con lista, badge stato colorati, warning obbligatori, confirm delete |
| `src/app/(dashboard)/staff/[id]/page.tsx` | Modificato | Integrato CertificationsBox tra EmployeeProfileForm e ConstraintEditor |

## Decisioni Architetturali
- **Stato calcolato, non stored**: evita sincronizzazione, sempre aggiornato
- **Base64 in PostgreSQL TEXT**: segue pattern LeaveRequest.documentUrl
- **1 certificazione per tipo per utente**: rinnovo = modifica esistente
- **Hard delete**: certificazioni scadute vengono aggiornate, non serve storico eliminati
- **RBAC**: staff vede proprie in sola lettura, admin/manager modificano con restrizione sede

## Verifiche Effettuate
- `prisma generate` OK
- `prisma db push` OK (database sincronizzato)
- `tsc --noEmit` OK (zero errori TypeScript)
- `eslint` OK (zero warning/errori sui file nuovi)
