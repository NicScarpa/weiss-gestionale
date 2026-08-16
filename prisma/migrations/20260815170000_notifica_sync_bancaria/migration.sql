-- Un valore nuovo per l'enum delle notifiche: la sincronizzazione bancaria
-- notturna fallita, destinata agli admin.
--
-- `IF NOT EXISTS` rende la migrazione ripetibile senza errore, come già fatto
-- per `ImportSource.PSD2_GOCARDLESS` nella Fase 1 dell'open banking.
--
-- `NotificationChannel` non si tocca: ha già `EMAIL` e `IN_APP`.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BANK_SYNC_FAILED';
