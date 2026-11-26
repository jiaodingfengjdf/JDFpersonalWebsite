ALTER TABLE "library_book" ADD COLUMN "category" text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS "idx_library_category" ON "library_book" ("category");
