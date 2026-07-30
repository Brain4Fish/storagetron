package service

import (
	"context"
	"errors"
	"testing"

	"github.com/Brain4Fish/storagetron/pkg/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func TestItemServiceCreatePersistsLabelAndReturnsCreatedItem(t *testing.T) {
	repo := &fakeItemRepository{}
	svc := NewItemService(repo, NewPhotoService(&fakePhotoRepository{}, &fakePresignStorage{}))

	item, err := svc.Create(context.Background(), model.CreateItemRequest{
		Name:        "Laptop",
		Description: "Black sleeve",
		LabelCode:   "ITEM-LAPTOP",
	})

	require.NoError(t, err)
	require.Equal(t, "ITEM-LAPTOP", repo.createdLabelCode)
	require.Equal(t, "Laptop", repo.created.Name)
	require.Equal(t, "Black sleeve", repo.created.Description)
	require.Equal(t, 1, repo.created.Quantity)
	require.Equal(t, "used", repo.created.Condition)
	require.Equal(t, "ru", repo.created.SourceLanguage)
	require.Equal(t, repo.created.ID, repo.getID)
	require.Equal(t, "Laptop", item.Name)
}

func TestItemServiceRejectsInvalidDocumentFields(t *testing.T) {
	zero := 0
	negative := -1.0
	used := "broken"
	usd := "USD"
	tests := []struct {
		name string
		req  model.CreateItemRequest
	}{
		{name: "zero quantity", req: model.CreateItemRequest{Name: "Item", Quantity: &zero}},
		{name: "negative value", req: model.CreateItemRequest{Name: "Item", EstimatedValue: &negative, ValueCurrency: &usd}},
		{name: "value without currency", req: model.CreateItemRequest{Name: "Item", EstimatedValue: float64Ptr(10)}},
		{name: "currency without value", req: model.CreateItemRequest{Name: "Item", ValueCurrency: &usd}},
		{name: "invalid condition", req: model.CreateItemRequest{Name: "Item", Condition: &used}},
		{name: "invalid currency", req: model.CreateItemRequest{Name: "Item", EstimatedValue: float64Ptr(10), ValueCurrency: stringPtr("US")}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := NewItemService(&fakeItemRepository{}, NewPhotoService(&fakePhotoRepository{}, &fakePresignStorage{}))
			_, err := svc.Create(context.Background(), tt.req)
			require.Error(t, err)
			require.True(t, IsValidationError(err))
		})
	}
}

func TestItemServiceUpdatePreservesOmittedFieldsAndClearsNullableFields(t *testing.T) {
	year := int16(2021)
	value := 1250.50
	currency := "RUB"
	repo := &fakeItemRepository{item: model.Item{
		ID:              uuid.New(),
		Name:            "Camera",
		Quantity:        2,
		Category:        "Electronics",
		AcquisitionYear: &year,
		Condition:       "used",
		SerialNumber:    "SN-1",
		EstimatedValue:  &value,
		ValueCurrency:   &currency,
		SourceLanguage:  "ru",
	}}
	svc := NewItemService(repo, NewPhotoService(&fakePhotoRepository{}, &fakePresignStorage{}))

	_, err := svc.Update(context.Background(), repo.item.ID, model.UpdateItemRequest{Name: "Camera updated"})
	require.NoError(t, err)
	require.Equal(t, 2, repo.updated.Quantity)
	require.Equal(t, "Electronics", repo.updated.Category)
	require.Equal(t, &year, repo.updated.AcquisitionYear)
	require.Equal(t, &value, repo.updated.EstimatedValue)
	require.Equal(t, &currency, repo.updated.ValueCurrency)

	_, err = svc.Update(context.Background(), repo.item.ID, model.UpdateItemRequest{
		Name:            "Camera updated",
		AcquisitionYear: model.Optional[int16]{Set: true},
		EstimatedValue:  model.Optional[float64]{Set: true},
		ValueCurrency:   model.Optional[string]{Set: true},
	})
	require.NoError(t, err)
	require.Nil(t, repo.updated.AcquisitionYear)
	require.Nil(t, repo.updated.EstimatedValue)
	require.Nil(t, repo.updated.ValueCurrency)
}

func TestItemServiceListPageAttachesPhotosAndShapesResponse(t *testing.T) {
	itemID := uuid.New()
	repo := &fakeItemRepository{
		pageItems: []model.Item{{ID: itemID, Name: "Camera"}},
		total:     12,
	}
	photoRepo := &fakePhotoRepository{itemPhotos: []model.Photo{{ID: uuid.New(), ObjectKey: "items/camera.jpg"}}}
	storage := &fakePresignStorage{getURLs: map[string]string{"items/camera.jpg": "https://storage/camera"}}
	svc := NewItemService(repo, NewPhotoService(photoRepo, storage))

	page, err := svc.ListPage(context.Background(), 25, 50)

	require.NoError(t, err)
	require.Equal(t, 25, repo.pageLimit)
	require.Equal(t, 50, repo.pageOffset)
	require.Equal(t, 12, page.Total)
	require.Equal(t, 25, page.Limit)
	require.Equal(t, 50, page.Offset)
	require.Len(t, page.Items, 1)
	require.Equal(t, "https://storage/camera", page.Items[0].Photos[0].URL)
	require.Equal(t, itemID, photoRepo.listItemID)
}

func TestItemServiceGetReturnsRepositoryErrorWithoutLoadingPhotos(t *testing.T) {
	repo := &fakeItemRepository{getErr: pgx.ErrNoRows}
	photoRepo := &fakePhotoRepository{}
	svc := NewItemService(repo, NewPhotoService(photoRepo, &fakePresignStorage{}))

	_, err := svc.Get(context.Background(), uuid.New())

	require.ErrorIs(t, err, pgx.ErrNoRows)
	require.Equal(t, uuid.Nil, photoRepo.listItemID)
}

func TestItemServiceListReturnsPhotoError(t *testing.T) {
	itemID := uuid.New()
	repo := &fakeItemRepository{items: []model.Item{{ID: itemID, Name: "Camera"}}}
	photoRepo := &fakePhotoRepository{listErr: errors.New("presign source failed")}
	svc := NewItemService(repo, NewPhotoService(photoRepo, &fakePresignStorage{}))

	_, err := svc.List(context.Background())

	require.ErrorContains(t, err, "presign source failed")
}

func TestItemServiceDeleteRemovesRecordAndPhotoObjects(t *testing.T) {
	itemID := uuid.New()
	repo := &fakeItemRepository{}
	photoRepo := &fakePhotoRepository{itemPhotos: []model.Photo{
		{ID: uuid.New(), ObjectKey: "items/camera/front.jpg"},
		{ID: uuid.New(), ObjectKey: "items/camera/back.jpg"},
	}}
	storage := &fakePresignStorage{}
	svc := NewItemService(repo, NewPhotoService(photoRepo, storage))

	err := svc.Delete(context.Background(), itemID)

	require.NoError(t, err)
	require.Equal(t, itemID, photoRepo.listItemID)
	require.Equal(t, itemID, repo.deleteID)
	require.Equal(t, []string{"items/camera/front.jpg", "items/camera/back.jpg"}, storage.deletedKeys)
}

func TestItemServiceDeleteDoesNotRemovePhotoObjectsWhenRecordDeleteFails(t *testing.T) {
	itemID := uuid.New()
	repo := &fakeItemRepository{deleteErr: pgx.ErrNoRows}
	photoRepo := &fakePhotoRepository{itemPhotos: []model.Photo{{ID: uuid.New(), ObjectKey: "items/missing.jpg"}}}
	storage := &fakePresignStorage{}
	svc := NewItemService(repo, NewPhotoService(photoRepo, storage))

	err := svc.Delete(context.Background(), itemID)

	require.ErrorIs(t, err, pgx.ErrNoRows)
	require.Equal(t, itemID, repo.deleteID)
	require.Empty(t, storage.deletedKeys)
}

func TestContainerServiceListReturnsContainersWhenPhotoServiceIsNil(t *testing.T) {
	containerID := uuid.New()
	repo := &fakeContainerRepository{containers: []model.Container{{ID: containerID, Name: "Box 07"}}}
	svc := NewContainerService(repo, nil)

	containers, err := svc.List(context.Background())

	require.NoError(t, err)
	require.Equal(t, []model.Container{{ID: containerID, Name: "Box 07"}}, containers)
}

func TestContainerServiceGetAttachesPhotos(t *testing.T) {
	containerID := uuid.New()
	repo := &fakeContainerRepository{container: model.Container{ID: containerID, Name: "Box 07"}}
	photoRepo := &fakePhotoRepository{containerPhotos: []model.Photo{{ID: uuid.New(), ObjectKey: "containers/box.jpg"}}}
	storage := &fakePresignStorage{getURLs: map[string]string{"containers/box.jpg": "https://storage/box"}}
	svc := NewContainerService(repo, NewPhotoService(photoRepo, storage))

	container, err := svc.Get(context.Background(), containerID)

	require.NoError(t, err)
	require.Equal(t, containerID, repo.getID)
	require.Equal(t, containerID, photoRepo.listContainerID)
	require.Equal(t, "https://storage/box", container.Photos[0].URL)
}

func TestContainerServiceCreateNormalizesDocumentFields(t *testing.T) {
	value := 500.0
	currency := " rub "
	repo := &fakeContainerRepository{}
	svc := NewContainerService(repo, nil)

	container, err := svc.Create(context.Background(), model.CreateContainerRequest{
		Name:           "Box",
		PackageCode:    " BX-001 ",
		EstimatedValue: &value,
		ValueCurrency:  &currency,
	})

	require.NoError(t, err)
	require.Equal(t, "BX-001", repo.created.PackageCode)
	require.Equal(t, "RUB", *repo.created.ValueCurrency)
	require.Equal(t, "ru", repo.created.SourceLanguage)
	require.Equal(t, container.ID, repo.created.ID)
}

func TestContainerServiceRejectsInvalidDocumentFields(t *testing.T) {
	negative := -1.0
	zero := 0.0
	usd := "USD"
	tests := []struct {
		name string
		req  model.CreateContainerRequest
	}{
		{name: "negative weight", req: model.CreateContainerRequest{Name: "Box", GrossWeightKg: &negative}},
		{name: "zero weight", req: model.CreateContainerRequest{Name: "Box", GrossWeightKg: &zero}},
		{name: "negative volume", req: model.CreateContainerRequest{Name: "Box", VolumeM3: &negative}},
		{name: "negative value", req: model.CreateContainerRequest{Name: "Box", EstimatedValue: &negative, ValueCurrency: &usd}},
		{name: "value without currency", req: model.CreateContainerRequest{Name: "Box", EstimatedValue: float64Ptr(10)}},
		{name: "currency without value", req: model.CreateContainerRequest{Name: "Box", ValueCurrency: &usd}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := NewContainerService(&fakeContainerRepository{}, nil)
			_, err := svc.Create(context.Background(), tt.req)
			require.Error(t, err)
			require.True(t, IsValidationError(err))
		})
	}
}

func TestContainerServiceUpdatePreservesOmittedFieldsAndClearsNullableFields(t *testing.T) {
	weight := 12.345
	volume := 0.1234
	value := 2500.0
	currency := "RUB"
	repo := &fakeContainerRepository{container: model.Container{
		ID:             uuid.New(),
		Name:           "Box",
		PackageCode:    "BX-001",
		GrossWeightKg:  &weight,
		VolumeM3:       &volume,
		EstimatedValue: &value,
		ValueCurrency:  &currency,
		SourceLanguage: "ru",
	}}
	svc := NewContainerService(repo, nil)

	_, err := svc.Update(context.Background(), repo.container.ID, model.UpdateContainerRequest{Name: "Box updated"})
	require.NoError(t, err)
	require.Equal(t, "BX-001", repo.updated.PackageCode)
	require.Equal(t, &weight, repo.updated.GrossWeightKg)
	require.Equal(t, &volume, repo.updated.VolumeM3)

	_, err = svc.Update(context.Background(), repo.container.ID, model.UpdateContainerRequest{
		Name:           "Box updated",
		GrossWeightKg:  model.Optional[float64]{Set: true},
		VolumeM3:       model.Optional[float64]{Set: true},
		EstimatedValue: model.Optional[float64]{Set: true},
		ValueCurrency:  model.Optional[string]{Set: true},
	})
	require.NoError(t, err)
	require.Nil(t, repo.updated.GrossWeightKg)
	require.Nil(t, repo.updated.VolumeM3)
	require.Nil(t, repo.updated.EstimatedValue)
	require.Nil(t, repo.updated.ValueCurrency)
}

func TestContainerServiceDeleteRemovesKitAndPhotoObjects(t *testing.T) {
	containerID := uuid.New()
	repo := &fakeContainerRepository{}
	photoRepo := &fakePhotoRepository{containerPhotos: []model.Photo{
		{ID: uuid.New(), ObjectKey: "containers/box/front.jpg"},
		{ID: uuid.New(), ObjectKey: "containers/box/label.jpg"},
	}}
	storage := &fakePresignStorage{}
	svc := NewContainerService(repo, NewPhotoService(photoRepo, storage))

	err := svc.Delete(context.Background(), containerID)

	require.NoError(t, err)
	require.Equal(t, containerID, photoRepo.listContainerID)
	require.Equal(t, containerID, repo.deleteID)
	require.Equal(t, []string{"containers/box/front.jpg", "containers/box/label.jpg"}, storage.deletedKeys)
}

type fakeItemRepository struct {
	created          model.Item
	createdLabelCode string
	createErr        error

	items []model.Item

	pageItems  []model.Item
	total      int
	pageLimit  int
	pageOffset int
	listErr    error

	item    model.Item
	getID   uuid.UUID
	getErr  error
	updated model.Item

	deleteID  uuid.UUID
	deleteErr error
}

func (r *fakeItemRepository) Create(_ context.Context, item model.Item, labelCode string) error {
	r.created = item
	r.createdLabelCode = labelCode
	if r.item.ID == uuid.Nil {
		r.item = item
	}
	return r.createErr
}

func (r *fakeItemRepository) List(context.Context) ([]model.Item, error) {
	return append([]model.Item(nil), r.items...), r.listErr
}

func (r *fakeItemRepository) ListPage(_ context.Context, limit int, offset int) ([]model.Item, int, error) {
	r.pageLimit = limit
	r.pageOffset = offset
	return append([]model.Item(nil), r.pageItems...), r.total, r.listErr
}

func (r *fakeItemRepository) Get(_ context.Context, id uuid.UUID) (model.Item, error) {
	r.getID = id
	if r.getErr != nil {
		return model.Item{}, r.getErr
	}
	return r.item, nil
}

func (r *fakeItemRepository) Update(_ context.Context, _ uuid.UUID, item model.Item) error {
	r.updated = item
	r.item = item
	return nil
}

func (r *fakeItemRepository) Delete(_ context.Context, id uuid.UUID) error {
	r.deleteID = id
	return r.deleteErr
}

func (r *fakeItemRepository) GetByLabelCode(context.Context, string) (model.Item, error) {
	return model.Item{}, pgx.ErrNoRows
}

func (r *fakeItemRepository) AttachLabel(context.Context, uuid.UUID, uuid.UUID) error { return nil }
func (r *fakeItemRepository) DetachLabel(context.Context, uuid.UUID, uuid.UUID) error { return nil }

func (r *fakeItemRepository) GetLabelByCode(context.Context, string) (*model.ScanLabel, error) {
	return nil, nil
}

type fakeContainerRepository struct {
	containers []model.Container
	container  model.Container
	created    model.Container
	updated    model.Container
	getID      uuid.UUID
	deleteID   uuid.UUID
	deleteErr  error
}

func (r *fakeContainerRepository) Create(_ context.Context, container model.Container, _ string) error {
	r.created = container
	if r.container.ID == uuid.Nil {
		r.container = container
	}
	return nil
}

func (r *fakeContainerRepository) List(context.Context) ([]model.Container, error) {
	return append([]model.Container(nil), r.containers...), nil
}

func (r *fakeContainerRepository) Get(_ context.Context, id uuid.UUID) (model.Container, error) {
	r.getID = id
	return r.container, nil
}

func (r *fakeContainerRepository) Update(_ context.Context, _ uuid.UUID, container model.Container) error {
	r.updated = container
	r.container = container
	return nil
}

func (r *fakeContainerRepository) Delete(_ context.Context, id uuid.UUID) error {
	r.deleteID = id
	return r.deleteErr
}

func (r *fakeContainerRepository) AddItem(context.Context, uuid.UUID, uuid.UUID) error {
	return nil
}

func (r *fakeContainerRepository) RemoveItem(context.Context, uuid.UUID, uuid.UUID) error {
	return nil
}

func (r *fakeContainerRepository) AttachLabel(context.Context, uuid.UUID, uuid.UUID) error {
	return nil
}
func (r *fakeContainerRepository) DetachLabel(context.Context, uuid.UUID, uuid.UUID) error {
	return nil
}

func (r *fakeContainerRepository) GetByLabelCode(context.Context, string) (model.Container, error) {
	return model.Container{}, pgx.ErrNoRows
}

func (r *fakeContainerRepository) GetLabelByContainerID(context.Context, uuid.UUID) (*model.ScanLabel, error) {
	return nil, nil
}

func (r *fakeContainerRepository) GetLabelByCode(context.Context, string) (*model.ScanLabel, error) {
	return nil, nil
}

func float64Ptr(value float64) *float64 {
	return &value
}

func stringPtr(value string) *string {
	return &value
}
