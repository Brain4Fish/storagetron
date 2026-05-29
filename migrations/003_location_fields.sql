ALTER TABLE locations
    ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS room TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS shelf TEXT NOT NULL DEFAULT '';

UPDATE locations
SET room = name
WHERE country = '' AND city = '' AND room = '' AND shelf = '' AND name <> '';
