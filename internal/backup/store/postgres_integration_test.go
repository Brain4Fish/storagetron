package store

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/Brain4Fish/storagetron/internal/backup"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

func TestPostgresStoreIntegrationTargetScheduleAndSoftDelete(t *testing.T) {
	pool := backupStoreIntegrationPool(t)
	ctx := context.Background()
	store := NewPostgres(pool)

	target, err := store.CreateTarget(ctx, backup.BackupTarget{
		Name:          "Home NAS",
		Type:          backup.TargetTypeSFTP,
		Enabled:       true,
		Configuration: []byte(`{"host":"nas.local"}`),
	})
	require.NoError(t, err)

	schedule, err := store.CreateSchedule(ctx, backup.BackupSchedule{
		TargetID:       target.ID,
		Name:           "Nightly",
		CronExpression: "0 2 * * *",
		Enabled:        true,
		Retention:      backup.RetentionPolicy{KeepLastBackups: 7},
	})
	require.NoError(t, err)

	enabledSchedules, err := store.ListSchedules(ctx, true)
	require.NoError(t, err)
	require.Len(t, enabledSchedules, 1)
	require.Equal(t, schedule.ID, enabledSchedules[0].ID)

	updated, err := store.UpdateTarget(ctx, target.ID, backup.BackupTargetPatch{
		Name:          "Home NAS Updated",
		Enabled:       false,
		Configuration: []byte(`{"host":"nas2.local"}`),
	})
	require.NoError(t, err)
	require.Equal(t, "Home NAS Updated", updated.Name)
	require.False(t, updated.Enabled)

	enabledSchedules, err = store.ListSchedules(ctx, true)
	require.NoError(t, err)
	require.Empty(t, enabledSchedules)

	require.NoError(t, store.SoftDeleteTarget(ctx, target.ID))
	_, err = store.GetTarget(ctx, target.ID)
	require.ErrorIs(t, err, pgx.ErrNoRows)

	schedules, err := store.ListSchedules(ctx, false)
	require.NoError(t, err)
	require.Empty(t, schedules)
}

func TestPostgresStoreIntegrationBackupRunLifecycle(t *testing.T) {
	pool := backupStoreIntegrationPool(t)
	ctx := context.Background()
	store := NewPostgres(pool)
	target := createIntegrationTarget(t, ctx, store)

	run, err := store.CreateBackupRun(ctx, target.ID, nil)
	require.NoError(t, err)
	require.Equal(t, backup.StatusPending, run.Status)
	require.Equal(t, "queued", run.Phase)

	claimed, err := store.ClaimPendingBackupRun(ctx)
	require.NoError(t, err)
	require.NotNil(t, claimed)
	require.Equal(t, run.ID, claimed.ID)
	require.Equal(t, backup.StatusRunning, claimed.Status)
	require.Equal(t, "initializing", claimed.Phase)
	require.Equal(t, 1, claimed.ProgressPercent)

	require.NoError(t, store.UpdateBackupRunProgress(ctx, run.ID, "upload", 150))
	runs, err := store.ListBackupRuns(ctx, 10)
	require.NoError(t, err)
	require.Len(t, runs, 1)
	require.Equal(t, 100, runs[0].ProgressPercent)
	require.Equal(t, "upload", runs[0].Phase)

	require.NoError(t, store.CompleteBackupRun(ctx, run.ID, 42, "backup-id"))
	runs, err = store.ListBackupRuns(ctx, 10)
	require.NoError(t, err)
	require.Equal(t, backup.StatusCompleted, runs[0].Status)
	require.Equal(t, "completed", runs[0].Phase)
	require.Equal(t, int64(42), *runs[0].SizeBytes)
	require.Equal(t, "backup-id", *runs[0].BackupPath)
}

func TestPostgresStoreIntegrationFailRunningJobs(t *testing.T) {
	pool := backupStoreIntegrationPool(t)
	ctx := context.Background()
	store := NewPostgres(pool)
	target := createIntegrationTarget(t, ctx, store)

	backupRun, err := store.CreateBackupRun(ctx, target.ID, nil)
	require.NoError(t, err)
	_, err = store.ClaimPendingBackupRun(ctx)
	require.NoError(t, err)

	restoreRun, err := store.CreateRestoreRun(ctx, target.ID, "backup.tar.zst")
	require.NoError(t, err)
	_, err = store.ClaimPendingRestoreRun(ctx)
	require.NoError(t, err)

	longMessage := strings.Repeat("x", 2200)
	require.NoError(t, store.FailRunningJobs(ctx, longMessage))

	backupRuns, err := store.ListBackupRuns(ctx, 10)
	require.NoError(t, err)
	require.Len(t, backupRuns, 1)
	require.Equal(t, backupRun.ID, backupRuns[0].ID)
	require.Equal(t, backup.StatusFailed, backupRuns[0].Status)
	require.Equal(t, 2000, len(*backupRuns[0].ErrorMessage))

	restoreRuns, err := store.ListRestoreRuns(ctx, 10)
	require.NoError(t, err)
	require.Len(t, restoreRuns, 1)
	require.Equal(t, restoreRun.ID, restoreRuns[0].ID)
	require.Equal(t, backup.StatusFailed, restoreRuns[0].Status)
	require.Equal(t, 2000, len(*restoreRuns[0].ErrorMessage))
}

func createIntegrationTarget(t *testing.T, ctx context.Context, store *Postgres) backup.BackupTarget {
	t.Helper()
	target, err := store.CreateTarget(ctx, backup.BackupTarget{
		Name:          "Home NAS",
		Type:          backup.TargetTypeSFTP,
		Enabled:       true,
		Configuration: []byte(`{}`),
	})
	require.NoError(t, err)
	return target
}

func backupStoreIntegrationPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set TEST_DATABASE_URL to run backup store integration tests against a disposable Postgres database")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	t.Cleanup(cancel)

	pool, err := pgxpool.New(ctx, databaseURL)
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	require.NoError(t, applyBackupStoreMigrations(ctx, pool))
	require.NoError(t, truncateBackupStoreTables(ctx, pool))
	return pool
}

func applyBackupStoreMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	_, file, _, _ := runtime.Caller(0)
	root := filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", ".."))
	files, err := filepath.Glob(filepath.Join(root, "migrations", "*.sql"))
	if err != nil {
		return err
	}
	sort.Strings(files)
	for _, file := range files {
		content, err := os.ReadFile(file)
		if err != nil {
			return err
		}
		if _, err := pool.Exec(ctx, string(content)); err != nil {
			return err
		}
	}
	return nil
}

func truncateBackupStoreTables(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, `
		TRUNCATE
			restore_runs,
			backup_runs,
			backup_schedules,
			backup_targets,
			photos,
			labels,
			item_container,
			items,
			containers,
			locations
		RESTART IDENTITY CASCADE
	`)
	return err
}
