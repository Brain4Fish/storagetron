package backup

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

func TestSchedulerReloadRequestsEnabledSchedulesAndStartsCron(t *testing.T) {
	repo := &fakeSchedulerRepository{
		schedules: []BackupSchedule{{
			ID:             uuid.New(),
			TargetID:       uuid.New(),
			CronExpression: "0 2 * * *",
			Enabled:        true,
		}},
	}
	scheduler := NewScheduler(repo, zap.NewNop())
	t.Cleanup(scheduler.Stop)

	err := scheduler.Reload(context.Background())

	require.NoError(t, err)
	require.True(t, repo.enabledOnly)
	require.NotNil(t, scheduler.cron)
}

func TestSchedulerReloadReturnsInvalidCronError(t *testing.T) {
	repo := &fakeSchedulerRepository{
		schedules: []BackupSchedule{{
			ID:             uuid.New(),
			TargetID:       uuid.New(),
			CronExpression: "not a cron",
			Enabled:        true,
		}},
	}
	scheduler := NewScheduler(repo, zap.NewNop())

	err := scheduler.Reload(context.Background())

	require.Error(t, err)
	require.Nil(t, scheduler.cron)
}

type fakeSchedulerRepository struct {
	schedules   []BackupSchedule
	enabledOnly bool
}

func (r *fakeSchedulerRepository) ListSchedules(_ context.Context, enabledOnly bool) ([]BackupSchedule, error) {
	r.enabledOnly = enabledOnly
	return append([]BackupSchedule(nil), r.schedules...), nil
}

func (r *fakeSchedulerRepository) CreateBackupRun(context.Context, uuid.UUID, *uuid.UUID) (BackupRun, error) {
	return BackupRun{ID: uuid.New()}, nil
}
