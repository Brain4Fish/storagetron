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

type ContainerHandler struct {
	svc    *service.ContainerService
	logger *zap.Logger
}

func NewContainerHandler(s *service.ContainerService, l *zap.Logger) *ContainerHandler {
	return &ContainerHandler{svc: s, logger: l}
}

func (h *ContainerHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateContainerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondErr(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" {
		respondErr(w, http.StatusBadRequest, "name is required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	container, err := h.svc.Create(ctx, req)
	if err != nil {
		h.logger.Error("create container failed", zap.Error(err))
		respondErr(w, http.StatusInternalServerError, "failed to create container")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(container)
}

func (h *ContainerHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	containers, err := h.svc.List(ctx)
	if err != nil {
		h.logger.Error("list containers failed", zap.Error(err))
		respondErr(w, http.StatusInternalServerError, "failed to list containers")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(containers)
}

func (h *ContainerHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid id")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	container, err := h.svc.Get(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondErr(w, http.StatusNotFound, "container not found")
			return
		}
		h.logger.Error("get container failed", zap.Error(err), zap.String("container_id", id.String()))
		respondErr(w, http.StatusInternalServerError, "failed to get container")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(container)
}

func (h *ContainerHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid container id")
		return
	}

	var req model.UpdateContainerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondErr(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" {
		respondErr(w, http.StatusBadRequest, "name is required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	container, err := h.svc.Update(ctx, id, req)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondErr(w, http.StatusNotFound, "container not found")
			return
		}
		h.logger.Error("update container failed", zap.Error(err), zap.String("container_id", id.String()))
		respondErr(w, http.StatusInternalServerError, "failed to update container")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(container)
}

func (h *ContainerHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid container id")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if err := h.svc.Delete(ctx, id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondErr(w, http.StatusNotFound, "container not found")
			return
		}
		h.logger.Error("delete container failed", zap.Error(err), zap.String("container_id", id.String()))
		respondErr(w, http.StatusInternalServerError, "failed to delete container")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *ContainerHandler) AddItem(w http.ResponseWriter, r *http.Request) {
	containerID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid container id")
		return
	}

	var req model.AddItemToContainerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondErr(w, http.StatusBadRequest, "invalid request body")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if err := h.svc.AddItem(ctx, containerID, req.ItemID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondErr(w, http.StatusConflict, "item is already assigned to a kit")
			return
		}
		h.logger.Error("add item to container failed", zap.Error(err), zap.String("container_id", containerID.String()), zap.String("item_id", req.ItemID.String()))
		respondErr(w, http.StatusInternalServerError, "failed to add item to container")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *ContainerHandler) RemoveItem(w http.ResponseWriter, r *http.Request) {
	containerID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid container id")
		return
	}
	itemID, err := uuid.Parse(chi.URLParam(r, "item_id"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid item id")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if err := h.svc.RemoveItem(ctx, containerID, itemID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondErr(w, http.StatusNotFound, "relation not found")
			return
		}
		h.logger.Error("remove item from container failed", zap.Error(err), zap.String("container_id", containerID.String()), zap.String("item_id", itemID.String()))
		respondErr(w, http.StatusInternalServerError, "failed to remove item from container")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
