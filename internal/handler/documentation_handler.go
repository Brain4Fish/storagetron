package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"

	documentation "github.com/Brain4Fish/storagetron/internal/documentation"
	"github.com/Brain4Fish/storagetron/pkg/model"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

type documentationService interface {
	Create(context.Context, model.CreateDocumentationReportRequest) (model.DocumentationReportMetadata, error)
	List(context.Context) ([]model.DocumentationReportMetadata, error)
	Open(context.Context, uuid.UUID) (documentation.ReportRecord, *os.File, os.FileInfo, error)
}

type DocumentationHandler struct {
	service documentationService
	logger  *zap.Logger
}

func NewDocumentationHandler(service documentationService, logger *zap.Logger) *DocumentationHandler {
	return &DocumentationHandler{service: service, logger: logger}
}

func (h *DocumentationHandler) Create(w http.ResponseWriter, r *http.Request) {
	var request model.CreateDocumentationReportRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		respondErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		respondErr(w, http.StatusBadRequest, "invalid request body")
		return
	}

	report, err := h.service.Create(r.Context(), request)
	if err != nil {
		switch {
		case documentation.IsValidationError(err):
			respondErr(w, http.StatusBadRequest, err.Error())
		case errors.Is(err, documentation.ErrScopeNotFound):
			respondErr(w, http.StatusNotFound, "documentation scope not found")
		default:
			h.logger.Error("create documentation report failed", zap.Error(err))
			respondErr(w, http.StatusInternalServerError, "failed to create documentation report")
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Location", report.DownloadURL)
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(report)
}

func (h *DocumentationHandler) List(w http.ResponseWriter, r *http.Request) {
	reports, err := h.service.List(r.Context())
	if err != nil {
		h.logger.Error("list documentation reports failed", zap.Error(err))
		respondErr(w, http.StatusInternalServerError, "failed to list documentation reports")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(reports)
}

func (h *DocumentationHandler) Download(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondErr(w, http.StatusBadRequest, "invalid documentation report id")
		return
	}
	record, file, info, err := h.service.Open(r.Context(), id)
	if err != nil {
		if errors.Is(err, documentation.ErrReportNotFound) {
			respondErr(w, http.StatusNotFound, "documentation report not found")
			return
		}
		h.logger.Error("open documentation report failed", zap.Error(err), zap.String("report_id", id.String()))
		respondErr(w, http.StatusInternalServerError, "failed to download documentation report")
		return
	}
	defer file.Close()

	disposition := mime.FormatMediaType("attachment", map[string]string{"filename": record.Filename})
	w.Header().Set("Content-Type", record.ContentType)
	w.Header().Set("Content-Disposition", disposition)
	w.Header().Set("Content-Length", fmt.Sprintf("%d", info.Size()))
	http.ServeContent(w, r, record.Filename, info.ModTime(), file)
}
