package backup

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestExecuteBackupFailsDisabledTargetAndRecordsFailure(t *testing.T) {
	secrets, err := NewSecretBox("development-backup-secret")
	require.NoError(t, err)
	encryptedConfig, err := secrets.EncryptConfig(json.RawMessage(`{"host":"nas.local","password":"secret"}`))
	require.NoError(t, err)

	targetID := uuid.New()
	repo := &fakeBackupRepository{
		target: BackupTarget{
			ID:            targetID,
			Type:          TargetTypeSFTP,
			Enabled:       false,
			Configuration: encryptedConfig,
		},
	}
	factory := &fakeDriverFactory{driver: &fakeBackupDriver{}}
	svc := NewService(ServiceConfig{
		Repository: repo,
		Targets:    NewDriverRegistry(factory),
		Secrets:    secrets,
		TempDir:    t.TempDir(),
	})

	err = svc.ExecuteBackup(context.Background(), BackupRun{ID: uuid.New(), TargetID: targetID})

	require.ErrorContains(t, err, "backup target is disabled")
	require.Equal(t, "backup target is disabled", repo.failedBackupMessage)
	require.JSONEq(t, `{"host":"nas.local","password":"secret"}`, string(factory.config))
}

func TestExecuteRestoreDownloadFailureRecordsProgressAndFailure(t *testing.T) {
	secrets, err := NewSecretBox("development-backup-secret")
	require.NoError(t, err)

	targetID := uuid.New()
	repo := &fakeBackupRepository{
		target: BackupTarget{
			ID:            targetID,
			Type:          TargetTypeSFTP,
			Enabled:       true,
			Configuration: json.RawMessage(`{}`),
		},
	}
	driver := &fakeBackupDriver{downloadErr: errors.New("remote unavailable")}
	svc := NewService(ServiceConfig{
		Repository: repo,
		Targets:    NewDriverRegistry(&fakeDriverFactory{driver: driver}),
		Secrets:    secrets,
		TempDir:    t.TempDir(),
	})
	run := RestoreRun{ID: uuid.New(), TargetID: targetID, BackupIdentifier: "backup.tar.zst"}

	err = svc.ExecuteRestore(context.Background(), run)

	require.ErrorContains(t, err, "remote unavailable")
	require.Equal(t, []progressUpdate{{phase: "download", percent: 10}}, repo.restoreProgress)
	require.Equal(t, "remote unavailable", repo.failedRestoreMessage)
}

func TestApplyRetentionDeletesOldestBackupsBeyondKeepLast(t *testing.T) {
	scheduleID := uuid.New()
	newest := BackupObject{ID: "newest", CreatedAt: time.Date(2026, 6, 12, 12, 0, 0, 0, time.UTC)}
	middle := BackupObject{ID: "middle", CreatedAt: time.Date(2026, 6, 11, 12, 0, 0, 0, time.UTC)}
	oldest := BackupObject{ID: "oldest", CreatedAt: time.Date(2026, 6, 10, 12, 0, 0, 0, time.UTC)}
	repo := &fakeBackupRepository{
		schedule: BackupSchedule{
			ID:        scheduleID,
			Retention: RetentionPolicy{KeepLastBackups: 2},
		},
	}
	driver := &fakeBackupDriver{objects: []BackupObject{middle, oldest, newest}}
	svc := NewService(ServiceConfig{Repository: repo})

	err := svc.applyRetention(context.Background(), BackupRun{ScheduleID: &scheduleID}, driver)

	require.NoError(t, err)
	require.Equal(t, []string{"oldest"}, driver.deletedIDs)
}

func TestApplyRetentionSkipsManualRuns(t *testing.T) {
	driver := &fakeBackupDriver{objects: []BackupObject{{ID: "backup"}}}
	svc := NewService(ServiceConfig{Repository: &fakeBackupRepository{}})

	err := svc.applyRetention(context.Background(), BackupRun{}, driver)

	require.NoError(t, err)
	require.Empty(t, driver.deletedIDs)
}

func TestBuildManifestRecordsChecksumsAndAppVersion(t *testing.T) {
	root := t.TempDir()
	postgresDump := filepath.Join(root, "postgres.dump")
	minioArchive := filepath.Join(root, "minio.tar.zst")
	require.NoError(t, os.WriteFile(postgresDump, []byte("postgres"), 0600))
	require.NoError(t, os.WriteFile(minioArchive, []byte("minio"), 0600))
	svc := NewService(ServiceConfig{AppVersion: "1.2.3"})

	manifest, err := svc.buildManifest(postgresDump, minioArchive)

	require.NoError(t, err)
	require.Equal(t, 1, manifest.Version)
	require.Equal(t, "1.2.3", manifest.ApplicationVersion)
	require.Equal(t, "postgres.dump", manifest.PostgresBackupFile)
	require.Equal(t, "minio.tar.zst", manifest.MinIOBackupFile)
	require.Equal(t, "sha256", manifest.Checksums["postgres.dump"].Algorithm)
	require.NotEmpty(t, manifest.Checksums["postgres.dump"].Value)
	require.Equal(t, "sha256", manifest.Checksums["minio.tar.zst"].Algorithm)
	require.NotEmpty(t, manifest.Checksums["minio.tar.zst"].Value)
}

type progressUpdate struct {
	phase   string
	percent int
}

type fakeBackupRepository struct {
	target BackupTarget

	schedule BackupSchedule

	backupProgress      []progressUpdate
	failedBackupMessage string

	restoreProgress      []progressUpdate
	failedRestoreMessage string
}

func (r *fakeBackupRepository) GetTarget(context.Context, uuid.UUID) (BackupTarget, error) {
	return r.target, nil
}

func (r *fakeBackupRepository) GetSchedule(context.Context, uuid.UUID) (BackupSchedule, error) {
	return r.schedule, nil
}

func (r *fakeBackupRepository) UpdateBackupRunProgress(_ context.Context, _ uuid.UUID, phase string, percent int) error {
	r.backupProgress = append(r.backupProgress, progressUpdate{phase: phase, percent: percent})
	return nil
}

func (r *fakeBackupRepository) CompleteBackupRun(context.Context, uuid.UUID, int64, string) error {
	return nil
}

func (r *fakeBackupRepository) FailBackupRun(_ context.Context, _ uuid.UUID, message string) error {
	r.failedBackupMessage = message
	return nil
}

func (r *fakeBackupRepository) UpdateRestoreRunProgress(_ context.Context, _ uuid.UUID, phase string, percent int) error {
	r.restoreProgress = append(r.restoreProgress, progressUpdate{phase: phase, percent: percent})
	return nil
}

func (r *fakeBackupRepository) CompleteRestoreRun(context.Context, RestoreRun) error {
	return nil
}

func (r *fakeBackupRepository) FailRestoreRun(_ context.Context, _ RestoreRun, message string) error {
	r.failedRestoreMessage = message
	return nil
}

func (r *fakeBackupRepository) FailRunningJobs(context.Context, string) error {
	return nil
}

type fakeDriverFactory struct {
	driver BackupTargetDriver
	config json.RawMessage
	err    error
}

func (f *fakeDriverFactory) Type() TargetType {
	return TargetTypeSFTP
}

func (f *fakeDriverFactory) New(_ context.Context, config json.RawMessage) (BackupTargetDriver, error) {
	f.config = append(json.RawMessage(nil), config...)
	return f.driver, f.err
}

type fakeBackupDriver struct {
	objects     []BackupObject
	deletedIDs  []string
	downloadErr error
}

func (d *fakeBackupDriver) Upload(context.Context, string, string) (BackupObject, error) {
	return BackupObject{ID: "uploaded"}, nil
}

func (d *fakeBackupDriver) Download(context.Context, string, string) error {
	return d.downloadErr
}

func (d *fakeBackupDriver) List(context.Context) ([]BackupObject, error) {
	return append([]BackupObject(nil), d.objects...), nil
}

func (d *fakeBackupDriver) Delete(_ context.Context, backupID string) error {
	d.deletedIDs = append(d.deletedIDs, backupID)
	return nil
}
