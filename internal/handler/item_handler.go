package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/Brain4Fish/storagetron/internal/service"
	"github.com/Brain4Fish/storagetron/pkg/model"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"go.uber.org/zap"
)

type ItemHandler struct {
	svc    *service.ItemService
	logger *zap.Logger
}

func NewItemHandler(s *service.ItemService, l *zap.Logger) *ItemHandler {
	return &ItemHandler{svc: s, logger: l}
}

func respondErr(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func (h *ItemHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateItemRequest
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

	item, err := h.svc.Create(ctx, req)
	if err != nil {
		h.logger.Error("create item failed", zap.Error(err))
		respondErr(w, http.StatusInternalServerError, "failed to create item")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(item)
}

func (h *ItemHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	limitParam := r.URL.Query().Get("limit")
	offsetParam := r.URL.Query().Get("offset")
	if limitParam != "" || offsetParam != "" {
		limit := 25
		offset := 0

		if limitParam != "" {
			parsedLimit, err := strconv.Atoi(limitParam)
			if err != nil || parsedLimit < 1 || parsedLimit > 100 {
				respondErr(w, http.StatusBadRequest, "limit must be between 1 and 100")
				return
			}
			limit = parsedLimit
		}

		if offsetParam != "" {
			parsedOffset, err := strconv.Atoi(offsetParam)
			if err != nil || parsedOffset < 0 {
				respondErr(w, http.StatusBadRequest, "offset must be 0 or greater")
				return
			}
			offset = parsedOffset
		}

		page, err := h.svc.ListPage(ctx, limit, offset)
		if err != nil {
			h.logger.Error("list item page failed", zap.Error(err), zap.Int("limit", limit), zap.Int("offset", offset))
			respondErr(w, http.StatusInternalServerError, "failed to list items")
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(page)
		return
	}

	items, err := h.svc.List(ctx)
	if err != nil {
		h.logger.Error("list items failed", zap.Error(err))
		respondErr(w, http.StatusInternalServerError, "failed to list items")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(items)
}

func (h *ItemHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid id")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	item, err := h.svc.Get(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondErr(w, http.StatusNotFound, "item not found")
			return
		}
		h.logger.Error("get item failed", zap.Error(err), zap.String("item_id", id.String()))
		respondErr(w, http.StatusInternalServerError, "failed to get item")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(item)
}

func (h *ItemHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid id")
		return
	}

	var req model.UpdateItemRequest
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

	item, err := h.svc.Update(ctx, id, req)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondErr(w, http.StatusNotFound, "item not found")
			return
		}
		h.logger.Error("update item failed", zap.Error(err), zap.String("item_id", id.String()))
		respondErr(w, http.StatusInternalServerError, "failed to update item")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(item)
}

func (h *ItemHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid id")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if err := h.svc.Delete(ctx, id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondErr(w, http.StatusNotFound, "item not found")
			return
		}
		h.logger.Error("delete item failed", zap.Error(err), zap.String("item_id", id.String()))
		respondErr(w, http.StatusInternalServerError, "failed to delete item")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
