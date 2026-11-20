ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "proof_filename" text;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "proof_stored" text;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "proof_mime" text;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "proof_size" integer;

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "proof_filename" text;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "proof_stored" text;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "proof_mime" text;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "proof_size" integer;
