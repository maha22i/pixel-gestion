ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "ai_api_key" text NOT NULL DEFAULT '';
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "ai_model" text NOT NULL DEFAULT 'gpt-4.1-mini';
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "ai_enabled" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "ai_conversations" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL DEFAULT 'Nouvelle conversation',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ai_conversations_user_idx" ON "ai_conversations" ("user_id", "updated_at");

CREATE TABLE IF NOT EXISTS "ai_messages" (
  "id" serial PRIMARY KEY,
  "conversation_id" integer NOT NULL REFERENCES "ai_conversations"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "content" text NOT NULL DEFAULT '',
  "tool_calls" jsonb,
  "tool_call_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ai_messages_conversation_idx" ON "ai_messages" ("conversation_id", "id");
