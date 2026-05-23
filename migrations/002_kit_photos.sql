ALTER TABLE photos
    ADD COLUMN IF NOT EXISTS container_id UUID REFERENCES containers(id) ON DELETE CASCADE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'one_photo_target'
    ) THEN
        ALTER TABLE photos ADD CONSTRAINT one_photo_target CHECK (
            (item_id IS NOT NULL AND container_id IS NULL)
                OR (item_id IS NULL AND container_id IS NOT NULL)
        );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_photos_container ON photos(container_id);
