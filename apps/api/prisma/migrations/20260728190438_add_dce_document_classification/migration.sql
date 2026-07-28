-- AlterTable
-- updated_at backfilled to now() for any pre-existing row (mission: preserve existing data,
-- never leave a NOT NULL column without a value on a non-empty table); Prisma's @updatedAt keeps
-- managing it from the application going forward, this DEFAULT only covers the migration itself.
ALTER TABLE "dce_documents" ADD COLUMN     "category" VARCHAR(20) NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "processing_status" VARCHAR(20) NOT NULL DEFAULT 'READY_FOR_OCR',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
