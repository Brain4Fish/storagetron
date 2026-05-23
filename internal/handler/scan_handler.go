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

type scanItemService interface {
	GetByCode(context.Context, string) (model.Item, error)
	GetLabel(context.Context, string) (*model.Label, error)
}

type scanContainerService interface {
	GetByCode(context.Context, string) (model.Container, error)
	GetLabel(context.Context, string) (*model.Label, error)
}

type scanPhotoService interface {
	ListByItemID(context.Context, string) ([]model.Photo, error)
}

type ScanHandler struct {
	itemSvc      *service.ItemService
	containerSvc *service.ContainerService
	logger       *zap.Logger
}

func NewScanHandler(itemSvc *service.ItemService, containerSvc *service.ContainerService, logger *zap.Logger) *ScanHandler {
	return &ScanHandler{
		itemSvc:      itemSvc,
		containerSvc: containerSvc,
		logger:       logger,
	}
}

func (h *ScanHandler) Scan(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	if code == "" {
		respondErr(w, http.StatusBadRequest, "code is required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	item, err := h.itemSvc.GetByCode(ctx, code)
	if err == nil {
		label, labelErr := h.itemSvc.GetLabelByCode(ctx, code)
		if labelErr != nil {
			h.logger.Error("get item label failed", zap.Error(labelErr), zap.String("code", code))
			respondErr(w, http.StatusInternalServerError, "failed to scan code")
			return
		}

		resp := model.ScanResult{
			Type:  "item",
			Item:  &item,
			Label: label,
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
		return
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		h.logger.Error("scan item lookup failed", zap.Error(err), zap.String("code", code))
		respondErr(w, http.StatusInternalServerError, "failed to scan code")
		return
	}

	container, err := h.containerSvc.GetByCode(ctx, code)
	if err == nil {
		label, labelErr := h.containerSvc.GetLabelByCode(ctx, code)
		if labelErr != nil {
			h.logger.Error("get container label failed", zap.Error(labelErr), zap.String("code", code))
			respondErr(w, http.StatusInternalServerError, "failed to scan code")
			return
		}

		resp := model.ScanResult{
			Type:      "container",
			Container: &container,
			Label:     label,
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
		return
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		h.logger.Error("scan container lookup failed", zap.Error(err), zap.String("code", code))
		respondErr(w, http.StatusInternalServerError, "failed to scan code")
		return
	}

	id, parseErr := uuid.Parse(code)
	if parseErr == nil {
		item, err := h.itemSvc.Get(ctx, id)
		if err == nil {
			resp := model.ScanResult{
				Type: "item",
				Item: &item,
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(resp)
			return
		}
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			h.logger.Error("scan item id lookup failed", zap.Error(err), zap.String("code", code))
			respondErr(w, http.StatusInternalServerError, "failed to scan code")
			return
		}

		container, err := h.containerSvc.Get(ctx, id)
		if err == nil {
			resp := model.ScanResult{
				Type:      "container",
				Container: &container,
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(resp)
			return
		}
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			h.logger.Error("scan container id lookup failed", zap.Error(err), zap.String("code", code))
			respondErr(w, http.StatusInternalServerError, "failed to scan code")
			return
		}
	}

	respondErr(w, http.StatusNotFound, "code not found")
}
