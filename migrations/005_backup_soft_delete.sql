ALTER TABLE backup_targets
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

ALTER TABLE backup_schedules
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_backup_targets_active_created_at
    ON backup_targets (created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_backup_schedules_active_created_at
    ON backup_schedules (created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_backup_schedules_active_enabled
    ON backup_schedules (enabled, target_id)
    WHERE deleted_at IS NULL;
