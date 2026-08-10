-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('INCASSO', 'USCITA', 'VERSAMENTO', 'PRELIEVO', 'GIROCONTO');

-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "entry_type" "EntryType";
