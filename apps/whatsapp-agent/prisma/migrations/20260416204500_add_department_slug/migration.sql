ALTER TABLE "Department" ADD COLUMN "slug" TEXT;

CREATE OR REPLACE FUNCTION normalize_department_slug(input_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  slug TEXT;
BEGIN
  slug := lower(coalesce(input_text, ''));
  slug := translate(
    slug,
    'áàâãäåæçéèêëíìîïñóòôõöøœúùûüýÿ',
    'aaaaaaaceeeeiiiinooooooouuuuyy'
  );
  slug := regexp_replace(slug, '[^a-z0-9]+', '-', 'g');
  slug := regexp_replace(slug, '-{2,}', '-', 'g');
  slug := regexp_replace(slug, '(^-|-$)', '', 'g');

  IF slug = '' THEN
    slug := 'department';
  END IF;

  RETURN slug;
END;
$$;

DO $$
DECLARE
  rec RECORD;
  base_slug TEXT;
  candidate_slug TEXT;
  suffix_number INTEGER;
BEGIN
  FOR rec IN
    SELECT id, "clientId", name, "createdAt"
    FROM "Department"
    ORDER BY "clientId" ASC, "createdAt" ASC, id ASC
  LOOP
    base_slug := normalize_department_slug(rec.name);
    candidate_slug := base_slug;
    suffix_number := 2;

    WHILE EXISTS (
      SELECT 1
      FROM "Department" existing
      WHERE existing."clientId" = rec."clientId"
        AND existing.slug = candidate_slug
        AND existing.id <> rec.id
    ) LOOP
      candidate_slug := base_slug || '-' || suffix_number::TEXT;
      suffix_number := suffix_number + 1;
    END LOOP;

    UPDATE "Department"
    SET slug = candidate_slug
    WHERE id = rec.id;
  END LOOP;
END;
$$;

ALTER TABLE "Department" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "Department_clientId_slug_key" ON "Department"("clientId", "slug");

DROP FUNCTION normalize_department_slug(TEXT);
