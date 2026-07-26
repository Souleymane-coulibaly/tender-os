-- CreateTable
CREATE TABLE "platform_administrators" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_administrators_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_administrators_user_id_key" ON "platform_administrators"("user_id");

-- AddForeignKey
ALTER TABLE "platform_administrators" ADD CONSTRAINT "platform_administrators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
