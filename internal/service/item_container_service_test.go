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
	require.Equal(t, repo.created.ID, repo.getID)
	require.Equal(t, "Laptop", item.Name)
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

	item   model.Item
	getID  uuid.UUID
	getErr error
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

func (r *fakeItemRepository) Update(context.Context, uuid.UUID, model.UpdateItemRequest) error {
	return nil
}

func (r *fakeItemRepository) Delete(context.Context, uuid.UUID) error {
	return nil
}

func (r *fakeItemRepository) GetByLabelCode(context.Context, string) (model.Item, error) {
	return model.Item{}, pgx.ErrNoRows
}

func (r *fakeItemRepository) GetLabelByCode(context.Context, string) (*model.Label, error) {
	return nil, nil
}

type fakeContainerRepository struct {
	containers []model.Container
	container  model.Container
	getID      uuid.UUID
}

func (r *fakeContainerRepository) Create(context.Context, model.Container, string) error {
	return nil
}

func (r *fakeContainerRepository) List(context.Context) ([]model.Container, error) {
	return append([]model.Container(nil), r.containers...), nil
}

func (r *fakeContainerRepository) Get(_ context.Context, id uuid.UUID) (model.Container, error) {
	r.getID = id
	return r.container, nil
}

func (r *fakeContainerRepository) Update(context.Context, uuid.UUID, model.UpdateContainerRequest) error {
	return nil
}

func (r *fakeContainerRepository) AddItem(context.Context, uuid.UUID, uuid.UUID) error {
	return nil
}

func (r *fakeContainerRepository) RemoveItem(context.Context, uuid.UUID, uuid.UUID) error {
	return nil
}

func (r *fakeContainerRepository) GetByLabelCode(context.Context, string) (model.Container, error) {
	return model.Container{}, pgx.ErrNoRows
}

func (r *fakeContainerRepository) GetLabelByContainerID(context.Context, uuid.UUID) (*model.Label, error) {
	return nil, nil
}

func (r *fakeContainerRepository) GetLabelByCode(context.Context, string) (*model.Label, error) {
	return nil, nil
}
