-- AlterTable
ALTER TABLE "dce_documents" ALTER COLUMN "processing_status" SET DEFAULT 'IMPORTED',
ALTER COLUMN "processing_status" SET DATA TYPE VARCHAR(32),
ALTER COLUMN "updated_at" DROP DEFAULT;
