package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Brain4Fish/storagetron/internal/service"
	"github.com/Brain4Fish/storagetron/pkg/model"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

func TestItemHandlerCreateRejectsMissingName(t *testing.T) {
	handler := NewItemHandler(newInventoryItemService(&inventoryItemRepo{}), zap.NewNop())

	rec := httptest.NewRecorder()
	handler.Create(rec, httptest.NewRequest(http.MethodPost, "/items", bytes.NewBufferString(`{"description":"missing name"}`)))

	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "name is required")
}

func TestItemHandlerListRejectsInvalidPagination(t *testing.T) {
	handler := NewItemHandler(newInventoryItemService(&inventoryItemRepo{}), zap.NewNop())

	rec := httptest.NewRecorder()
	handler.List(rec, httptest.NewRequest(http.MethodGet, "/items?limit=101", nil))
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "limit must be between 1 and 100")

	rec = httptest.NewRecorder()
	handler.List(rec, httptest.NewRequest(http.MethodGet, "/items?offset=-1", nil))
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "offset must be 0 or greater")
}

func TestItemHandlerListPageReturnsPaginatedResponse(t *testing.T) {
	itemID := uuid.New()
	repo := &inventoryItemRepo{
		pageItems: []model.Item{{ID: itemID, Name: "Camera"}},
		total:     9,
	}
	handler := NewItemHandler(newInventoryItemService(repo), zap.NewNop())

	rec := httptest.NewRecorder()
	handler.List(rec, httptest.NewRequest(http.MethodGet, "/items?limit=2&offset=4", nil))

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, 2, repo.pageLimit)
	require.Equal(t, 4, repo.pageOffset)

	var response model.ItemListResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
	require.Equal(t, 9, response.Total)
	require.Equal(t, 2, response.Limit)
	require.Equal(t, 4, response.Offset)
	require.Equal(t, "Camera", response.Items[0].Name)
}

func TestItemHandlerGetMapsNotFound(t *testing.T) {
	handler := NewItemHandler(newInventoryItemService(&inventoryItemRepo{getErr: pgx.ErrNoRows}), zap.NewNop())

	rec := httptest.NewRecorder()
	handler.Get(rec, inventoryRequestWithParams(http.MethodGet, "/items/"+uuid.NewString(), "", map[string]string{"id": uuid.NewString()}))

	require.Equal(t, http.StatusNotFound, rec.Code)
	require.Contains(t, rec.Body.String(), "item not found")
}

func TestItemHandlerDeleteReturnsNoContent(t *testing.T) {
	itemID := uuid.New()
	repo := &inventoryItemRepo{}
	handler := NewItemHandler(newInventoryItemService(repo), zap.NewNop())

	rec := httptest.NewRecorder()
	handler.Delete(rec, inventoryRequestWithParams(http.MethodDelete, "/items/"+itemID.String(), "", map[string]string{"id": itemID.String()}))

	require.Equal(t, http.StatusNoContent, rec.Code)
	require.Equal(t, itemID, repo.deletedID)
}

func TestContainerHandlerAddItemMapsAlreadyAssignedToConflict(t *testing.T) {
	containerID := uuid.New()
	itemID := uuid.New()
	repo := &inventoryContainerRepo{addErr: pgx.ErrNoRows}
	handler := NewContainerHandler(service.NewContainerService(repo, nil), zap.NewNop())

	rec := httptest.NewRecorder()
	handler.AddItem(rec, inventoryRequestWithParams(
		http.MethodPost,
		"/containers/"+containerID.String()+"/items",
		`{"item_id":"`+itemID.String()+`"}`,
		map[string]string{"id": containerID.String()},
	))

	require.Equal(t, http.StatusConflict, rec.Code)
	require.Contains(t, rec.Body.String(), "item is already assigned to a kit")
	require.Equal(t, containerID, repo.addContainerID)
	require.Equal(t, itemID, repo.addItemID)
}

func TestContainerHandlerRemoveItemMapsMissingRelationToNotFound(t *testing.T) {
	containerID := uuid.New()
	itemID := uuid.New()
	repo := &inventoryContainerRepo{removeErr: pgx.ErrNoRows}
	handler := NewContainerHandler(service.NewContainerService(repo, nil), zap.NewNop())

	rec := httptest.NewRecorder()
	handler.RemoveItem(rec, inventoryRequestWithParams(
		http.MethodDelete,
		"/containers/"+containerID.String()+"/items/"+itemID.String(),
		"",
		map[string]string{"id": containerID.String(), "item_id": itemID.String()},
	))

	require.Equal(t, http.StatusNotFound, rec.Code)
	require.Contains(t, rec.Body.String(), "relation not found")
}

func TestContainerHandlerDeleteReturnsNoContent(t *testing.T) {
	containerID := uuid.New()
	repo := &inventoryContainerRepo{}
	handler := NewContainerHandler(service.NewContainerService(repo, nil), zap.NewNop())

	rec := httptest.NewRecorder()
	handler.Delete(rec, inventoryRequestWithParams(http.MethodDelete, "/containers/"+containerID.String(), "", map[string]string{"id": containerID.String()}))

	require.Equal(t, http.StatusNoContent, rec.Code)
	require.Equal(t, containerID, repo.deletedID)
}

func TestContainerHandlerDeleteRejectsInvalidID(t *testing.T) {
	handler := NewContainerHandler(service.NewContainerService(&inventoryContainerRepo{}, nil), zap.NewNop())

	rec := httptest.NewRecorder()
	handler.Delete(rec, inventoryRequestWithParams(http.MethodDelete, "/containers/not-a-uuid", "", map[string]string{"id": "not-a-uuid"}))

	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "invalid container id")
}

func TestContainerHandlerDeleteMapsNotFound(t *testing.T) {
	containerID := uuid.New()
	handler := NewContainerHandler(service.NewContainerService(&inventoryContainerRepo{deleteErr: pgx.ErrNoRows}, nil), zap.NewNop())

	rec := httptest.NewRecorder()
	handler.Delete(rec, inventoryRequestWithParams(http.MethodDelete, "/containers/"+containerID.String(), "", map[string]string{"id": containerID.String()}))

	require.Equal(t, http.StatusNotFound, rec.Code)
	require.Contains(t, rec.Body.String(), "container not found")
}

func TestLocationHandlerCreateRejectsEmptyLocation(t *testing.T) {
	handler := NewLocationHandler(service.NewLocationService(&inventoryLocationRepo{}), zap.NewNop())

	rec := httptest.NewRecorder()
	handler.Create(rec, httptest.NewRequest(http.MethodPost, "/locations", bytes.NewBufferString(`{}`)))

	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "at least one location field is required")
}

func TestLocationHandlerUpdateMapsNotFound(t *testing.T) {
	locationID := uuid.New()
	handler := NewLocationHandler(service.NewLocationService(&inventoryLocationRepo{updateErr: pgx.ErrNoRows}), zap.NewNop())

	rec := httptest.NewRecorder()
	handler.Update(rec, inventoryRequestWithParams(
		http.MethodPatch,
		"/locations/"+locationID.String(),
		`{"room":"Storage"}`,
		map[string]string{"id": locationID.String()},
	))

	require.Equal(t, http.StatusNotFound, rec.Code)
	require.Contains(t, rec.Body.String(), "location not found")
}

func TestLocationHandlerDeleteReturnsNoContent(t *testing.T) {
	locationID := uuid.New()
	repo := &inventoryLocationRepo{}
	handler := NewLocationHandler(service.NewLocationService(repo), zap.NewNop())

	rec := httptest.NewRecorder()
	handler.Delete(rec, inventoryRequestWithParams(http.MethodDelete, "/locations/"+locationID.String(), "", map[string]string{"id": locationID.String()}))

	require.Equal(t, http.StatusNoContent, rec.Code)
	require.Equal(t, locationID, repo.deletedID)
}

func TestPhotoHandlerUploadRejectsMissingFileName(t *testing.T) {
	handler := NewPhotoHandler(newInventoryPhotoService(&inventoryPhotoRepo{}, &inventoryStorage{}), zap.NewNop())

	rec := httptest.NewRecorder()
	handler.Upload(rec, inventoryRequestWithParams(http.MethodPost, "/items/"+uuid.NewString()+"/photos", `{}`, map[string]string{"id": uuid.NewString()}))

	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "file_name is required")
}

func TestPhotoHandlerUploadMapsMissingItemToNotFound(t *testing.T) {
	itemID := uuid.New()
	handler := NewPhotoHandler(newInventoryPhotoService(&inventoryPhotoRepo{itemExistsErr: pgx.ErrNoRows}, &inventoryStorage{}), zap.NewNop())

	rec := httptest.NewRecorder()
	handler.Upload(rec, inventoryRequestWithParams(
		http.MethodPost,
		"/items/"+itemID.String()+"/photos",
		`{"file_name":"photo.jpg","content_type":"image/jpeg"}`,
		map[string]string{"id": itemID.String()},
	))

	require.Equal(t, http.StatusNotFound, rec.Code)
	require.Contains(t, rec.Body.String(), "item not found")
}

func TestPhotoHandlerDeleteItemPhotoReturnsNoContent(t *testing.T) {
	itemID := uuid.New()
	photoID := uuid.New()
	repo := &inventoryPhotoRepo{deletedItemPhoto: model.Photo{ObjectKey: "items/photo.jpg"}}
	storage := &inventoryStorage{}
	handler := NewPhotoHandler(newInventoryPhotoService(repo, storage), zap.NewNop())

	rec := httptest.NewRecorder()
	handler.DeleteItemPhoto(rec, inventoryRequestWithParams(
		http.MethodDelete,
		"/items/"+itemID.String()+"/photos/"+photoID.String(),
		"",
		map[string]string{"id": itemID.String(), "photo_id": photoID.String()},
	))

	require.Equal(t, http.StatusNoContent, rec.Code)
	require.Equal(t, itemID, repo.deleteItemID)
	require.Equal(t, photoID, repo.deletePhotoID)
	require.Equal(t, []string{"items/photo.jpg"}, storage.deletedKeys)
}

func TestPhotoHandlerDeleteItemPhotoMapsNotFound(t *testing.T) {
	handler := NewPhotoHandler(newInventoryPhotoService(&inventoryPhotoRepo{deleteItemErr: pgx.ErrNoRows}, &inventoryStorage{}), zap.NewNop())

	rec := httptest.NewRecorder()
	handler.DeleteItemPhoto(rec, inventoryRequestWithParams(
		http.MethodDelete,
		"/items/"+uuid.NewString()+"/photos/"+uuid.NewString(),
		"",
		map[string]string{"id": uuid.NewString(), "photo_id": uuid.NewString()},
	))

	require.Equal(t, http.StatusNotFound, rec.Code)
	require.Contains(t, rec.Body.String(), "photo not found")
}

func inventoryRequestWithParams(method, path string, body string, params map[string]string) *http.Request {
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	routeContext := chi.NewRouteContext()
	for key, value := range params {
		routeContext.URLParams.Add(key, value)
	}
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, routeContext))
}

func newInventoryItemService(repo *inventoryItemRepo) *service.ItemService {
	return service.NewItemService(repo, newInventoryPhotoService(&inventoryPhotoRepo{}, &inventoryStorage{}))
}

func newInventoryPhotoService(repo *inventoryPhotoRepo, storage *inventoryStorage) *service.PhotoService {
	return service.NewPhotoService(repo, storage)
}

type inventoryItemRepo struct {
	pageItems  []model.Item
	total      int
	pageLimit  int
	pageOffset int

	item   model.Item
	getErr error

	deletedID uuid.UUID
	deleteErr error
}

func (r *inventoryItemRepo) Create(context.Context, model.Item, string) error {
	return nil
}

func (r *inventoryItemRepo) List(context.Context) ([]model.Item, error) {
	return nil, nil
}

func (r *inventoryItemRepo) ListPage(_ context.Context, limit int, offset int) ([]model.Item, int, error) {
	r.pageLimit = limit
	r.pageOffset = offset
	return append([]model.Item(nil), r.pageItems...), r.total, nil
}

func (r *inventoryItemRepo) Get(context.Context, uuid.UUID) (model.Item, error) {
	if r.getErr != nil {
		return model.Item{}, r.getErr
	}
	return r.item, nil
}

func (r *inventoryItemRepo) Update(context.Context, uuid.UUID, model.UpdateItemRequest) error {
	return nil
}

func (r *inventoryItemRepo) Delete(_ context.Context, id uuid.UUID) error {
	r.deletedID = id
	return r.deleteErr
}

func (r *inventoryItemRepo) GetByLabelCode(context.Context, string) (model.Item, error) {
	return model.Item{}, pgx.ErrNoRows
}

func (r *inventoryItemRepo) GetLabelByCode(context.Context, string) (*model.Label, error) {
	return nil, nil
}

type inventoryContainerRepo struct {
	addContainerID uuid.UUID
	addItemID      uuid.UUID
	addErr         error

	deletedID uuid.UUID
	deleteErr error

	removeErr error
}

func (r *inventoryContainerRepo) Create(context.Context, model.Container, string) error {
	return nil
}

func (r *inventoryContainerRepo) List(context.Context) ([]model.Container, error) {
	return nil, nil
}

func (r *inventoryContainerRepo) Get(context.Context, uuid.UUID) (model.Container, error) {
	return model.Container{}, nil
}

func (r *inventoryContainerRepo) Update(context.Context, uuid.UUID, model.UpdateContainerRequest) error {
	return nil
}

func (r *inventoryContainerRepo) Delete(_ context.Context, id uuid.UUID) error {
	r.deletedID = id
	return r.deleteErr
}

func (r *inventoryContainerRepo) AddItem(_ context.Context, containerID, itemID uuid.UUID) error {
	r.addContainerID = containerID
	r.addItemID = itemID
	return r.addErr
}

func (r *inventoryContainerRepo) RemoveItem(context.Context, uuid.UUID, uuid.UUID) error {
	return r.removeErr
}

func (r *inventoryContainerRepo) GetByLabelCode(context.Context, string) (model.Container, error) {
	return model.Container{}, pgx.ErrNoRows
}

func (r *inventoryContainerRepo) GetLabelByContainerID(context.Context, uuid.UUID) (*model.Label, error) {
	return nil, nil
}

func (r *inventoryContainerRepo) GetLabelByCode(context.Context, string) (*model.Label, error) {
	return nil, nil
}

type inventoryLocationRepo struct {
	location  model.Location
	updateErr error
	deletedID uuid.UUID
	deleteErr error
}

func (r *inventoryLocationRepo) Create(context.Context, model.Location) error {
	return nil
}

func (r *inventoryLocationRepo) List(context.Context) ([]model.Location, error) {
	return nil, nil
}

func (r *inventoryLocationRepo) Get(context.Context, uuid.UUID) (model.Location, error) {
	return r.location, nil
}

func (r *inventoryLocationRepo) Update(context.Context, uuid.UUID, model.UpdateLocationRequest) error {
	return r.updateErr
}

func (r *inventoryLocationRepo) Delete(_ context.Context, id uuid.UUID) error {
	r.deletedID = id
	return r.deleteErr
}

type inventoryPhotoRepo struct {
	itemExistsErr      error
	containerExistsErr error
	createErr          error

	deletedItemPhoto      model.Photo
	deletedContainerPhoto model.Photo
	deleteItemID          uuid.UUID
	deleteContainerID     uuid.UUID
	deletePhotoID         uuid.UUID
	deleteItemErr         error
	deleteContainerErr    error
}

func (r *inventoryPhotoRepo) Create(context.Context, model.Photo) error {
	return r.createErr
}

func (r *inventoryPhotoRepo) ListByItemID(context.Context, uuid.UUID) ([]model.Photo, error) {
	return nil, nil
}

func (r *inventoryPhotoRepo) ListByContainerID(context.Context, uuid.UUID) ([]model.Photo, error) {
	return nil, nil
}

func (r *inventoryPhotoRepo) ItemExists(context.Context, uuid.UUID) error {
	return r.itemExistsErr
}

func (r *inventoryPhotoRepo) ContainerExists(context.Context, uuid.UUID) error {
	return r.containerExistsErr
}

func (r *inventoryPhotoRepo) DeleteByContainerID(_ context.Context, containerID, photoID uuid.UUID) (model.Photo, error) {
	r.deleteContainerID = containerID
	r.deletePhotoID = photoID
	return r.deletedContainerPhoto, r.deleteContainerErr
}

func (r *inventoryPhotoRepo) DeleteByItemID(_ context.Context, itemID, photoID uuid.UUID) (model.Photo, error) {
	r.deleteItemID = itemID
	r.deletePhotoID = photoID
	return r.deletedItemPhoto, r.deleteItemErr
}

func (r *inventoryPhotoRepo) GetLabelByItemID(context.Context, uuid.UUID) (*model.Label, error) {
	return nil, nil
}

type inventoryStorage struct {
	deletedKeys []string
}

func (s *inventoryStorage) PresignPut(context.Context, string, string) (string, error) {
	return "https://storage/upload", nil
}

func (s *inventoryStorage) PresignGet(context.Context, string) (string, error) {
	return "", nil
}

func (s *inventoryStorage) Delete(_ context.Context, key string) error {
	s.deletedKeys = append(s.deletedKeys, key)
	return nil
}
