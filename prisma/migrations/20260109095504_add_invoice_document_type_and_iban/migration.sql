-- AlterTable
ALTER TABLE "electronic_invoices" ADD COLUMN "document_type" TEXT;

-- AlterTable
ALTER TABLE "invoice_deadlines" ADD COLUMN "iban" TEXT;
