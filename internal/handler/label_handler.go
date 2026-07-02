package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/Brain4Fish/storagetron/internal/service"
	"github.com/Brain4Fish/storagetron/pkg/model"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"go.uber.org/zap"
)

type LabelHandler struct {
	svc    *service.LabelService
	logger *zap.Logger
}

func NewLabelHandler(svc *service.LabelService, logger *zap.Logger) *LabelHandler {
	return &LabelHandler{svc: svc, logger: logger}
}

func (h *LabelHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	labels, err := h.svc.List(ctx)
	if err != nil {
		h.logger.Error("list labels failed", zap.Error(err))
		respondErr(w, http.StatusInternalServerError, "failed to list labels")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(labels)
}

func (h *LabelHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateLabelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	label, err := h.svc.Create(ctx, req)
	if h.respondMutationError(w, err, "create") {
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(label)
}

func (h *LabelHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid label id")
		return
	}
	var req model.UpdateLabelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	label, err := h.svc.Update(ctx, id, req)
	if h.respondMutationError(w, err, "update") {
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(label)
}

func (h *LabelHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid label id")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	if err := h.svc.Delete(ctx, id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondErr(w, http.StatusNotFound, "label not found")
			return
		}
		h.logger.Error("delete label failed", zap.Error(err), zap.String("label_id", id.String()))
		respondErr(w, http.StatusInternalServerError, "failed to delete label")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *LabelHandler) respondMutationError(w http.ResponseWriter, err error, operation string) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, service.ErrInvalidLabelName) || errors.Is(err, service.ErrInvalidLabelColor) {
		respondErr(w, http.StatusBadRequest, err.Error())
		return true
	}
	if errors.Is(err, pgx.ErrNoRows) {
		respondErr(w, http.StatusNotFound, "label not found")
		return true
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		respondErr(w, http.StatusConflict, "a label with this name already exists")
		return true
	}
	h.logger.Error(operation+" label failed", zap.Error(err))
	respondErr(w, http.StatusInternalServerError, "failed to "+operation+" label")
	return true
}
