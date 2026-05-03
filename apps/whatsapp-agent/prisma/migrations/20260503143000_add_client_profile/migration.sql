-- Add optional tenant UX profile. Null remains backward-compatible and is treated as "business".
ALTER TABLE "Client" ADD COLUMN "profile" TEXT;
