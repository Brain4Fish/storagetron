package backup

import (
	"context"
	"fmt"
	"runtime/debug"
	"time"

	"go.uber.org/zap"
)

type WorkerRepository interface {
	Repository
	ClaimPendingBackupRun(ctx context.Context) (*BackupRun, error)
	ClaimPendingRestoreRun(ctx context.Context) (*RestoreRun, error)
	FailRunningJobs(ctx context.Context, message string) error
}

type BackupWorker interface {
	Run(ctx context.Context)
}

type Worker struct {
	repo         WorkerRepository
	service      *Service
	pollInterval time.Duration
	jobTimeout   time.Duration
	logger       *zap.Logger
}

func NewWorker(repo WorkerRepository, service *Service, pollInterval, jobTimeout time.Duration, logger *zap.Logger) *Worker {
	if pollInterval <= 0 {
		pollInterval = 10 * time.Second
	}
	if jobTimeout <= 0 {
		jobTimeout = 2 * time.Hour
	}
	if logger == nil {
		logger = zap.NewNop()
	}
	return &Worker{repo: repo, service: service, pollInterval: pollInterval, jobTimeout: jobTimeout, logger: logger}
}

func (w *Worker) Run(ctx context.Context) {
	if err := w.repo.FailRunningJobs(ctx, "interrupted by application restart"); err != nil {
		w.logger.Error("failed to mark interrupted backup jobs", zap.Error(err))
	}

	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	for {
		w.processPending(ctx)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (w *Worker) processPending(ctx context.Context) {
	for {
		processed, err := w.processOne(ctx)
		if err != nil {
			w.logger.Error("backup worker iteration failed", zap.Error(err))
			return
		}
		if !processed {
			return
		}
	}
}

func (w *Worker) processOne(ctx context.Context) (bool, error) {
	backupRun, err := w.repo.ClaimPendingBackupRun(ctx)
	if err != nil {
		return false, err
	}
	if backupRun != nil {
		w.executeBackup(ctx, *backupRun)
		return true, nil
	}

	restoreRun, err := w.repo.ClaimPendingRestoreRun(ctx)
	if err != nil {
		return false, err
	}
	if restoreRun != nil {
		w.executeRestore(ctx, *restoreRun)
		return true, nil
	}
	return false, nil
}

func (w *Worker) executeBackup(ctx context.Context, run BackupRun) {
	jobCtx, cancel := context.WithTimeout(ctx, w.jobTimeout)
	defer cancel()
	defer func() {
		if recovered := recover(); recovered != nil {
			message := fmt.Sprintf("backup job panic: %v", recovered)
			_ = w.repo.FailBackupRun(context.Background(), run.ID, message)
			w.logger.Error("backup run panicked", zap.Any("panic", recovered), zap.String("backup_run_id", run.ID.String()), zap.ByteString("stack", debug.Stack()))
		}
	}()
	w.logger.Info("starting backup run", zap.String("backup_run_id", run.ID.String()))
	if err := w.service.ExecuteBackup(jobCtx, run); err != nil {
		w.logger.Error("backup run failed", zap.Error(err), zap.String("backup_run_id", run.ID.String()))
	}
}

func (w *Worker) executeRestore(ctx context.Context, run RestoreRun) {
	jobCtx, cancel := context.WithTimeout(ctx, w.jobTimeout)
	defer cancel()
	defer func() {
		if recovered := recover(); recovered != nil {
			message := fmt.Sprintf("restore job panic: %v", recovered)
			_ = w.repo.FailRestoreRun(context.Background(), run, message)
			w.logger.Error("restore run panicked", zap.Any("panic", recovered), zap.String("restore_run_id", run.ID.String()), zap.ByteString("stack", debug.Stack()))
		}
	}()
	w.logger.Info("starting restore run", zap.String("restore_run_id", run.ID.String()), zap.String("backup_identifier", run.BackupIdentifier))
	if err := w.service.ExecuteRestore(jobCtx, run); err != nil {
		w.logger.Error("restore run failed", zap.Error(err), zap.String("restore_run_id", run.ID.String()))
	}
}
