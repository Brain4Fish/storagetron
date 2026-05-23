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
	"go.uber.org/zap"
)

type PhotoHandler struct {
	svc    *service.PhotoService
	logger *zap.Logger
}

func NewPhotoHandler(s *service.PhotoService, l *zap.Logger) *PhotoHandler {
	return &PhotoHandler{svc: s, logger: l}
}

func (h *PhotoHandler) Upload(w http.ResponseWriter, r *http.Request) {
	itemID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid item id")
		return
	}

	var req model.CreatePhotoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondErr(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.FileName == "" {
		respondErr(w, http.StatusBadRequest, "file_name is required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resp, err := h.svc.CreateUpload(ctx, itemID, req)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondErr(w, http.StatusNotFound, "item not found")
			return
		}
		h.logger.Error("create photo upload failed", zap.Error(err), zap.String("item_id", itemID.String()))
		respondErr(w, http.StatusInternalServerError, "failed to create photo upload")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(resp)
}

func (h *PhotoHandler) UploadContainer(w http.ResponseWriter, r *http.Request) {
	containerID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid kit id")
		return
	}

	var req model.CreatePhotoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondErr(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.FileName == "" {
		respondErr(w, http.StatusBadRequest, "file_name is required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resp, err := h.svc.CreateContainerUpload(ctx, containerID, req)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondErr(w, http.StatusNotFound, "kit not found")
			return
		}
		h.logger.Error("create kit photo upload failed", zap.Error(err), zap.String("container_id", containerID.String()))
		respondErr(w, http.StatusInternalServerError, "failed to create photo upload")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(resp)
}

func (h *PhotoHandler) DeleteContainerPhoto(w http.ResponseWriter, r *http.Request) {
	containerID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid kit id")
		return
	}

	photoID, err := uuid.Parse(chi.URLParam(r, "photo_id"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid photo id")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if err := h.svc.DeleteContainerPhoto(ctx, containerID, photoID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondErr(w, http.StatusNotFound, "photo not found")
			return
		}
		h.logger.Error(
			"delete kit photo failed",
			zap.Error(err),
			zap.String("container_id", containerID.String()),
			zap.String("photo_id", photoID.String()),
		)
		respondErr(w, http.StatusInternalServerError, "failed to delete photo")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *PhotoHandler) DeleteItemPhoto(w http.ResponseWriter, r *http.Request) {
	itemID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid item id")
		return
	}

	photoID, err := uuid.Parse(chi.URLParam(r, "photo_id"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid photo id")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if err := h.svc.DeleteItemPhoto(ctx, itemID, photoID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondErr(w, http.StatusNotFound, "photo not found")
			return
		}
		h.logger.Error(
			"delete item photo failed",
			zap.Error(err),
			zap.String("item_id", itemID.String()),
			zap.String("photo_id", photoID.String()),
		)
		respondErr(w, http.StatusInternalServerError, "failed to delete photo")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
