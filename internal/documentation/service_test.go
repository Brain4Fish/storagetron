package docreport

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Brain4Fish/storagetron/pkg/model"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type fakeDocumentationRepository struct {
	locationScope  ScopeSnapshot
	containerScope ScopeSnapshot
	resolveErr     error
	insertErr      error
	records        []ReportRecord
	listLimit      int
	locationCalls  int
	containerCalls int
}

func (r *fakeDocumentationRepository) ResolveLocationScope(context.Context, uuid.UUID) (ScopeSnapshot, error) {
	r.locationCalls++
	return r.locationScope, r.resolveErr
}

func (r *fakeDocumentationRepository) ResolveContainersScope(context.Context, []uuid.UUID) (ScopeSnapshot, error) {
	r.containerCalls++
	return r.containerScope, r.resolveErr
}

func (r *fakeDocumentationRepository) InsertReport(_ context.Context, report *ReportRecord) error {
	if r.insertErr != nil {
		return r.insertErr
	}
	report.CreatedAt = time.Date(2026, time.July, 30, 12, 0, 0, 0, time.UTC)
	r.records = append(r.records, *report)
	return nil
}

func (r *fakeDocumentationRepository) ListReports(_ context.Context, limit int) ([]ReportRecord, error) {
	r.listLimit = limit
	if len(r.records) > limit {
		return r.records[:limit], nil
	}
	return r.records, nil
}

func (r *fakeDocumentationRepository) GetReport(_ context.Context, id uuid.UUID) (ReportRecord, error) {
	for _, record := range r.records {
		if record.ID == id {
			return record, nil
		}
	}
	return ReportRecord{}, ErrReportNotFound
}

type testRenderer struct {
	err error
}

func (r testRenderer) Render(_ context.Context, locale string, writer io.Writer, _ PreparedReport) error {
	if locale != "ru" {
		return errors.New("unexpected locale")
	}
	_, _ = writer.Write([]byte("complete report"))
	return r.err
}

func validDocumentationRequest(scope model.DocumentationScope) model.CreateDocumentationReportRequest {
	return model.CreateDocumentationReportRequest{
		Scope:    scope,
		Format:   "xlsx",
		Language: "ru",
		Summary: &model.DocumentationSummary{
			OwnerName:          "Иван Иванов",
			OriginCountry:      "Россия",
			DestinationCountry: "Казахстан",
			ShipmentDate:       "2026-08-01",
		},
	}
}

func TestServiceCreatesBothScopeTypesAndPersistsLanguageSnapshots(t *testing.T) {
	locationID := uuid.New()
	containerID := uuid.New()
	tests := []struct {
		name             string
		scope            model.DocumentationScope
		wantScope        string
		wantLocation     int
		wantContainers   int
		resolvedSnapshot ScopeSnapshot
	}{
		{
			name:      "location",
			scope:     model.DocumentationScope{Type: "location", LocationID: &locationID},
			wantScope: "location", wantLocation: 1,
			resolvedSnapshot: ScopeSnapshot{
				Type:       "location",
				Location:   &LocationSnapshot{ID: locationID, Name: "Дом"},
				Containers: []ContainerSnapshot{{ID: containerID}},
				LooseItems: []ItemSnapshot{},
			},
		},
		{
			name:      "containers",
			scope:     model.DocumentationScope{Type: "containers", ContainerIDs: []uuid.UUID{containerID, containerID}},
			wantScope: "containers", wantContainers: 1,
			resolvedSnapshot: ScopeSnapshot{
				Type:       "containers",
				Containers: []ContainerSnapshot{{ID: containerID}},
				LooseItems: []ItemSnapshot{},
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &fakeDocumentationRepository{locationScope: tt.resolvedSnapshot, containerScope: tt.resolvedSnapshot}
			store := NewFileStore(t.TempDir())
			service := NewService(repo, store, testRenderer{}, testRenderer{})

			metadata, err := service.Create(context.Background(), validDocumentationRequest(tt.scope))
			require.NoError(t, err)
			require.Equal(t, tt.wantScope, metadata.ScopeType)
			require.Equal(t, "ru", metadata.Language)
			require.Equal(t, 1, metadata.ScopeSummary.ContainersCount)
			if tt.wantScope == "location" {
				require.Equal(t, "Дом", metadata.ScopeSummary.LocationName)
			}
			require.Equal(t, tt.wantLocation, repo.locationCalls)
			require.Equal(t, tt.wantContainers, repo.containerCalls)
			require.Len(t, repo.records, 1)
			require.Contains(t, string(repo.records[0].RequestSnapshot), `"language":"ru"`)
			require.Contains(t, string(repo.records[0].ScopeSnapshot), `"type":"`+tt.wantScope+`"`)
			require.True(t, store.Exists(repo.records[0].RelativePath))
		})
	}
}

func TestRequestValidationLanguageScopeAndUnknownUUID(t *testing.T) {
	locationID := uuid.New()
	containerID := uuid.New()
	valid := validDocumentationRequest(model.DocumentationScope{Type: "location", LocationID: &locationID})
	tests := []struct {
		name   string
		mutate func(*model.CreateDocumentationReportRequest)
	}{
		{"missing language", func(request *model.CreateDocumentationReportRequest) { request.Language = "" }},
		{"unsupported language", func(request *model.CreateDocumentationReportRequest) { request.Language = "en" }},
		{"language with whitespace", func(request *model.CreateDocumentationReportRequest) { request.Language = " ru " }},
		{"empty scope", func(request *model.CreateDocumentationReportRequest) { request.Scope = model.DocumentationScope{} }},
		{"empty containers", func(request *model.CreateDocumentationReportRequest) {
			request.Scope = model.DocumentationScope{Type: "containers"}
		}},
		{"mixed scope", func(request *model.CreateDocumentationReportRequest) {
			request.Scope = model.DocumentationScope{Type: "containers", LocationID: &locationID, ContainerIDs: []uuid.UUID{containerID}}
		}},
		{"invalid date", func(request *model.CreateDocumentationReportRequest) { request.Summary.ShipmentDate = "2026-02-30" }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := valid
			summary := *valid.Summary
			request.Summary = &summary
			tt.mutate(&request)
			repo := &fakeDocumentationRepository{}
			service := NewService(repo, NewFileStore(t.TempDir()), testRenderer{}, testRenderer{})
			_, err := service.Create(context.Background(), request)
			require.Error(t, err)
			require.True(t, IsValidationError(err))
			require.Zero(t, repo.locationCalls+repo.containerCalls)
		})
	}

	repo := &fakeDocumentationRepository{resolveErr: ErrScopeNotFound}
	service := NewService(repo, NewFileStore(t.TempDir()), testRenderer{}, testRenderer{})
	_, err := service.Create(context.Background(), valid)
	require.ErrorIs(t, err, ErrScopeNotFound)
}

func TestPrepareReportLooseItemsDeduplicationCurrencyTotalsAndOverride(t *testing.T) {
	rub := "RUB"
	kzt := "KZT"
	usd := "USD"
	itemID := uuid.New()
	duplicate := ItemSnapshot{ID: itemID, Name: "Фотоаппарат", Quantity: 1, EstimatedValue: floatPointer(100), ValueCurrency: &rub}
	scope := ScopeSnapshot{
		Type: "location",
		Containers: []ContainerSnapshot{
			{
				ID: uuid.New(), PackageCode: "PKG-2", GrossWeightKg: floatPointer(12.5), VolumeM3: floatPointer(0.4),
				EstimatedValue: floatPointer(500), ValueCurrency: &usd,
				Items: []ItemSnapshot{
					{ID: uuid.New(), Name: "Пальто", Quantity: 2, EstimatedValue: floatPointer(1000.25), ValueCurrency: &kzt},
				},
			},
			{
				ID: uuid.New(), PackageCode: "PKG-1",
				Items: []ItemSnapshot{
					duplicate,
					{ID: uuid.New(), Name: "Книга", Quantity: 10, EstimatedValue: floatPointer(25.55), ValueCurrency: &rub},
				},
			},
			{
				ID: uuid.New(), PackageCode: "PKG-3",
				Items: []ItemSnapshot{
					{ID: uuid.New(), Name: "Чайник", Quantity: 1, EstimatedValue: floatPointer(20), ValueCurrency: &rub},
					{ID: uuid.New(), Name: "Ваза", Quantity: 1, EstimatedValue: floatPointer(30), ValueCurrency: &kzt},
				},
			},
		},
		LooseItems: []ItemSnapshot{
			duplicate,
			{ID: uuid.New(), Name: "Самокат", Quantity: 1, EstimatedValue: floatPointer(75.10), ValueCurrency: &rub},
		},
	}
	report := PrepareReport(validDocumentationRequest(model.DocumentationScope{Type: "location", LocationID: uuidPointer(uuid.New())}), scope)

	require.Len(t, report.ItemRows, 6)
	require.Equal(t, "", report.ItemRows[len(report.ItemRows)-1].PackageID)
	require.Equal(t, "Самокат", report.ItemRows[len(report.ItemRows)-1].Name)
	require.Equal(t, []MoneyTotal{
		{Currency: "KZT", MinorUnits: 3000},
		{Currency: "RUB", MinorUnits: 22065},
		{Currency: "USD", MinorUnits: 50000},
	}, report.CurrencyTotals)
	require.Equal(t, float64(500), *report.PackageRows[1].EstimatedValue)
	require.Equal(t, "USD", report.PackageRows[1].Currency)
	require.Nil(t, report.PackageRows[2].EstimatedValue)
	require.Empty(t, report.PackageRows[2].Currency)
}

func TestStorageAtomicCleanupMetadataFailureAndPathTraversal(t *testing.T) {
	dir := t.TempDir()
	store := NewFileStore(dir)
	validName := "documentation-report-" + uuid.NewString() + ".xlsx"
	_, err := store.WriteAtomic(validName, func(writer io.Writer) error {
		_, _ = writer.Write([]byte("partial"))
		return errors.New("render failed")
	})
	require.Error(t, err)
	entries, readErr := os.ReadDir(dir)
	require.NoError(t, readErr)
	require.Empty(t, entries)

	for _, unsafe := range []string{"../" + validName, "/tmp/" + validName, "nested/" + validName, "other.xlsx"} {
		_, err = store.WriteAtomic(unsafe, func(io.Writer) error { return nil })
		require.Error(t, err)
		require.False(t, store.Exists(unsafe))
		_, _, err = store.Open(unsafe)
		require.ErrorIs(t, err, os.ErrNotExist)
	}

	locationID := uuid.New()
	repo := &fakeDocumentationRepository{
		locationScope: ScopeSnapshot{Type: "location", Containers: []ContainerSnapshot{}, LooseItems: []ItemSnapshot{}},
		insertErr:     errors.New("metadata unavailable"),
	}
	service := NewService(repo, store, testRenderer{}, testRenderer{})
	_, err = service.Create(context.Background(), validDocumentationRequest(model.DocumentationScope{Type: "location", LocationID: &locationID}))
	require.Error(t, err)
	entries, readErr = os.ReadDir(dir)
	require.NoError(t, readErr)
	require.Empty(t, entries)
}

func TestListHardcodedLimitAndMissingFiles(t *testing.T) {
	dir := t.TempDir()
	store := NewFileStore(dir)
	repo := &fakeDocumentationRepository{}
	for index := 0; index < 51; index++ {
		id := uuid.New()
		filename := "documentation-report-" + id.String() + ".pdf"
		repo.records = append(repo.records, ReportRecord{
			ID: id, Filename: filename, RelativePath: filename, Format: "pdf",
			Language: "ru", ScopeType: "containers", ContentType: "application/pdf",
			ScopeSnapshot: []byte(`{"type":"containers","containers":[{},{}],"loose_items":[]}`),
			CreatedAt:     time.Now().Add(-time.Duration(index) * time.Minute),
		})
		if index != 3 {
			require.NoError(t, os.WriteFile(filepath.Join(dir, filename), []byte("%PDF"), 0o600))
		}
	}
	service := NewService(repo, store, testRenderer{}, testRenderer{})
	reports, err := service.List(context.Background())
	require.NoError(t, err)
	require.Equal(t, 50, repo.listLimit)
	require.Len(t, reports, 49)
	require.Equal(t, repo.records[0].ID, reports[0].ID)
	require.Equal(t, 2, reports[0].ScopeSummary.ContainersCount)
	for _, report := range reports {
		require.NotEqual(t, repo.records[3].ID, report.ID)
	}
}

func TestFileStorePublishesCompleteFile(t *testing.T) {
	store := NewFileStore(t.TempDir())
	name := "documentation-report-" + uuid.NewString() + ".pdf"
	size, err := store.WriteAtomic(name, func(writer io.Writer) error {
		_, err := io.Copy(writer, bytes.NewBufferString("complete"))
		return err
	})
	require.NoError(t, err)
	require.EqualValues(t, 8, size)
	file, info, err := store.Open(name)
	require.NoError(t, err)
	defer file.Close()
	require.EqualValues(t, 8, info.Size())
}

func TestServiceOpenRejectsMissingAndUnsafeMetadataPaths(t *testing.T) {
	id := uuid.New()
	repo := &fakeDocumentationRepository{records: []ReportRecord{{
		ID: id, Filename: "documentation-report-" + id.String() + ".pdf",
		RelativePath: "../outside.pdf",
	}}}
	service := NewService(repo, NewFileStore(t.TempDir()), testRenderer{}, testRenderer{})
	_, _, _, err := service.Open(context.Background(), id)
	require.ErrorIs(t, err, ErrReportNotFound)

	repo.records[0].RelativePath = repo.records[0].Filename
	_, _, _, err = service.Open(context.Background(), id)
	require.ErrorIs(t, err, ErrReportNotFound)
}

func TestPackageIDFallbacks(t *testing.T) {
	id := uuid.MustParse("12345678-1234-1234-1234-123456789abc")
	require.Equal(t, "PKG-001", (ContainerSnapshot{ID: id, Name: "Коробка", PackageCode: "PKG-001"}).PackageID())
	require.Equal(t, "Коробка", (ContainerSnapshot{ID: id, Name: "Коробка"}).PackageID())
	require.Equal(t, "12345678", (ContainerSnapshot{ID: id}).PackageID())
}

func floatPointer(value float64) *float64 {
	return &value
}

func uuidPointer(value uuid.UUID) *uuid.UUID {
	return &value
}
