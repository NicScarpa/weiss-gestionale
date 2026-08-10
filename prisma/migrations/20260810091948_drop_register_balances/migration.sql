/*
  Warnings:

  - You are about to drop the `register_balances` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "register_balances" DROP CONSTRAINT "register_balances_venue_id_fkey";

-- DropTable
DROP TABLE "register_balances";
