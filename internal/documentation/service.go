package docreport

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/Brain4Fish/storagetron/pkg/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const recentReportsLimit = 50

type Service struct {
	repo      Repository
	storage   ReportStorage
	renderers map[string]Renderer
}

func NewService(repo Repository, storage ReportStorage, xlsxRenderer, pdfRenderer Renderer) *Service {
	return &Service{
		repo:    repo,
		storage: storage,
		renderers: map[string]Renderer{
			"xlsx": xlsxRenderer,
			"pdf":  pdfRenderer,
		},
	}
}

func (s *Service) Create(ctx context.Context, request model.CreateDocumentationReportRequest) (model.DocumentationReportMetadata, error) {
	req, err := normalizeAndValidateRequest(request)
	if err != nil {
		return model.DocumentationReportMetadata{}, err
	}

	var scope ScopeSnapshot
	switch req.Scope.Type {
	case "location":
		scope, err = s.repo.ResolveLocationScope(ctx, *req.Scope.LocationID)
	case "containers":
		scope, err = s.repo.ResolveContainersScope(ctx, req.Scope.ContainerIDs)
	}
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, ErrScopeNotFound) {
			return model.DocumentationReportMetadata{}, ErrScopeNotFound
		}
		return model.DocumentationReportMetadata{}, err
	}

	renderer := s.renderers[req.Format]
	if renderer == nil {
		return model.DocumentationReportMetadata{}, validationError("format must be xlsx or pdf")
	}
	prepared := PrepareReport(req, scope)
	scopeJSON, err := json.Marshal(prepared.Scope)
	if err != nil {
		return model.DocumentationReportMetadata{}, fmt.Errorf("marshal scope snapshot: %w", err)
	}
	requestJSON, err := json.Marshal(req)
	if err != nil {
		return model.DocumentationReportMetadata{}, fmt.Errorf("marshal request snapshot: %w", err)
	}

	id := uuid.New()
	filename := "documentation-report-" + id.String() + "." + req.Format
	contentType := "application/pdf"
	if req.Format == "xlsx" {
		contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	}
	size, err := s.storage.WriteAtomic(filename, func(writer io.Writer) error {
		return renderer.Render(ctx, req.Language, writer, prepared)
	})
	if err != nil {
		return model.DocumentationReportMetadata{}, err
	}

	record := ReportRecord{
		ID:                   id,
		Filename:             filename,
		RelativePath:         filename,
		Format:               req.Format,
		Language:             req.Language,
		ScopeType:            req.Scope.Type,
		ScopeSnapshot:        scopeJSON,
		RequestSnapshot:      requestJSON,
		TransportOrderNumber: req.Summary.TransportOrderNumber,
		ContentType:          contentType,
		SizeBytes:            size,
	}
	if err := s.repo.InsertReport(ctx, &record); err != nil {
		if cleanupErr := s.storage.Remove(filename); cleanupErr != nil {
			return model.DocumentationReportMetadata{}, fmt.Errorf("insert documentation report metadata: %v; remove generated file: %w", err, cleanupErr)
		}
		return model.DocumentationReportMetadata{}, err
	}
	return record.Metadata(prepared.Scope), nil
}

func (s *Service) List(ctx context.Context) ([]model.DocumentationReportMetadata, error) {
	records, err := s.repo.ListReports(ctx, recentReportsLimit)
	if err != nil {
		return nil, err
	}
	result := make([]model.DocumentationReportMetadata, 0, len(records))
	for _, record := range records {
		if s.storage.Exists(record.RelativePath) {
			var scope ScopeSnapshot
			if err := json.Unmarshal(record.ScopeSnapshot, &scope); err != nil {
				return nil, fmt.Errorf("unmarshal documentation scope snapshot: %w", err)
			}
			result = append(result, record.Metadata(scope))
		}
	}
	return result, nil
}

func (s *Service) Open(ctx context.Context, id uuid.UUID) (ReportRecord, *os.File, os.FileInfo, error) {
	record, err := s.repo.GetReport(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, ErrReportNotFound) {
			return ReportRecord{}, nil, nil, ErrReportNotFound
		}
		return ReportRecord{}, nil, nil, err
	}
	file, info, err := s.storage.Open(record.RelativePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ReportRecord{}, nil, nil, ErrReportNotFound
		}
		return ReportRecord{}, nil, nil, err
	}
	return record, file, info, nil
}

func normalizeAndValidateRequest(req model.CreateDocumentationReportRequest) (model.CreateDocumentationReportRequest, error) {
	req.Format = strings.ToLower(strings.TrimSpace(req.Format))
	req.Scope.Type = strings.ToLower(strings.TrimSpace(req.Scope.Type))

	if req.Language != "ru" {
		return req, validationError("language must be ru")
	}
	if req.Format != "xlsx" && req.Format != "pdf" {
		return req, validationError("format must be xlsx or pdf")
	}
	if req.Summary == nil {
		return req, validationError("summary is required")
	}
	normalizeSummary(req.Summary)
	if req.Summary.OwnerName == "" {
		return req, validationError("summary.owner_name is required")
	}
	if req.Summary.OriginCountry == "" {
		return req, validationError("summary.origin_country is required")
	}
	if req.Summary.DestinationCountry == "" {
		return req, validationError("summary.destination_country is required")
	}
	if _, err := time.Parse("2006-01-02", req.Summary.ShipmentDate); err != nil {
		return req, validationError("summary.shipment_date must use yyyy-mm-dd")
	}

	switch req.Scope.Type {
	case "location":
		if req.Scope.LocationID == nil || len(req.Scope.ContainerIDs) != 0 {
			return req, validationError("location scope requires location_id only")
		}
	case "containers":
		if req.Scope.LocationID != nil || len(req.Scope.ContainerIDs) == 0 {
			return req, validationError("containers scope requires non-empty container_ids only")
		}
		seen := make(map[uuid.UUID]struct{}, len(req.Scope.ContainerIDs))
		deduplicated := make([]uuid.UUID, 0, len(req.Scope.ContainerIDs))
		for _, id := range req.Scope.ContainerIDs {
			if _, exists := seen[id]; exists {
				continue
			}
			seen[id] = struct{}{}
			deduplicated = append(deduplicated, id)
		}
		req.Scope.ContainerIDs = deduplicated
	default:
		return req, validationError("scope.type must be location or containers")
	}
	return req, nil
}

func normalizeSummary(summary *model.DocumentationSummary) {
	summary.OwnerName = strings.TrimSpace(summary.OwnerName)
	summary.Carrier = strings.TrimSpace(summary.Carrier)
	summary.TransportOrderNumber = strings.TrimSpace(summary.TransportOrderNumber)
	summary.OriginCountry = strings.TrimSpace(summary.OriginCountry)
	summary.OriginAddress = strings.TrimSpace(summary.OriginAddress)
	summary.DestinationCountry = strings.TrimSpace(summary.DestinationCountry)
	summary.DestinationAddress = strings.TrimSpace(summary.DestinationAddress)
	summary.ShipmentDate = strings.TrimSpace(summary.ShipmentDate)
}
