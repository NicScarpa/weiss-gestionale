-- Fase 2 dell'integrazione open banking: i conti che il consenso copre ma che
-- non vanno importati.
-- Spec: docs/superpowers/specs/2026-08-12-open-banking-fase-2-design.md

ALTER TABLE "bank_connections"
    ADD COLUMN "conti_ignorati" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
