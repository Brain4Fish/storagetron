ALTER TABLE items
    ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN category TEXT NOT NULL DEFAULT '',
    ADD COLUMN acquisition_year SMALLINT,
    ADD COLUMN condition TEXT NOT NULL DEFAULT 'used',
    ADD COLUMN serial_number TEXT NOT NULL DEFAULT '',
    ADD COLUMN estimated_value NUMERIC(14,2),
    ADD COLUMN value_currency VARCHAR(3),
    ADD COLUMN source_language VARCHAR(8) NOT NULL DEFAULT 'ru',
    ADD CONSTRAINT items_quantity_positive CHECK (quantity > 0),
    ADD CONSTRAINT items_condition_valid CHECK (condition IN ('new', 'used')),
    ADD CONSTRAINT items_estimated_value_nonnegative CHECK (estimated_value >= 0),
    ADD CONSTRAINT items_value_currency_format CHECK (
        value_currency IS NULL OR value_currency ~ '^[A-Z]{3}$'
    ),
    ADD CONSTRAINT items_value_currency_pair CHECK (
        (estimated_value IS NULL AND value_currency IS NULL)
        OR (estimated_value IS NOT NULL AND value_currency IS NOT NULL)
    );

ALTER TABLE containers
    ADD COLUMN package_code TEXT NOT NULL DEFAULT '',
    ADD COLUMN gross_weight_kg NUMERIC(12,3),
    ADD COLUMN volume_m3 NUMERIC(12,4),
    ADD COLUMN estimated_value NUMERIC(14,2),
    ADD COLUMN value_currency VARCHAR(3),
    ADD COLUMN source_language VARCHAR(8) NOT NULL DEFAULT 'ru',
    ADD CONSTRAINT containers_gross_weight_positive CHECK (gross_weight_kg > 0),
    ADD CONSTRAINT containers_volume_positive CHECK (volume_m3 > 0),
    ADD CONSTRAINT containers_estimated_value_nonnegative CHECK (estimated_value >= 0),
    ADD CONSTRAINT containers_value_currency_format CHECK (
        value_currency IS NULL OR value_currency ~ '^[A-Z]{3}$'
    ),
    ADD CONSTRAINT containers_value_currency_pair CHECK (
        (estimated_value IS NULL AND value_currency IS NULL)
        OR (estimated_value IS NOT NULL AND value_currency IS NOT NULL)
    );

CREATE UNIQUE INDEX idx_containers_package_code_ci
    ON containers (lower(package_code))
    WHERE package_code <> '';
