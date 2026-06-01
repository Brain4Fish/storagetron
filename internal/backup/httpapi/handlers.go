package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Brain4Fish/storagetron/internal/backup"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/robfig/cron/v3"
	"go.uber.org/zap"
)

type Repository interface {
	CreateTarget(ctx context.Context, target backup.BackupTarget) (backup.BackupTarget, error)
	ListTargets(ctx context.Context) ([]backup.BackupTarget, error)
	GetTarget(ctx context.Context, id uuid.UUID) (backup.BackupTarget, error)
	UpdateTarget(ctx context.Context, id uuid.UUID, patch backup.BackupTargetPatch) (backup.BackupTarget, error)
	SoftDeleteTarget(ctx context.Context, id uuid.UUID) error
	CreateSchedule(ctx context.Context, schedule backup.BackupSchedule) (backup.BackupSchedule, error)
	ListSchedules(ctx context.Context, enabledOnly bool) ([]backup.BackupSchedule, error)
	GetSchedule(ctx context.Context, id uuid.UUID) (backup.BackupSchedule, error)
	UpdateSchedule(ctx context.Context, id uuid.UUID, patch backup.BackupSchedulePatch) (backup.BackupSchedule, error)
	SoftDeleteSchedule(ctx context.Context, id uuid.UUID) error
	CreateBackupRun(ctx context.Context, targetID uuid.UUID, scheduleID *uuid.UUID) (backup.BackupRun, error)
	ListBackupRuns(ctx context.Context, limit int) ([]backup.BackupRun, error)
	CreateRestoreRun(ctx context.Context, targetID uuid.UUID, backupIdentifier string) (backup.RestoreRun, error)
	ListRestoreRuns(ctx context.Context, limit int) ([]backup.RestoreRun, error)
}

type ScheduleReloader interface {
	Reload(ctx context.Context) error
}

type Handler struct {
	repo      Repository
	secrets   *backup.SecretBox
	scheduler ScheduleReloader
	logger    *zap.Logger
}

func NewHandler(repo Repository, secrets *backup.SecretBox, scheduler ScheduleReloader, logger *zap.Logger) *Handler {
	if logger == nil {
		logger = zap.NewNop()
	}
	return &Handler{repo: repo, secrets: secrets, scheduler: scheduler, logger: logger}
}

func (h *Handler) Routes(r chi.Router) {
	r.Get("/targets", h.ListTargets)
	r.Post("/targets", h.CreateTarget)
	r.Patch("/targets/{id}", h.UpdateTarget)
	r.Delete("/targets/{id}", h.DeleteTarget)
	r.Get("/schedules", h.ListSchedules)
	r.Post("/schedules", h.CreateSchedule)
	r.Patch("/schedules/{id}", h.UpdateSchedule)
	r.Delete("/schedules/{id}", h.DeleteSchedule)
	r.Get("/runs", h.ListBackupRuns)
	r.Post("/run", h.CreateBackupRun)
	r.Post("/restore", h.CreateRestoreRun)
	r.Get("/restore-runs", h.ListRestoreRuns)
}

type updateTargetRequest struct {
	Name          string          `json:"name"`
	Enabled       *bool           `json:"enabled"`
	Configuration json.RawMessage `json:"configuration"`
}

type createTargetRequest struct {
	Name          string            `json:"name"`
	Type          backup.TargetType `json:"type"`
	Enabled       *bool             `json:"enabled"`
	Configuration json.RawMessage   `json:"configuration"`
}

func (h *Handler) ListTargets(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	targets, err := h.repo.ListTargets(ctx)
	if err != nil {
		h.logger.Error("list backup targets failed", zap.Error(err))
		respondErr(w, http.StatusInternalServerError, "failed to list backup targets")
		return
	}
	for i := range targets {
		targets[i].Configuration = h.secrets.RedactConfig(targets[i].Configuration)
	}
	respondJSON(w, http.StatusOK, targets)
}

func (h *Handler) CreateTarget(w http.ResponseWriter, r *http.Request) {
	var req createTargetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		respondErr(w, http.StatusBadRequest, "name is required")
		return
	}
	if !validTargetType(req.Type) {
		respondErr(w, http.StatusBadRequest, "unsupported target type")
		return
	}
	if len(req.Configuration) == 0 {
		req.Configuration = json.RawMessage(`{}`)
	}
	encrypted, err := h.secrets.EncryptConfig(req.Configuration)
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid target configuration")
		return
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	target, err := h.repo.CreateTarget(ctx, backup.BackupTarget{
		Name:          req.Name,
		Type:          req.Type,
		Enabled:       enabled,
		Configuration: encrypted,
	})
	if err != nil {
		h.logger.Error("create backup target failed", zap.Error(err), zap.String("target_type", string(req.Type)))
		respondErr(w, http.StatusInternalServerError, "failed to create backup target")
		return
	}
	target.Configuration = h.secrets.RedactConfig(target.Configuration)
	respondJSON(w, http.StatusCreated, target)
}

func (h *Handler) UpdateTarget(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid target id")
		return
	}
	var req updateTargetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		respondErr(w, http.StatusBadRequest, "name is required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	existing, err := h.repo.GetTarget(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondErr(w, http.StatusNotFound, "target not found")
			return
		}
		h.logger.Error("get backup target failed", zap.Error(err), zap.String("target_id", id.String()))
		respondErr(w, http.StatusInternalServerError, "failed to get backup target")
		return
	}
	if existing.Type != backup.TargetTypeSFTP {
		respondErr(w, http.StatusBadRequest, "only sftp targets can be edited")
		return
	}
	mergedConfig, err := h.mergeTargetConfiguration(existing.Configuration, req.Configuration)
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid target configuration")
		return
	}
	enabled := existing.Enabled
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	encrypted, err := h.secrets.EncryptConfig(mergedConfig)
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid target configuration")
		return
	}
	target, err := h.repo.UpdateTarget(ctx, id, backup.BackupTargetPatch{
		Name:          req.Name,
		Enabled:       enabled,
		Configuration: encrypted,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondErr(w, http.StatusNotFound, "target not found")
			return
		}
		h.logger.Error("update backup target failed", zap.Error(err), zap.String("target_id", id.String()))
		respondErr(w, http.StatusInternalServerError, "failed to update backup target")
		return
	}
	h.reloadScheduler(ctx)
	target.Configuration = h.secrets.RedactConfig(target.Configuration)
	respondJSON(w, http.StatusOK, target)
}

func (h *Handler) DeleteTarget(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid target id")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	if err := h.repo.SoftDeleteTarget(ctx, id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondErr(w, http.StatusNotFound, "target not found")
			return
		}
		h.logger.Error("delete backup target failed", zap.Error(err), zap.String("target_id", id.String()))
		respondErr(w, http.StatusInternalServerError, "failed to delete backup target")
		return
	}
	h.reloadScheduler(ctx)
	w.WriteHeader(http.StatusNoContent)
}

type createScheduleRequest struct {
	TargetID       uuid.UUID              `json:"target_id"`
	Name           string                 `json:"name"`
	CronExpression string                 `json:"cron_expression"`
	Enabled        *bool                  `json:"enabled"`
	Retention      backup.RetentionPolicy `json:"retention_policy"`
}

type updateScheduleRequest struct {
	TargetID       uuid.UUID              `json:"target_id"`
	Name           string                 `json:"name"`
	CronExpression string                 `json:"cron_expression"`
	Enabled        *bool                  `json:"enabled"`
	Retention      backup.RetentionPolicy `json:"retention_policy"`
}

func (h *Handler) ListSchedules(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	schedules, err := h.repo.ListSchedules(ctx, false)
	if err != nil {
		h.logger.Error("list backup schedules failed", zap.Error(err))
		respondErr(w, http.StatusInternalServerError, "failed to list backup schedules")
		return
	}
	respondJSON(w, http.StatusOK, schedules)
}

func (h *Handler) CreateSchedule(w http.ResponseWriter, r *http.Request) {
	var req createScheduleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.CronExpression = strings.TrimSpace(req.CronExpression)
	if req.TargetID == uuid.Nil {
		respondErr(w, http.StatusBadRequest, "target_id is required")
		return
	}
	if req.Name == "" {
		respondErr(w, http.StatusBadRequest, "name is required")
		return
	}
	if _, err := cron.ParseStandard(req.CronExpression); err != nil {
		respondErr(w, http.StatusBadRequest, "invalid cron_expression")
		return
	}
	if req.Retention.KeepLastBackups <= 0 {
		req.Retention.KeepLastBackups = 30
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	if _, err := h.repo.GetTarget(ctx, req.TargetID); err != nil {
		respondErr(w, http.StatusBadRequest, "target not found")
		return
	}
	schedule, err := h.repo.CreateSchedule(ctx, backup.BackupSchedule{
		TargetID:       req.TargetID,
		Name:           req.Name,
		CronExpression: req.CronExpression,
		Enabled:        enabled,
		Retention:      req.Retention,
	})
	if err != nil {
		h.logger.Error("create backup schedule failed", zap.Error(err), zap.String("target_id", req.TargetID.String()))
		respondErr(w, http.StatusInternalServerError, "failed to create backup schedule")
		return
	}
	h.reloadScheduler(ctx)
	respondJSON(w, http.StatusCreated, schedule)
}

func (h *Handler) UpdateSchedule(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid schedule id")
		return
	}
	var req updateScheduleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.CronExpression = strings.TrimSpace(req.CronExpression)
	if req.TargetID == uuid.Nil {
		respondErr(w, http.StatusBadRequest, "target_id is required")
		return
	}
	if req.Name == "" {
		respondErr(w, http.StatusBadRequest, "name is required")
		return
	}
	if _, err := cron.ParseStandard(req.CronExpression); err != nil {
		respondErr(w, http.StatusBadRequest, "invalid cron_expression")
		return
	}
	if req.Retention.KeepLastBackups <= 0 {
		req.Retention.KeepLastBackups = 30
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	existing, err := h.repo.GetSchedule(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondErr(w, http.StatusNotFound, "schedule not found")
			return
		}
		h.logger.Error("get backup schedule failed", zap.Error(err), zap.String("schedule_id", id.String()))
		respondErr(w, http.StatusInternalServerError, "failed to get backup schedule")
		return
	}
	if _, err := h.repo.GetTarget(ctx, req.TargetID); err != nil {
		respondErr(w, http.StatusBadRequest, "target not found")
		return
	}
	enabled := existing.Enabled
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	schedule, err := h.repo.UpdateSchedule(ctx, id, backup.BackupSchedulePatch{
		TargetID:       req.TargetID,
		Name:           req.Name,
		CronExpression: req.CronExpression,
		Enabled:        enabled,
		Retention:      req.Retention,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondErr(w, http.StatusNotFound, "schedule not found")
			return
		}
		h.logger.Error("update backup schedule failed", zap.Error(err), zap.String("schedule_id", id.String()))
		respondErr(w, http.StatusInternalServerError, "failed to update backup schedule")
		return
	}
	h.reloadScheduler(ctx)
	respondJSON(w, http.StatusOK, schedule)
}

func (h *Handler) DeleteSchedule(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid schedule id")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	if err := h.repo.SoftDeleteSchedule(ctx, id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondErr(w, http.StatusNotFound, "schedule not found")
			return
		}
		h.logger.Error("delete backup schedule failed", zap.Error(err), zap.String("schedule_id", id.String()))
		respondErr(w, http.StatusInternalServerError, "failed to delete backup schedule")
		return
	}
	h.reloadScheduler(ctx)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListBackupRuns(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	runs, err := h.repo.ListBackupRuns(ctx, parseLimit(r))
	if err != nil {
		h.logger.Error("list backup runs failed", zap.Error(err))
		respondErr(w, http.StatusInternalServerError, "failed to list backup runs")
		return
	}
	respondJSON(w, http.StatusOK, runs)
}

type createBackupRunRequest struct {
	TargetID uuid.UUID `json:"target_id"`
}

func (h *Handler) CreateBackupRun(w http.ResponseWriter, r *http.Request) {
	var req createBackupRunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.TargetID == uuid.Nil {
		respondErr(w, http.StatusBadRequest, "target_id is required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	target, err := h.repo.GetTarget(ctx, req.TargetID)
	if err != nil {
		respondErr(w, http.StatusBadRequest, "target not found")
		return
	}
	if !target.Enabled {
		respondErr(w, http.StatusBadRequest, "target is disabled")
		return
	}
	run, err := h.repo.CreateBackupRun(ctx, req.TargetID, nil)
	if err != nil {
		h.logger.Error("create backup run failed", zap.Error(err), zap.String("target_id", req.TargetID.String()))
		respondErr(w, http.StatusInternalServerError, "failed to create backup run")
		return
	}
	respondJSON(w, http.StatusAccepted, run)
}

type createRestoreRunRequest struct {
	TargetID         uuid.UUID `json:"target_id"`
	BackupIdentifier string    `json:"backup_identifier"`
}

func (h *Handler) CreateRestoreRun(w http.ResponseWriter, r *http.Request) {
	var req createRestoreRunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.BackupIdentifier = strings.TrimSpace(req.BackupIdentifier)
	if req.TargetID == uuid.Nil {
		respondErr(w, http.StatusBadRequest, "target_id is required")
		return
	}
	if !safeBackupIdentifier(req.BackupIdentifier) {
		respondErr(w, http.StatusBadRequest, "invalid backup_identifier")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	if _, err := h.repo.GetTarget(ctx, req.TargetID); err != nil {
		respondErr(w, http.StatusBadRequest, "target not found")
		return
	}
	run, err := h.repo.CreateRestoreRun(ctx, req.TargetID, req.BackupIdentifier)
	if err != nil {
		h.logger.Error("create restore run failed", zap.Error(err), zap.String("target_id", req.TargetID.String()))
		respondErr(w, http.StatusInternalServerError, "failed to create restore run")
		return
	}
	respondJSON(w, http.StatusAccepted, run)
}

func (h *Handler) ListRestoreRuns(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	runs, err := h.repo.ListRestoreRuns(ctx, parseLimit(r))
	if err != nil {
		h.logger.Error("list restore runs failed", zap.Error(err))
		respondErr(w, http.StatusInternalServerError, "failed to list restore runs")
		return
	}
	respondJSON(w, http.StatusOK, runs)
}

func respondJSON(w http.ResponseWriter, code int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(value)
}

func respondErr(w http.ResponseWriter, code int, msg string) {
	respondJSON(w, code, map[string]string{"error": msg})
}

func validTargetType(targetType backup.TargetType) bool {
	switch targetType {
	case backup.TargetTypeSFTP, backup.TargetTypeLocal, backup.TargetTypeS3, backup.TargetTypeWebDAV:
		return true
	default:
		return false
	}
}

func parseLimit(r *http.Request) int {
	limit, err := strconv.Atoi(r.URL.Query().Get("limit"))
	if err != nil {
		return 100
	}
	if limit < 1 || limit > 200 {
		return 100
	}
	return limit
}

func safeBackupIdentifier(value string) bool {
	return value != "" && !strings.Contains(value, "/") && !strings.Contains(value, "\\") && !strings.Contains(value, "..") && !strings.Contains(value, "\x00")
}

func (h *Handler) mergeTargetConfiguration(existingRaw, patchRaw json.RawMessage) (json.RawMessage, error) {
	decryptedExisting, err := h.secrets.DecryptConfig(existingRaw)
	if err != nil {
		return nil, err
	}
	existing := map[string]any{}
	if len(decryptedExisting) > 0 {
		if err := json.Unmarshal(decryptedExisting, &existing); err != nil {
			return nil, err
		}
	}
	if len(patchRaw) == 0 {
		return json.Marshal(existing)
	}
	patch := map[string]any{}
	if err := json.Unmarshal(patchRaw, &patch); err != nil {
		return nil, err
	}
	for key, value := range patch {
		if isPreservedSecretKey(key) {
			if value == nil {
				continue
			}
			if str, ok := value.(string); ok && strings.TrimSpace(str) == "" {
				continue
			}
		}
		existing[key] = value
	}
	return json.Marshal(existing)
}

func isPreservedSecretKey(key string) bool {
	switch strings.ToLower(key) {
	case "password", "private_key", "privatekey", "passphrase":
		return true
	default:
		return false
	}
}

func (h *Handler) reloadScheduler(ctx context.Context) {
	if h.scheduler == nil {
		return
	}
	if err := h.scheduler.Reload(ctx); err != nil {
		h.logger.Error("reload backup scheduler failed", zap.Error(err))
	}
}
