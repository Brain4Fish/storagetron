package docreport

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"time"

	"github.com/Brain4Fish/storagetron/pkg/model"
	"github.com/google/uuid"
)

var (
	ErrScopeNotFound  = errors.New("documentation scope not found")
	ErrReportNotFound = errors.New("documentation report not found")
)

type ValidationError struct {
	Message string
}

func (e *ValidationError) Error() string {
	return e.Message
}

func validationError(message string) error {
	return &ValidationError{Message: message}
}

func IsValidationError(err error) bool {
	var target *ValidationError
	return errors.As(err, &target)
}

type LocationSnapshot struct {
	ID      uuid.UUID `json:"id"`
	Name    string    `json:"name"`
	Country string    `json:"country"`
	City    string    `json:"city"`
	Room    string    `json:"room"`
	Shelf   string    `json:"shelf"`
}

type ItemSnapshot struct {
	ID              uuid.UUID `json:"id"`
	Name            string    `json:"name"`
	Description     string    `json:"description"`
	Quantity        int       `json:"quantity"`
	Category        string    `json:"category"`
	AcquisitionYear *int16    `json:"acquisition_year"`
	Condition       string    `json:"condition"`
	SerialNumber    string    `json:"serial_number"`
	EstimatedValue  *float64  `json:"estimated_value"`
	ValueCurrency   *string   `json:"value_currency"`
	SourceLanguage  string    `json:"source_language"`
	Labels          []string  `json:"labels"`
}

type ContainerSnapshot struct {
	ID             uuid.UUID      `json:"id"`
	Name           string         `json:"name"`
	Description    string         `json:"description"`
	PackageCode    string         `json:"package_code"`
	GrossWeightKg  *float64       `json:"gross_weight_kg"`
	VolumeM3       *float64       `json:"volume_m3"`
	EstimatedValue *float64       `json:"estimated_value"`
	ValueCurrency  *string        `json:"value_currency"`
	SourceLanguage string         `json:"source_language"`
	Labels         []string       `json:"labels"`
	Items          []ItemSnapshot `json:"items"`
}

func (c ContainerSnapshot) PackageID() string {
	if c.PackageCode != "" {
		return c.PackageCode
	}
	if c.Name != "" {
		return c.Name
	}
	id := c.ID.String()
	if len(id) > 8 {
		return id[:8]
	}
	return id
}

type ScopeSnapshot struct {
	Type       string              `json:"type"`
	Location   *LocationSnapshot   `json:"location,omitempty"`
	Containers []ContainerSnapshot `json:"containers"`
	LooseItems []ItemSnapshot      `json:"loose_items"`
}

type ReportRecord struct {
	ID                   uuid.UUID
	Filename             string
	RelativePath         string
	Format               string
	Language             string
	ScopeType            string
	ScopeSnapshot        json.RawMessage
	RequestSnapshot      json.RawMessage
	TransportOrderNumber string
	ContentType          string
	SizeBytes            int64
	CreatedAt            time.Time
}

func (r ReportRecord) Metadata(scope ScopeSnapshot) model.DocumentationReportMetadata {
	scopeSummary := model.DocumentationReportScopeSummary{
		ContainersCount: len(scope.Containers),
	}
	if scope.Location != nil {
		scopeSummary.LocationName = scope.Location.Name
	}

	return model.DocumentationReportMetadata{
		ID:                   r.ID,
		Filename:             r.Filename,
		Format:               r.Format,
		Language:             r.Language,
		ScopeType:            r.ScopeType,
		ScopeSummary:         scopeSummary,
		TransportOrderNumber: r.TransportOrderNumber,
		ContentType:          r.ContentType,
		SizeBytes:            r.SizeBytes,
		CreatedAt:            r.CreatedAt,
		DownloadURL:          "/documentation/reports/" + r.ID.String() + "/download",
	}
}

type MoneyTotal struct {
	Currency   string
	MinorUnits int64
}

func (m MoneyTotal) Amount() float64 {
	return float64(m.MinorUnits) / 100
}

type PackageRow struct {
	Number         int
	PackageID      string
	Name           string
	Description    string
	Labels         string
	GrossWeightKg  *float64
	VolumeM3       *float64
	EstimatedValue *float64
	Currency       string
}

type ItemRow struct {
	Number          int
	PackageID       string
	Name            string
	Description     string
	Quantity        int
	Category        string
	Labels          string
	AcquisitionYear *int16
	Condition       string
	SerialNumber    string
	EstimatedValue  *float64
	Currency        string
}

type PreparedReport struct {
	Request        model.CreateDocumentationReportRequest
	Scope          ScopeSnapshot
	PackageRows    []PackageRow
	ItemRows       []ItemRow
	PackageCount   int
	TotalWeightKg  float64
	TotalVolumeM3  float64
	CurrencyTotals []MoneyTotal
}

type Repository interface {
	ResolveLocationScope(context.Context, uuid.UUID) (ScopeSnapshot, error)
	ResolveContainersScope(context.Context, []uuid.UUID) (ScopeSnapshot, error)
	InsertReport(context.Context, *ReportRecord) error
	ListReports(context.Context, int) ([]ReportRecord, error)
	GetReport(context.Context, uuid.UUID) (ReportRecord, error)
}

type Renderer interface {
	Render(context.Context, string, io.Writer, PreparedReport) error
}

type ReportStorage interface {
	WriteAtomic(string, func(io.Writer) error) (int64, error)
	Remove(string) error
	Exists(string) bool
	Open(string) (*os.File, os.FileInfo, error)
}
