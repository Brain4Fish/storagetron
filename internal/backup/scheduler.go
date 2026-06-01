package backup

import (
	"context"
	"sync"

	"github.com/google/uuid"
	"github.com/robfig/cron/v3"
	"go.uber.org/zap"
)

type SchedulerRepository interface {
	ListSchedules(ctx context.Context, enabledOnly bool) ([]BackupSchedule, error)
	CreateBackupRun(ctx context.Context, targetID uuid.UUID, scheduleID *uuid.UUID) (BackupRun, error)
}

type Scheduler struct {
	repo   SchedulerRepository
	logger *zap.Logger
	mu     sync.Mutex
	cron   *cron.Cron
}

func NewScheduler(repo SchedulerRepository, logger *zap.Logger) *Scheduler {
	if logger == nil {
		logger = zap.NewNop()
	}
	return &Scheduler{repo: repo, logger: logger}
}

func (s *Scheduler) Start(ctx context.Context) error {
	if err := s.Reload(ctx); err != nil {
		return err
	}
	go func() {
		<-ctx.Done()
		s.Stop()
	}()
	return nil
}

func (s *Scheduler) Reload(ctx context.Context) error {
	schedules, err := s.repo.ListSchedules(ctx, true)
	if err != nil {
		return err
	}

	next := cron.New(cron.WithChain(cron.SkipIfStillRunning(cron.DefaultLogger)))
	for _, schedule := range schedules {
		schedule := schedule
		if _, err := next.AddFunc(schedule.CronExpression, func() {
			scheduleID := schedule.ID
			run, err := s.repo.CreateBackupRun(context.Background(), schedule.TargetID, &scheduleID)
			if err != nil {
				s.logger.Error("failed to enqueue scheduled backup", zap.Error(err), zap.String("schedule_id", schedule.ID.String()))
				return
			}
			s.logger.Info("scheduled backup enqueued", zap.String("schedule_id", schedule.ID.String()), zap.String("backup_run_id", run.ID.String()))
		}); err != nil {
			return err
		}
	}
	next.Start()

	s.mu.Lock()
	old := s.cron
	s.cron = next
	s.mu.Unlock()
	if old != nil {
		old.Stop()
	}
	s.logger.Info("backup scheduler loaded", zap.Int("schedule_count", len(schedules)))
	return nil
}

func (s *Scheduler) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cron != nil {
		s.cron.Stop()
		s.cron = nil
	}
}
