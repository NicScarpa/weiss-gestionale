-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "codice_fiscale_hash" TEXT,
ADD COLUMN     "paese" TEXT DEFAULT 'IT',
ADD COLUMN     "payment_terms_days" INTEGER;

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "phone" TEXT;

-- CreateIndex
CREATE INDEX "customers_codice_fiscale_hash_idx" ON "customers"("codice_fiscale_hash");
