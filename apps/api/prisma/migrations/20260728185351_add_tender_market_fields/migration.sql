-- AlterTable
ALTER TABLE "tenders" ADD COLUMN     "country" VARCHAR(10) DEFAULT 'FR',
ADD COLUMN     "external_reference" VARCHAR(255),
ADD COLUMN     "language" VARCHAR(10) DEFAULT 'fr',
ADD COLUMN     "source" VARCHAR(20) DEFAULT 'MANUAL',
ADD COLUMN     "source_url" VARCHAR(2048),
ALTER COLUMN "market_type" SET DEFAULT 'PUBLIC',
ALTER COLUMN "currency" SET DEFAULT 'EUR';
