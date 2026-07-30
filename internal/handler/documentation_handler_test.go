package handler

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	documentation "github.com/Brain4Fish/storagetron/internal/documentation"
	"github.com/Brain4Fish/storagetron/pkg/model"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

type fakeDocumentationHandlerService struct {
	metadata model.DocumentationReportMetadata
	record   documentation.ReportRecord
	path     string
	err      error
}

func (s *fakeDocumentationHandlerService) Create(context.Context, model.CreateDocumentationReportRequest) (model.DocumentationReportMetadata, error) {
	return s.metadata, s.err
}

func (s *fakeDocumentationHandlerService) List(context.Context) ([]model.DocumentationReportMetadata, error) {
	if s.err != nil {
		return nil, s.err
	}
	return []model.DocumentationReportMetadata{s.metadata}, nil
}

func (s *fakeDocumentationHandlerService) Open(context.Context, uuid.UUID) (documentation.ReportRecord, *os.File, os.FileInfo, error) {
	if s.err != nil {
		return documentation.ReportRecord{}, nil, nil, s.err
	}
	file, err := os.Open(s.path)
	if err != nil {
		return documentation.ReportRecord{}, nil, nil, err
	}
	info, err := file.Stat()
	if err != nil {
		file.Close()
		return documentation.ReportRecord{}, nil, nil, err
	}
	return s.record, file, info, nil
}

func TestDocumentationRoutesAtRootAndAPI(t *testing.T) {
	id := uuid.New()
	service := &fakeDocumentationHandlerService{
		metadata: model.DocumentationReportMetadata{
			ID: id, Filename: "documentation-report-" + id.String() + ".xlsx",
			Format: "xlsx", Language: "ru", ScopeType: "location",
			ScopeSummary: model.DocumentationReportScopeSummary{LocationName: "Дом", ContainersCount: 2},
			CreatedAt:    time.Now(), DownloadURL: "/documentation/reports/" + id.String() + "/download",
		},
	}
	handler := NewDocumentationHandler(service, zap.NewNop())
	router := chi.NewRouter()
	register := func(router chi.Router) {
		router.Post("/documentation/reports", handler.Create)
		router.Get("/documentation/reports", handler.List)
		router.Get("/documentation/reports/{id}/download", handler.Download)
	}
	register(router)
	router.Route("/api", register)

	body := `{"scope":{"type":"location","location_id":"` + uuid.NewString() + `"},"format":"xlsx","language":"ru","summary":{"owner_name":"Иван","origin_country":"Россия","destination_country":"Казахстан","shipment_date":"2026-08-01"}}`
	for _, path := range []string{"/documentation/reports", "/api/documentation/reports"} {
		request := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		require.Equal(t, http.StatusCreated, response.Code)
		require.Equal(t, service.metadata.DownloadURL, response.Header().Get("Location"))
		require.Contains(t, response.Body.String(), `"scope_summary":{"location_name":"Дом","containers_count":2}`)
	}
}

func TestDocumentationHandlerErrorsAndDownloadHeaders(t *testing.T) {
	id := uuid.New()
	filename := "documentation-report-" + id.String() + ".pdf"
	path := filepath.Join(t.TempDir(), filename)
	require.NoError(t, os.WriteFile(path, []byte("%PDF-report"), 0o600))
	service := &fakeDocumentationHandlerService{
		record: documentation.ReportRecord{
			ID: id, Filename: filename, ContentType: "application/pdf",
		},
		path: path,
	}
	handler := NewDocumentationHandler(service, zap.NewNop())
	router := chi.NewRouter()
	router.Post("/documentation/reports", handler.Create)
	router.Get("/documentation/reports/{id}/download", handler.Download)

	request := httptest.NewRequest(http.MethodGet, "/documentation/reports/"+id.String()+"/download", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusOK, response.Code)
	require.Equal(t, "application/pdf", response.Header().Get("Content-Type"))
	require.Contains(t, response.Header().Get("Content-Disposition"), filename)

	service.err = documentation.ErrReportNotFound
	request = httptest.NewRequest(http.MethodGet, "/documentation/reports/"+id.String()+"/download", nil)
	response = httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusNotFound, response.Code)

	service.err = documentation.ErrScopeNotFound
	request = httptest.NewRequest(http.MethodPost, "/documentation/reports", strings.NewReader(`{}`))
	response = httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusNotFound, response.Code)

	service.err = &documentation.ValidationError{Message: "language must be ru"}
	request = httptest.NewRequest(http.MethodPost, "/documentation/reports", strings.NewReader(`{}`))
	response = httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusBadRequest, response.Code)

	service.err = errors.New("boom")
	request = httptest.NewRequest(http.MethodGet, "/documentation/reports/"+id.String()+"/download", nil)
	response = httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusInternalServerError, response.Code)
}
