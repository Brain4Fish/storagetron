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

type LocationHandler struct {
	svc    *service.LocationService
	logger *zap.Logger
}

func NewLocationHandler(svc *service.LocationService, logger *zap.Logger) *LocationHandler {
	return &LocationHandler{svc: svc, logger: logger}
}

func (h *LocationHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateLocationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Country == "" && req.City == "" && req.Room == "" && req.Shelf == "" {
		respondErr(w, http.StatusBadRequest, "at least one location field is required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	location, err := h.svc.Create(ctx, req)
	if err != nil {
		h.logger.Error("create location failed", zap.Error(err))
		respondErr(w, http.StatusInternalServerError, "failed to create location")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(location)
}

func (h *LocationHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	locations, err := h.svc.List(ctx)
	if err != nil {
		h.logger.Error("list locations failed", zap.Error(err))
		respondErr(w, http.StatusInternalServerError, "failed to list locations")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(locations)
}

func (h *LocationHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid location id")
		return
	}

	var req model.UpdateLocationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Country == "" && req.City == "" && req.Room == "" && req.Shelf == "" {
		respondErr(w, http.StatusBadRequest, "at least one location field is required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	location, err := h.svc.Update(ctx, id, req)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondErr(w, http.StatusNotFound, "location not found")
			return
		}
		h.logger.Error("update location failed", zap.Error(err), zap.String("location_id", id.String()))
		respondErr(w, http.StatusInternalServerError, "failed to update location")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(location)
}

func (h *LocationHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid location id")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if err := h.svc.Delete(ctx, id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondErr(w, http.StatusNotFound, "location not found")
			return
		}
		h.logger.Error("delete location failed", zap.Error(err), zap.String("location_id", id.String()))
		respondErr(w, http.StatusInternalServerError, "failed to delete location")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
