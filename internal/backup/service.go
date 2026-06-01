package backup

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

type Repository interface {
	GetTarget(ctx context.Context, id uuid.UUID) (BackupTarget, error)
	GetSchedule(ctx context.Context, id uuid.UUID) (BackupSchedule, error)
	UpdateBackupRunProgress(ctx context.Context, id uuid.UUID, phase string, percent int) error
	CompleteBackupRun(ctx context.Context, id uuid.UUID, sizeBytes int64, backupPath string) error
	FailBackupRun(ctx context.Context, id uuid.UUID, message string) error
	UpdateRestoreRunProgress(ctx context.Context, id uuid.UUID, phase string, percent int) error
	CompleteRestoreRun(ctx context.Context, run RestoreRun) error
	FailRestoreRun(ctx context.Context, run RestoreRun, message string) error
	FailRunningJobs(ctx context.Context, message string) error
}

type Service struct {
	repo       Repository
	targets    *DriverRegistry
	secrets    *SecretBox
	pg         PostgresTools
	objects    ObjectStorage
	tempDir    string
	appVersion string
	metrics    *Metrics
	logger     *zap.Logger
}

type ServiceConfig struct {
	Repository Repository
	Targets    *DriverRegistry
	Secrets    *SecretBox
	Postgres   PostgresTools
	Objects    ObjectStorage
	TempDir    string
	AppVersion string
	Metrics    *Metrics
	Logger     *zap.Logger
}

func NewService(cfg ServiceConfig) *Service {
	if cfg.Logger == nil {
		cfg.Logger = zap.NewNop()
	}
	return &Service{
		repo:       cfg.Repository,
		targets:    cfg.Targets,
		secrets:    cfg.Secrets,
		pg:         cfg.Postgres,
		objects:    cfg.Objects,
		tempDir:    cfg.TempDir,
		appVersion: cfg.AppVersion,
		metrics:    cfg.Metrics,
		logger:     cfg.Logger,
	}
}

func (s *Service) ExecuteBackup(ctx context.Context, run BackupRun) error {
	started := time.Now()
	var finalSize int64
	var failed bool
	defer func() {
		s.metrics.ObserveBackup(time.Since(started), finalSize, failed)
	}()

	targetRecord, driver, err := s.driverForTarget(ctx, run.TargetID)
	if err != nil {
		failed = true
		_ = s.repo.FailBackupRun(context.Background(), run.ID, err.Error())
		return err
	}
	if !targetRecord.Enabled {
		err := errors.New("backup target is disabled")
		failed = true
		_ = s.repo.FailBackupRun(context.Background(), run.ID, err.Error())
		return err
	}

	backupName := "backup-" + time.Now().UTC().Format("20060102-150405")
	workRoot, err := os.MkdirTemp(s.tempDir, "storagetron-backup-*")
	if err != nil {
		failed = true
		_ = s.repo.FailBackupRun(context.Background(), run.ID, err.Error())
		return err
	}
	defer os.RemoveAll(workRoot)

	backupDir := filepath.Join(workRoot, backupName)
	if err := os.MkdirAll(backupDir, 0700); err != nil {
		failed = true
		_ = s.repo.FailBackupRun(context.Background(), run.ID, err.Error())
		return err
	}

	postgresDump := filepath.Join(backupDir, "postgres.dump")
	minioArchive := filepath.Join(backupDir, "minio.tar.zst")
	manifestFile := filepath.Join(backupDir, "manifest.json")
	finalArchive := filepath.Join(workRoot, backupName+".tar.zst")

	if err := s.progress(ctx, run.ID, "postgres_dump", 10); err != nil {
		failed = true
		_ = s.repo.FailBackupRun(context.Background(), run.ID, err.Error())
		return err
	}
	if err := s.pg.Dump(ctx, postgresDump); err != nil {
		failed = true
		_ = s.repo.FailBackupRun(context.Background(), run.ID, err.Error())
		return err
	}

	if err := s.progress(ctx, run.ID, "minio_export", 35); err != nil {
		failed = true
		_ = s.repo.FailBackupRun(context.Background(), run.ID, err.Error())
		return err
	}
	if err := ExportObjects(ctx, s.objects, minioArchive); err != nil {
		failed = true
		_ = s.repo.FailBackupRun(context.Background(), run.ID, err.Error())
		return err
	}

	if err := s.progress(ctx, run.ID, "manifest", 55); err != nil {
		failed = true
		_ = s.repo.FailBackupRun(context.Background(), run.ID, err.Error())
		return err
	}
	manifest, err := s.buildManifest(postgresDump, minioArchive)
	if err != nil {
		failed = true
		_ = s.repo.FailBackupRun(context.Background(), run.ID, err.Error())
		return err
	}
	if err := WriteJSONFile(manifestFile, manifest); err != nil {
		failed = true
		_ = s.repo.FailBackupRun(context.Background(), run.ID, err.Error())
		return err
	}

	if err := s.progress(ctx, run.ID, "archive", 70); err != nil {
		failed = true
		_ = s.repo.FailBackupRun(context.Background(), run.ID, err.Error())
		return err
	}
	if err := CreateTarZstd(ctx, backupDir, finalArchive); err != nil {
		failed = true
		_ = s.repo.FailBackupRun(context.Background(), run.ID, err.Error())
		return err
	}
	stat, err := os.Stat(finalArchive)
	if err != nil {
		failed = true
		_ = s.repo.FailBackupRun(context.Background(), run.ID, err.Error())
		return err
	}
	finalSize = stat.Size()

	if err := s.progress(ctx, run.ID, "upload", 85); err != nil {
		failed = true
		_ = s.repo.FailBackupRun(context.Background(), run.ID, err.Error())
		return err
	}
	uploaded, err := driver.Upload(ctx, finalArchive, filepath.Base(finalArchive))
	if err != nil {
		failed = true
		_ = s.repo.FailBackupRun(context.Background(), run.ID, err.Error())
		return err
	}

	if err := s.applyRetention(ctx, run, driver); err != nil {
		s.logger.Warn("backup retention failed", zap.Error(err), zap.String("backup_run_id", run.ID.String()))
	}

	if err := s.repo.CompleteBackupRun(ctx, run.ID, finalSize, uploaded.ID); err != nil {
		return err
	}
	s.logger.Info("backup completed", zap.String("backup_run_id", run.ID.String()), zap.String("backup_id", uploaded.ID), zap.Int64("size_bytes", finalSize))
	return nil
}

func (s *Service) ExecuteRestore(ctx context.Context, run RestoreRun) error {
	var failed bool
	defer func() {
		s.metrics.ObserveRestore(failed)
	}()

	_, driver, err := s.driverForTarget(ctx, run.TargetID)
	if err != nil {
		failed = true
		_ = s.repo.FailRestoreRun(context.Background(), run, err.Error())
		return err
	}

	workRoot, err := os.MkdirTemp(s.tempDir, "storagetron-restore-*")
	if err != nil {
		failed = true
		_ = s.repo.FailRestoreRun(context.Background(), run, err.Error())
		return err
	}
	defer os.RemoveAll(workRoot)

	archivePath := filepath.Join(workRoot, "backup.tar.zst")
	extractDir := filepath.Join(workRoot, "extract")

	if err := s.restoreProgress(ctx, run.ID, "download", 10); err != nil {
		failed = true
		_ = s.repo.FailRestoreRun(context.Background(), run, err.Error())
		return err
	}
	if err := driver.Download(ctx, run.BackupIdentifier, archivePath); err != nil {
		failed = true
		_ = s.repo.FailRestoreRun(context.Background(), run, err.Error())
		return err
	}

	if err := s.restoreProgress(ctx, run.ID, "extract", 30); err != nil {
		failed = true
		_ = s.repo.FailRestoreRun(context.Background(), run, err.Error())
		return err
	}
	if err := ExtractTarZstd(ctx, archivePath, extractDir); err != nil {
		failed = true
		_ = s.repo.FailRestoreRun(context.Background(), run, err.Error())
		return err
	}

	if err := s.restoreProgress(ctx, run.ID, "validate_manifest", 45); err != nil {
		failed = true
		_ = s.repo.FailRestoreRun(context.Background(), run, err.Error())
		return err
	}
	manifest, err := readManifest(filepath.Join(extractDir, "manifest.json"))
	if err != nil {
		failed = true
		_ = s.repo.FailRestoreRun(context.Background(), run, err.Error())
		return err
	}
	if err := validateManifest(extractDir, manifest); err != nil {
		failed = true
		_ = s.repo.FailRestoreRun(context.Background(), run, err.Error())
		return err
	}

	if err := s.restoreProgress(ctx, run.ID, "postgres_restore", 60); err != nil {
		failed = true
		_ = s.repo.FailRestoreRun(context.Background(), run, err.Error())
		return err
	}
	if err := s.pg.Restore(ctx, filepath.Join(extractDir, manifest.PostgresBackupFile)); err != nil {
		failed = true
		_ = s.repo.FailRestoreRun(context.Background(), run, err.Error())
		return err
	}
	if err := s.repo.FailRunningJobs(ctx, "interrupted by database restore"); err != nil {
		s.logger.Warn("failed to mark restored running jobs as interrupted", zap.Error(err), zap.String("restore_run_id", run.ID.String()))
	}

	if err := s.restoreProgress(ctx, run.ID, "minio_import", 85); err != nil {
		failed = true
		_ = s.repo.FailRestoreRun(context.Background(), run, err.Error())
		return err
	}
	if err := ImportObjects(ctx, s.objects, filepath.Join(extractDir, manifest.MinIOBackupFile)); err != nil {
		failed = true
		_ = s.repo.FailRestoreRun(context.Background(), run, err.Error())
		return err
	}

	if err := s.repo.CompleteRestoreRun(ctx, run); err != nil {
		return err
	}
	s.logger.Info("restore completed", zap.String("restore_run_id", run.ID.String()), zap.String("backup_identifier", run.BackupIdentifier))
	return nil
}

func (s *Service) buildManifest(postgresDump, minioArchive string) (BackupManifest, error) {
	pgChecksum, err := SHA256File(postgresDump)
	if err != nil {
		return BackupManifest{}, err
	}
	minioChecksum, err := SHA256File(minioArchive)
	if err != nil {
		return BackupManifest{}, err
	}
	return BackupManifest{
		Version:            1,
		CreatedAt:          time.Now().UTC(),
		ApplicationVersion: s.appVersion,
		PostgresBackupFile: "postgres.dump",
		MinIOBackupFile:    "minio.tar.zst",
		Checksums: map[string]Checksum{
			"postgres.dump": {Algorithm: "sha256", Value: pgChecksum},
			"minio.tar.zst": {Algorithm: "sha256", Value: minioChecksum},
		},
	}, nil
}

func readManifest(path string) (BackupManifest, error) {
	file, err := os.Open(path)
	if err != nil {
		return BackupManifest{}, fmt.Errorf("open manifest: %w", err)
	}
	defer file.Close()
	var manifest BackupManifest
	if err := json.NewDecoder(file).Decode(&manifest); err != nil {
		return BackupManifest{}, fmt.Errorf("decode manifest: %w", err)
	}
	if manifest.Version != 1 {
		return BackupManifest{}, fmt.Errorf("unsupported manifest version %d", manifest.Version)
	}
	if manifest.PostgresBackupFile == "" || manifest.MinIOBackupFile == "" {
		return BackupManifest{}, errors.New("manifest is missing backup file names")
	}
	if !safeArchiveName(manifest.PostgresBackupFile) || !safeArchiveName(manifest.MinIOBackupFile) {
		return BackupManifest{}, errors.New("manifest contains unsafe file paths")
	}
	return manifest, nil
}

func validateManifest(root string, manifest BackupManifest) error {
	for name, expected := range manifest.Checksums {
		if expected.Algorithm != "sha256" {
			return fmt.Errorf("unsupported checksum algorithm for %s", name)
		}
		if !safeArchiveName(name) {
			return fmt.Errorf("manifest contains unsafe checksum path %q", name)
		}
		actual, err := SHA256File(filepath.Join(root, filepath.FromSlash(name)))
		if err != nil {
			return err
		}
		if actual != expected.Value {
			return fmt.Errorf("checksum mismatch for %s", name)
		}
	}
	return nil
}

func (s *Service) driverForTarget(ctx context.Context, targetID uuid.UUID) (BackupTarget, BackupTargetDriver, error) {
	targetRecord, err := s.repo.GetTarget(ctx, targetID)
	if err != nil {
		return BackupTarget{}, nil, err
	}
	decrypted, err := s.secrets.DecryptConfig(targetRecord.Configuration)
	if err != nil {
		return BackupTarget{}, nil, err
	}
	targetRecord.Configuration = decrypted
	driver, err := s.targets.DriverFor(ctx, targetRecord)
	if err != nil {
		return BackupTarget{}, nil, err
	}
	return targetRecord, driver, nil
}

func (s *Service) applyRetention(ctx context.Context, run BackupRun, driver BackupTargetDriver) error {
	if run.ScheduleID == nil {
		return nil
	}
	schedule, err := s.repo.GetSchedule(ctx, *run.ScheduleID)
	if err != nil {
		return err
	}
	keep := schedule.Retention.KeepLastBackups
	if keep <= 0 {
		return nil
	}
	objects, err := driver.List(ctx)
	if err != nil {
		return err
	}
	sort.Slice(objects, func(i, j int) bool {
		return objects[i].CreatedAt.After(objects[j].CreatedAt)
	})
	if len(objects) <= keep {
		return nil
	}
	for _, object := range objects[keep:] {
		if err := driver.Delete(ctx, object.ID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) progress(ctx context.Context, id uuid.UUID, phase string, percent int) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	return s.repo.UpdateBackupRunProgress(ctx, id, phase, percent)
}

func (s *Service) restoreProgress(ctx context.Context, id uuid.UUID, phase string, percent int) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	return s.repo.UpdateRestoreRunProgress(ctx, id, phase, percent)
}
