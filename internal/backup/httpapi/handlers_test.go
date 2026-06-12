package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Brain4Fish/storagetron/internal/backup"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

func TestCreateTargetEncryptsSecretsAndRedactsResponse(t *testing.T) {
	repo := &fakeBackupAPIRepository{}
	secrets := mustSecretBox(t)
	handler := NewHandler(repo, secrets, nil, zap.NewNop())

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/backup/targets", bytes.NewBufferString(`{
		"name": " Home NAS ",
		"type": "sftp",
		"configuration": {
			"host": "nas.local",
			"username": "backup",
			"password": "change-me"
		}
	}`))

	handler.CreateTarget(rec, req)

	require.Equal(t, http.StatusCreated, rec.Code)
	require.Equal(t, "Home NAS", repo.createdTarget.Name)
	require.True(t, repo.createdTarget.Enabled)
	require.NotContains(t, string(repo.createdTarget.Configuration), "change-me")

	decrypted, err := secrets.DecryptConfig(repo.createdTarget.Configuration)
	require.NoError(t, err)
	require.JSONEq(t, `{"host":"nas.local","username":"backup","password":"change-me"}`, string(decrypted))

	var response backup.BackupTarget
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
	require.Equal(t, "Home NAS", response.Name)
	require.JSONEq(t, `{"host":"nas.local","username":"backup","password":"********"}`, string(response.Configuration))
}

func TestUpdateTargetPreservesBlankSecretPatchAndReloadsScheduler(t *testing.T) {
	secrets := mustSecretBox(t)
	existingConfig, err := secrets.EncryptConfig(json.RawMessage(`{
		"host": "old.local",
		"username": "backup",
		"password": "old-password"
	}`))
	require.NoError(t, err)

	targetID := uuid.New()
	repo := &fakeBackupAPIRepository{
		target: backup.BackupTarget{
			ID:            targetID,
			Name:          "NAS",
			Type:          backup.TargetTypeSFTP,
			Enabled:       true,
			Configuration: existingConfig,
		},
	}
	scheduler := &fakeScheduleReloader{}
	handler := NewHandler(repo, secrets, scheduler, zap.NewNop())

	rec := httptest.NewRecorder()
	req := requestWithURLParam(http.MethodPatch, "/backup/targets/"+targetID.String(), "id", targetID.String(), `{
		"name": "NAS Updated",
		"enabled": false,
		"configuration": {
			"host": "new.local",
			"password": ""
		}
	}`)

	handler.UpdateTarget(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "NAS Updated", repo.updatedTarget.Name)
	require.False(t, repo.updatedTarget.Enabled)
	require.Equal(t, 1, scheduler.reloads)

	decrypted, err := secrets.DecryptConfig(repo.updatedTarget.Configuration)
	require.NoError(t, err)
	require.JSONEq(t, `{"host":"new.local","username":"backup","password":"old-password"}`, string(decrypted))

	var response backup.BackupTarget
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
	require.JSONEq(t, `{"host":"new.local","username":"backup","password":"********"}`, string(response.Configuration))
}

func TestCreateScheduleDefaultsRetentionAndReloadsScheduler(t *testing.T) {
	targetID := uuid.New()
	repo := &fakeBackupAPIRepository{
		target: backup.BackupTarget{ID: targetID, Type: backup.TargetTypeSFTP, Enabled: true},
	}
	scheduler := &fakeScheduleReloader{}
	handler := NewHandler(repo, mustSecretBox(t), scheduler, zap.NewNop())

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/backup/schedules", bytes.NewBufferString(`{
		"target_id": "`+targetID.String()+`",
		"name": " Nightly ",
		"cron_expression": "0 2 * * *",
		"enabled": true,
		"retention_policy": {"keep_last_backups": 0}
	}`))

	handler.CreateSchedule(rec, req)

	require.Equal(t, http.StatusCreated, rec.Code)
	require.Equal(t, "Nightly", repo.createdSchedule.Name)
	require.Equal(t, "0 2 * * *", repo.createdSchedule.CronExpression)
	require.Equal(t, 30, repo.createdSchedule.Retention.KeepLastBackups)
	require.Equal(t, 1, scheduler.reloads)
}

func TestCreateScheduleRejectsInvalidCron(t *testing.T) {
	targetID := uuid.New()
	repo := &fakeBackupAPIRepository{target: backup.BackupTarget{ID: targetID}}
	handler := NewHandler(repo, mustSecretBox(t), nil, zap.NewNop())

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/backup/schedules", bytes.NewBufferString(`{
		"target_id": "`+targetID.String()+`",
		"name": "Nightly",
		"cron_expression": "not a cron"
	}`))

	handler.CreateSchedule(rec, req)

	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "invalid cron_expression")
	require.False(t, repo.createScheduleCalled)
}

func TestCreateBackupRunRejectsDisabledTarget(t *testing.T) {
	targetID := uuid.New()
	repo := &fakeBackupAPIRepository{target: backup.BackupTarget{ID: targetID, Enabled: false}}
	handler := NewHandler(repo, mustSecretBox(t), nil, zap.NewNop())

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/backup/run", bytes.NewBufferString(`{"target_id":"`+targetID.String()+`"}`))

	handler.CreateBackupRun(rec, req)

	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "target is disabled")
	require.False(t, repo.createBackupRunCalled)
}

func TestCreateRestoreRunRejectsUnsafeBackupIdentifier(t *testing.T) {
	targetID := uuid.New()
	repo := &fakeBackupAPIRepository{target: backup.BackupTarget{ID: targetID, Enabled: true}}
	handler := NewHandler(repo, mustSecretBox(t), nil, zap.NewNop())

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/backup/restore", bytes.NewBufferString(`{
		"target_id": "`+targetID.String()+`",
		"backup_identifier": "../backup.tar.zst"
	}`))

	handler.CreateRestoreRun(rec, req)

	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "invalid backup_identifier")
	require.False(t, repo.createRestoreRunCalled)
}

func TestParseLimitFallsBackToDefaultOutsideAllowedRange(t *testing.T) {
	require.Equal(t, 100, parseLimit(httptest.NewRequest(http.MethodGet, "/backup/runs?limit=0", nil)))
	require.Equal(t, 100, parseLimit(httptest.NewRequest(http.MethodGet, "/backup/runs?limit=201", nil)))
	require.Equal(t, 42, parseLimit(httptest.NewRequest(http.MethodGet, "/backup/runs?limit=42", nil)))
}

func mustSecretBox(t *testing.T) *backup.SecretBox {
	t.Helper()
	box, err := backup.NewSecretBox("development-backup-secret")
	require.NoError(t, err)
	return box
}

func requestWithURLParam(method, path, key, value, body string) *http.Request {
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	routeContext := chi.NewRouteContext()
	routeContext.URLParams.Add(key, value)
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, routeContext))
}

type fakeScheduleReloader struct {
	reloads int
	err     error
}

func (r *fakeScheduleReloader) Reload(context.Context) error {
	r.reloads++
	return r.err
}

type fakeBackupAPIRepository struct {
	createdTarget backup.BackupTarget
	updatedTarget backup.BackupTarget
	target        backup.BackupTarget
	targetErr     error

	createdSchedule      backup.BackupSchedule
	updatedSchedule      backup.BackupSchedule
	schedule             backup.BackupSchedule
	createScheduleCalled bool

	createBackupRunCalled  bool
	createRestoreRunCalled bool
}

func (r *fakeBackupAPIRepository) CreateTarget(_ context.Context, target backup.BackupTarget) (backup.BackupTarget, error) {
	r.createdTarget = target
	if target.ID == uuid.Nil {
		target.ID = uuid.New()
	}
	target.CreatedAt = time.Now()
	target.UpdatedAt = target.CreatedAt
	return target, nil
}

func (r *fakeBackupAPIRepository) ListTargets(context.Context) ([]backup.BackupTarget, error) {
	return nil, nil
}

func (r *fakeBackupAPIRepository) GetTarget(context.Context, uuid.UUID) (backup.BackupTarget, error) {
	if r.targetErr != nil {
		return backup.BackupTarget{}, r.targetErr
	}
	if r.target.ID == uuid.Nil {
		return backup.BackupTarget{}, pgx.ErrNoRows
	}
	return r.target, nil
}

func (r *fakeBackupAPIRepository) UpdateTarget(_ context.Context, id uuid.UUID, patch backup.BackupTargetPatch) (backup.BackupTarget, error) {
	r.updatedTarget = backup.BackupTarget{
		ID:            id,
		Name:          patch.Name,
		Type:          backup.TargetTypeSFTP,
		Enabled:       patch.Enabled,
		Configuration: patch.Configuration,
	}
	return r.updatedTarget, nil
}

func (r *fakeBackupAPIRepository) SoftDeleteTarget(context.Context, uuid.UUID) error {
	return nil
}

func (r *fakeBackupAPIRepository) CreateSchedule(_ context.Context, schedule backup.BackupSchedule) (backup.BackupSchedule, error) {
	r.createScheduleCalled = true
	r.createdSchedule = schedule
	if schedule.ID == uuid.Nil {
		schedule.ID = uuid.New()
	}
	return schedule, nil
}

func (r *fakeBackupAPIRepository) ListSchedules(context.Context, bool) ([]backup.BackupSchedule, error) {
	return nil, nil
}

func (r *fakeBackupAPIRepository) GetSchedule(context.Context, uuid.UUID) (backup.BackupSchedule, error) {
	if r.schedule.ID == uuid.Nil {
		return backup.BackupSchedule{}, pgx.ErrNoRows
	}
	return r.schedule, nil
}

func (r *fakeBackupAPIRepository) UpdateSchedule(_ context.Context, id uuid.UUID, patch backup.BackupSchedulePatch) (backup.BackupSchedule, error) {
	r.updatedSchedule = backup.BackupSchedule{
		ID:             id,
		TargetID:       patch.TargetID,
		Name:           patch.Name,
		CronExpression: patch.CronExpression,
		Enabled:        patch.Enabled,
		Retention:      patch.Retention,
	}
	return r.updatedSchedule, nil
}

func (r *fakeBackupAPIRepository) SoftDeleteSchedule(context.Context, uuid.UUID) error {
	return nil
}

func (r *fakeBackupAPIRepository) CreateBackupRun(_ context.Context, targetID uuid.UUID, scheduleID *uuid.UUID) (backup.BackupRun, error) {
	r.createBackupRunCalled = true
	return backup.BackupRun{ID: uuid.New(), TargetID: targetID, ScheduleID: scheduleID}, nil
}

func (r *fakeBackupAPIRepository) ListBackupRuns(context.Context, int) ([]backup.BackupRun, error) {
	return nil, nil
}

func (r *fakeBackupAPIRepository) CreateRestoreRun(_ context.Context, targetID uuid.UUID, backupIdentifier string) (backup.RestoreRun, error) {
	r.createRestoreRunCalled = true
	return backup.RestoreRun{ID: uuid.New(), TargetID: targetID, BackupIdentifier: backupIdentifier}, nil
}

func (r *fakeBackupAPIRepository) ListRestoreRuns(context.Context, int) ([]backup.RestoreRun, error) {
	return nil, nil
}
