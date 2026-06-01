package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/Brain4Fish/storagetron/internal/backup"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Postgres struct {
	db *pgxpool.Pool
}

func NewPostgres(db *pgxpool.Pool) *Postgres {
	return &Postgres{db: db}
}

func (s *Postgres) CreateTarget(ctx context.Context, target backup.BackupTarget) (backup.BackupTarget, error) {
	if target.ID == uuid.Nil {
		target.ID = uuid.New()
	}
	if len(target.Configuration) == 0 {
		target.Configuration = json.RawMessage(`{}`)
	}
	err := s.db.QueryRow(ctx, `
		INSERT INTO backup_targets (id, name, type, enabled, configuration)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, name, type, enabled, configuration, created_at, updated_at, deleted_at
	`, target.ID, target.Name, target.Type, target.Enabled, target.Configuration).Scan(
		&target.ID, &target.Name, &target.Type, &target.Enabled, &target.Configuration, &target.CreatedAt, &target.UpdatedAt, &target.DeletedAt,
	)
	return target, err
}

func (s *Postgres) ListTargets(ctx context.Context) ([]backup.BackupTarget, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, name, type, enabled, configuration, created_at, updated_at, deleted_at
		FROM backup_targets
		WHERE deleted_at IS NULL
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var targets []backup.BackupTarget
	for rows.Next() {
		var target backup.BackupTarget
		if err := rows.Scan(&target.ID, &target.Name, &target.Type, &target.Enabled, &target.Configuration, &target.CreatedAt, &target.UpdatedAt, &target.DeletedAt); err != nil {
			return nil, err
		}
		targets = append(targets, target)
	}
	return targets, rows.Err()
}

func (s *Postgres) GetTarget(ctx context.Context, id uuid.UUID) (backup.BackupTarget, error) {
	var target backup.BackupTarget
	err := s.db.QueryRow(ctx, `
		SELECT id, name, type, enabled, configuration, created_at, updated_at, deleted_at
		FROM backup_targets
		WHERE id = $1 AND deleted_at IS NULL
	`, id).Scan(&target.ID, &target.Name, &target.Type, &target.Enabled, &target.Configuration, &target.CreatedAt, &target.UpdatedAt, &target.DeletedAt)
	return target, err
}

func (s *Postgres) UpdateTarget(ctx context.Context, id uuid.UUID, patch backup.BackupTargetPatch) (backup.BackupTarget, error) {
	var target backup.BackupTarget
	err := s.db.QueryRow(ctx, `
		UPDATE backup_targets
		SET name = $2, enabled = $3, configuration = $4, updated_at = now()
		WHERE id = $1 AND deleted_at IS NULL
		RETURNING id, name, type, enabled, configuration, created_at, updated_at, deleted_at
	`, id, patch.Name, patch.Enabled, patch.Configuration).Scan(
		&target.ID, &target.Name, &target.Type, &target.Enabled, &target.Configuration, &target.CreatedAt, &target.UpdatedAt, &target.DeletedAt,
	)
	return target, err
}

func (s *Postgres) SoftDeleteTarget(ctx context.Context, id uuid.UUID) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	cmd, err := tx.Exec(ctx, `
		UPDATE backup_targets
		SET enabled = false, deleted_at = now(), updated_at = now()
		WHERE id = $1 AND deleted_at IS NULL
	`, id)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	if _, err := tx.Exec(ctx, `
		UPDATE backup_schedules
		SET enabled = false, deleted_at = now(), updated_at = now()
		WHERE target_id = $1 AND deleted_at IS NULL
	`, id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Postgres) CreateSchedule(ctx context.Context, schedule backup.BackupSchedule) (backup.BackupSchedule, error) {
	if schedule.ID == uuid.Nil {
		schedule.ID = uuid.New()
	}
	retention, err := json.Marshal(schedule.Retention)
	if err != nil {
		return backup.BackupSchedule{}, err
	}
	err = s.db.QueryRow(ctx, `
		INSERT INTO backup_schedules (id, target_id, name, cron_expression, enabled, retention_policy)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, target_id, name, cron_expression, enabled, retention_policy, created_at, updated_at, deleted_at
	`, schedule.ID, schedule.TargetID, schedule.Name, schedule.CronExpression, schedule.Enabled, retention).Scan(
		&schedule.ID, &schedule.TargetID, &schedule.Name, &schedule.CronExpression, &schedule.Enabled, &retention, &schedule.CreatedAt, &schedule.UpdatedAt, &schedule.DeletedAt,
	)
	if err != nil {
		return backup.BackupSchedule{}, err
	}
	if err := json.Unmarshal(retention, &schedule.Retention); err != nil {
		return backup.BackupSchedule{}, err
	}
	return schedule, nil
}

func (s *Postgres) ListSchedules(ctx context.Context, enabledOnly bool) ([]backup.BackupSchedule, error) {
	query := `
		SELECT s.id, s.target_id, s.name, s.cron_expression, s.enabled, s.retention_policy, s.created_at, s.updated_at, s.deleted_at
		FROM backup_schedules s
	`
	args := []any{}
	where := []string{"s.deleted_at IS NULL"}
	if enabledOnly {
		query += ` JOIN backup_targets t ON t.id = s.target_id`
		where = append(where, "s.enabled = true", "t.enabled = true", "t.deleted_at IS NULL")
	}
	query += ` WHERE ` + strings.Join(where, " AND ")
	query += ` ORDER BY s.created_at DESC`

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var schedules []backup.BackupSchedule
	for rows.Next() {
		schedule, err := scanSchedule(rows)
		if err != nil {
			return nil, err
		}
		schedules = append(schedules, schedule)
	}
	return schedules, rows.Err()
}

func (s *Postgres) GetSchedule(ctx context.Context, id uuid.UUID) (backup.BackupSchedule, error) {
	row := s.db.QueryRow(ctx, `
		SELECT id, target_id, name, cron_expression, enabled, retention_policy, created_at, updated_at, deleted_at
		FROM backup_schedules
		WHERE id = $1 AND deleted_at IS NULL
	`, id)
	return scanSchedule(row)
}

func (s *Postgres) UpdateSchedule(ctx context.Context, id uuid.UUID, patch backup.BackupSchedulePatch) (backup.BackupSchedule, error) {
	retention, err := json.Marshal(patch.Retention)
	if err != nil {
		return backup.BackupSchedule{}, err
	}
	row := s.db.QueryRow(ctx, `
		UPDATE backup_schedules
		SET target_id = $2, name = $3, cron_expression = $4, enabled = $5, retention_policy = $6, updated_at = now()
		WHERE id = $1 AND deleted_at IS NULL
		RETURNING id, target_id, name, cron_expression, enabled, retention_policy, created_at, updated_at, deleted_at
	`, id, patch.TargetID, patch.Name, patch.CronExpression, patch.Enabled, retention)
	return scanSchedule(row)
}

func (s *Postgres) SoftDeleteSchedule(ctx context.Context, id uuid.UUID) error {
	cmd, err := s.db.Exec(ctx, `
		UPDATE backup_schedules
		SET enabled = false, deleted_at = now(), updated_at = now()
		WHERE id = $1 AND deleted_at IS NULL
	`, id)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (s *Postgres) CreateBackupRun(ctx context.Context, targetID uuid.UUID, scheduleID *uuid.UUID) (backup.BackupRun, error) {
	run := backup.BackupRun{ID: uuid.New(), TargetID: targetID, ScheduleID: scheduleID, Status: backup.StatusPending, Phase: "queued"}
	err := s.db.QueryRow(ctx, `
		INSERT INTO backup_runs (id, target_id, schedule_id, status, phase)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, target_id, schedule_id, status, phase, progress_percent, started_at, finished_at,
		          size_bytes, backup_path, error_message, created_at, updated_at
	`, run.ID, run.TargetID, run.ScheduleID, run.Status, run.Phase).Scan(
		&run.ID, &run.TargetID, &run.ScheduleID, &run.Status, &run.Phase, &run.ProgressPercent, &run.StartedAt, &run.FinishedAt,
		&run.SizeBytes, &run.BackupPath, &run.ErrorMessage, &run.CreatedAt, &run.UpdatedAt,
	)
	return run, err
}

func (s *Postgres) ListBackupRuns(ctx context.Context, limit int) ([]backup.BackupRun, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	rows, err := s.db.Query(ctx, `
		SELECT id, target_id, schedule_id, status, phase, progress_percent, started_at, finished_at,
		       size_bytes, backup_path, error_message, created_at, updated_at
		FROM backup_runs
		ORDER BY created_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var runs []backup.BackupRun
	for rows.Next() {
		run, err := scanBackupRun(rows)
		if err != nil {
			return nil, err
		}
		runs = append(runs, run)
	}
	return runs, rows.Err()
}

func (s *Postgres) ClaimPendingBackupRun(ctx context.Context) (*backup.BackupRun, error) {
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var id uuid.UUID
	err = tx.QueryRow(ctx, `
		SELECT id
		FROM backup_runs
		WHERE status = 'pending'
		ORDER BY created_at ASC
		FOR UPDATE SKIP LOCKED
		LIMIT 1
	`).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	row := tx.QueryRow(ctx, `
		UPDATE backup_runs
		SET status = 'running', phase = 'initializing', progress_percent = 1,
		    started_at = COALESCE(started_at, now()), updated_at = now()
		WHERE id = $1
		RETURNING id, target_id, schedule_id, status, phase, progress_percent, started_at, finished_at,
		          size_bytes, backup_path, error_message, created_at, updated_at
	`, id)
	run, err := scanBackupRun(row)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &run, nil
}

func (s *Postgres) UpdateBackupRunProgress(ctx context.Context, id uuid.UUID, phase string, percent int) error {
	_, err := s.db.Exec(ctx, `
		UPDATE backup_runs
		SET phase = $2, progress_percent = $3, updated_at = now()
		WHERE id = $1
	`, id, phase, clampPercent(percent))
	return err
}

func (s *Postgres) CompleteBackupRun(ctx context.Context, id uuid.UUID, sizeBytes int64, backupPath string) error {
	_, err := s.db.Exec(ctx, `
		UPDATE backup_runs
		SET status = 'completed', phase = 'completed', progress_percent = 100, finished_at = now(),
		    size_bytes = $2, backup_path = $3, error_message = NULL, updated_at = now()
		WHERE id = $1
	`, id, sizeBytes, backupPath)
	return err
}

func (s *Postgres) FailBackupRun(ctx context.Context, id uuid.UUID, message string) error {
	_, err := s.db.Exec(ctx, `
		UPDATE backup_runs
		SET status = 'failed', phase = 'failed', finished_at = now(), error_message = $2, updated_at = now()
		WHERE id = $1
	`, id, trimErr(message))
	return err
}

func (s *Postgres) CreateRestoreRun(ctx context.Context, targetID uuid.UUID, backupIdentifier string) (backup.RestoreRun, error) {
	run := backup.RestoreRun{ID: uuid.New(), TargetID: targetID, BackupIdentifier: backupIdentifier, Status: backup.StatusPending, Phase: "queued"}
	err := s.db.QueryRow(ctx, `
		INSERT INTO restore_runs (id, target_id, backup_identifier, status, phase)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, target_id, backup_identifier, status, phase, progress_percent, started_at, finished_at,
		          error_message, created_at, updated_at
	`, run.ID, run.TargetID, run.BackupIdentifier, run.Status, run.Phase).Scan(
		&run.ID, &run.TargetID, &run.BackupIdentifier, &run.Status, &run.Phase, &run.ProgressPercent, &run.StartedAt, &run.FinishedAt,
		&run.ErrorMessage, &run.CreatedAt, &run.UpdatedAt,
	)
	return run, err
}

func (s *Postgres) ListRestoreRuns(ctx context.Context, limit int) ([]backup.RestoreRun, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	rows, err := s.db.Query(ctx, `
		SELECT id, target_id, backup_identifier, status, phase, progress_percent, started_at, finished_at,
		       error_message, created_at, updated_at
		FROM restore_runs
		ORDER BY created_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var runs []backup.RestoreRun
	for rows.Next() {
		run, err := scanRestoreRun(rows)
		if err != nil {
			return nil, err
		}
		runs = append(runs, run)
	}
	return runs, rows.Err()
}

func (s *Postgres) ClaimPendingRestoreRun(ctx context.Context) (*backup.RestoreRun, error) {
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var id uuid.UUID
	err = tx.QueryRow(ctx, `
		SELECT id
		FROM restore_runs
		WHERE status = 'pending'
		ORDER BY created_at ASC
		FOR UPDATE SKIP LOCKED
		LIMIT 1
	`).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	row := tx.QueryRow(ctx, `
		UPDATE restore_runs
		SET status = 'running', phase = 'initializing', progress_percent = 1,
		    started_at = COALESCE(started_at, now()), updated_at = now()
		WHERE id = $1
		RETURNING id, target_id, backup_identifier, status, phase, progress_percent, started_at, finished_at,
		          error_message, created_at, updated_at
	`, id)
	run, err := scanRestoreRun(row)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &run, nil
}

func (s *Postgres) UpdateRestoreRunProgress(ctx context.Context, id uuid.UUID, phase string, percent int) error {
	_, err := s.db.Exec(ctx, `
		UPDATE restore_runs
		SET phase = $2, progress_percent = $3, updated_at = now()
		WHERE id = $1
	`, id, phase, clampPercent(percent))
	return err
}

func (s *Postgres) CompleteRestoreRun(ctx context.Context, run backup.RestoreRun) error {
	cmd, err := s.db.Exec(ctx, `
		UPDATE restore_runs
		SET status = 'completed', phase = 'completed', progress_percent = 100, finished_at = now(),
		    error_message = NULL, updated_at = now()
		WHERE id = $1
	`, run.ID)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() > 0 {
		return nil
	}
	_, err = s.db.Exec(ctx, `
		INSERT INTO restore_runs (
			id, target_id, backup_identifier, status, phase, progress_percent,
			started_at, finished_at, error_message, created_at, updated_at
		)
		VALUES ($1, $2, $3, 'completed', 'completed', 100, COALESCE($4::timestamptz, now()), now(), NULL, now(), now())
		ON CONFLICT (id) DO UPDATE
		SET status = 'completed',
		    phase = 'completed',
		    progress_percent = 100,
		    finished_at = now(),
		    error_message = NULL,
		    updated_at = now()
	`, run.ID, run.TargetID, run.BackupIdentifier, run.StartedAt)
	return err
}

func (s *Postgres) FailRestoreRun(ctx context.Context, run backup.RestoreRun, message string) error {
	cmd, err := s.db.Exec(ctx, `
		UPDATE restore_runs
		SET status = 'failed', phase = 'failed', finished_at = now(), error_message = $2, updated_at = now()
		WHERE id = $1
	`, run.ID, trimErr(message))
	if err != nil {
		return err
	}
	if cmd.RowsAffected() > 0 {
		return nil
	}
	_, err = s.db.Exec(ctx, `
		INSERT INTO restore_runs (
			id, target_id, backup_identifier, status, phase, progress_percent,
			started_at, finished_at, error_message, created_at, updated_at
		)
		VALUES ($1, $2, $3, 'failed', 'failed', $4, COALESCE($5::timestamptz, now()), now(), $6, now(), now())
		ON CONFLICT (id) DO UPDATE
		SET status = 'failed',
		    phase = 'failed',
		    finished_at = now(),
		    error_message = $6,
		    updated_at = now()
	`, run.ID, run.TargetID, run.BackupIdentifier, clampPercent(run.ProgressPercent), run.StartedAt, trimErr(message))
	return err
}

func (s *Postgres) FailRunningJobs(ctx context.Context, message string) error {
	if _, err := s.db.Exec(ctx, `
		UPDATE backup_runs
		SET status = 'failed', phase = 'failed', finished_at = now(), error_message = $1, updated_at = now()
		WHERE status = 'running'
	`, trimErr(message)); err != nil {
		return err
	}
	_, err := s.db.Exec(ctx, `
		UPDATE restore_runs
		SET status = 'failed', phase = 'failed', finished_at = now(), error_message = $1, updated_at = now()
		WHERE status = 'running'
	`, trimErr(message))
	return err
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanSchedule(row rowScanner) (backup.BackupSchedule, error) {
	var schedule backup.BackupSchedule
	var retention []byte
	if err := row.Scan(&schedule.ID, &schedule.TargetID, &schedule.Name, &schedule.CronExpression, &schedule.Enabled, &retention, &schedule.CreatedAt, &schedule.UpdatedAt, &schedule.DeletedAt); err != nil {
		return backup.BackupSchedule{}, err
	}
	if err := json.Unmarshal(retention, &schedule.Retention); err != nil {
		return backup.BackupSchedule{}, fmt.Errorf("decode retention policy: %w", err)
	}
	return schedule, nil
}

func scanBackupRun(row rowScanner) (backup.BackupRun, error) {
	var run backup.BackupRun
	err := row.Scan(
		&run.ID, &run.TargetID, &run.ScheduleID, &run.Status, &run.Phase, &run.ProgressPercent, &run.StartedAt, &run.FinishedAt,
		&run.SizeBytes, &run.BackupPath, &run.ErrorMessage, &run.CreatedAt, &run.UpdatedAt,
	)
	return run, err
}

func scanRestoreRun(row rowScanner) (backup.RestoreRun, error) {
	var run backup.RestoreRun
	err := row.Scan(
		&run.ID, &run.TargetID, &run.BackupIdentifier, &run.Status, &run.Phase, &run.ProgressPercent, &run.StartedAt, &run.FinishedAt,
		&run.ErrorMessage, &run.CreatedAt, &run.UpdatedAt,
	)
	return run, err
}

func clampPercent(percent int) int {
	if percent < 0 {
		return 0
	}
	if percent > 100 {
		return 100
	}
	return percent
}

func trimErr(message string) string {
	if len(message) <= 2000 {
		return message
	}
	return message[:2000]
}
