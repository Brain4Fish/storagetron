package handler

import (
	"context"
	"encoding/json"
	"errors"
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

func TestScanReturnsItemForLabelCode(t *testing.T) {
	itemID := uuid.New()
	label := &model.ScanLabel{Code: "ITEM-001", ItemID: &itemID}
	handler := newTestScanHandler(
		&scanItemRepo{
			itemByCode: model.Item{ID: itemID, Name: "Laptop"},
			label:      label,
		},
		&scanContainerRepo{containerByCodeErr: errors.New("should not scan container after item match")},
	)

	rec := httptest.NewRecorder()
	handler.Scan(rec, scanRequest("ITEM-001"))

	require.Equal(t, http.StatusOK, rec.Code)
	var response model.ScanResult
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
	require.Equal(t, "item", response.Type)
	require.Equal(t, "Laptop", response.Item.Name)
	require.Equal(t, label, response.Label)
}

func TestScanFallsBackToContainerLabelWhenItemCodeNotFound(t *testing.T) {
	containerID := uuid.New()
	label := &model.ScanLabel{Code: "BOX-007", ContainerID: &containerID}
	handler := newTestScanHandler(
		&scanItemRepo{itemByCodeErr: pgx.ErrNoRows},
		&scanContainerRepo{
			containerByCode: model.Container{ID: containerID, Name: "Box 07"},
			label:           label,
		},
	)

	rec := httptest.NewRecorder()
	handler.Scan(rec, scanRequest("BOX-007"))

	require.Equal(t, http.StatusOK, rec.Code)
	var response model.ScanResult
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
	require.Equal(t, "container", response.Type)
	require.Equal(t, "Box 07", response.Container.Name)
	require.Equal(t, label, response.Label)
}

func TestScanFallsBackToItemUUID(t *testing.T) {
	itemID := uuid.New()
	handler := newTestScanHandler(
		&scanItemRepo{
			itemByCodeErr: pgx.ErrNoRows,
			item:          model.Item{ID: itemID, Name: "UUID item"},
		},
		&scanContainerRepo{containerByCodeErr: pgx.ErrNoRows, containerErr: pgx.ErrNoRows},
	)

	rec := httptest.NewRecorder()
	handler.Scan(rec, scanRequest(itemID.String()))

	require.Equal(t, http.StatusOK, rec.Code)
	var response model.ScanResult
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
	require.Equal(t, "item", response.Type)
	require.Equal(t, "UUID item", response.Item.Name)
}

func TestScanReturnsNotFoundWhenCodeAndUUIDLookupsMiss(t *testing.T) {
	handler := newTestScanHandler(
		&scanItemRepo{itemByCodeErr: pgx.ErrNoRows, itemErr: pgx.ErrNoRows},
		&scanContainerRepo{containerByCodeErr: pgx.ErrNoRows, containerErr: pgx.ErrNoRows},
	)

	rec := httptest.NewRecorder()
	handler.Scan(rec, scanRequest(uuid.NewString()))

	require.Equal(t, http.StatusNotFound, rec.Code)
	require.Contains(t, rec.Body.String(), "code not found")
}

func TestScanReturnsInternalServerErrorForLookupFailure(t *testing.T) {
	handler := newTestScanHandler(
		&scanItemRepo{itemByCodeErr: errors.New("database down")},
		&scanContainerRepo{},
	)

	rec := httptest.NewRecorder()
	handler.Scan(rec, scanRequest("ITEM-001"))

	require.Equal(t, http.StatusInternalServerError, rec.Code)
	require.Contains(t, rec.Body.String(), "failed to scan code")
}

func newTestScanHandler(itemRepo *scanItemRepo, containerRepo *scanContainerRepo) *ScanHandler {
	photoSvc := service.NewPhotoService(&scanPhotoRepo{}, &scanStorage{})
	return NewScanHandler(
		service.NewItemService(itemRepo, photoSvc),
		service.NewContainerService(containerRepo, photoSvc),
		zap.NewNop(),
	)
}

func scanRequest(code string) *http.Request {
	req := httptest.NewRequest(http.MethodGet, "/scan/"+code, nil)
	routeContext := chi.NewRouteContext()
	routeContext.URLParams.Add("code", code)
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, routeContext))
}

type scanItemRepo struct {
	itemByCode    model.Item
	itemByCodeErr error
	label         *model.ScanLabel
	labelErr      error
	item          model.Item
	itemErr       error
}

func (r *scanItemRepo) Create(context.Context, model.Item, string) error {
	return nil
}

func (r *scanItemRepo) List(context.Context) ([]model.Item, error) {
	return nil, nil
}

func (r *scanItemRepo) ListPage(context.Context, int, int) ([]model.Item, int, error) {
	return nil, 0, nil
}

func (r *scanItemRepo) Get(context.Context, uuid.UUID) (model.Item, error) {
	return r.item, r.itemErr
}

func (r *scanItemRepo) Update(context.Context, uuid.UUID, model.UpdateItemRequest) error {
	return nil
}

func (r *scanItemRepo) Delete(context.Context, uuid.UUID) error {
	return nil
}

func (r *scanItemRepo) GetByLabelCode(context.Context, string) (model.Item, error) {
	return r.itemByCode, r.itemByCodeErr
}

func (r *scanItemRepo) AttachLabel(context.Context, uuid.UUID, uuid.UUID) error { return nil }
func (r *scanItemRepo) DetachLabel(context.Context, uuid.UUID, uuid.UUID) error { return nil }

func (r *scanItemRepo) GetLabelByCode(context.Context, string) (*model.ScanLabel, error) {
	return r.label, r.labelErr
}

type scanContainerRepo struct {
	containerByCode    model.Container
	containerByCodeErr error
	label              *model.ScanLabel
	labelErr           error
	container          model.Container
	containerErr       error
}

func (r *scanContainerRepo) Create(context.Context, model.Container, string) error {
	return nil
}

func (r *scanContainerRepo) List(context.Context) ([]model.Container, error) {
	return nil, nil
}

func (r *scanContainerRepo) Get(context.Context, uuid.UUID) (model.Container, error) {
	return r.container, r.containerErr
}

func (r *scanContainerRepo) Update(context.Context, uuid.UUID, model.UpdateContainerRequest) error {
	return nil
}

func (r *scanContainerRepo) Delete(context.Context, uuid.UUID) error {
	return nil
}

func (r *scanContainerRepo) AddItem(context.Context, uuid.UUID, uuid.UUID) error {
	return nil
}

func (r *scanContainerRepo) RemoveItem(context.Context, uuid.UUID, uuid.UUID) error {
	return nil
}

func (r *scanContainerRepo) AttachLabel(context.Context, uuid.UUID, uuid.UUID) error { return nil }
func (r *scanContainerRepo) DetachLabel(context.Context, uuid.UUID, uuid.UUID) error { return nil }

func (r *scanContainerRepo) GetByLabelCode(context.Context, string) (model.Container, error) {
	return r.containerByCode, r.containerByCodeErr
}

func (r *scanContainerRepo) GetLabelByContainerID(context.Context, uuid.UUID) (*model.ScanLabel, error) {
	return nil, nil
}

func (r *scanContainerRepo) GetLabelByCode(context.Context, string) (*model.ScanLabel, error) {
	return r.label, r.labelErr
}

type scanPhotoRepo struct{}

func (r *scanPhotoRepo) Create(context.Context, model.Photo) error {
	return nil
}

func (r *scanPhotoRepo) ListByItemID(context.Context, uuid.UUID) ([]model.Photo, error) {
	return nil, nil
}

func (r *scanPhotoRepo) ListByContainerID(context.Context, uuid.UUID) ([]model.Photo, error) {
	return nil, nil
}

func (r *scanPhotoRepo) ItemExists(context.Context, uuid.UUID) error {
	return nil
}

func (r *scanPhotoRepo) ContainerExists(context.Context, uuid.UUID) error {
	return nil
}

func (r *scanPhotoRepo) DeleteByContainerID(context.Context, uuid.UUID, uuid.UUID) (model.Photo, error) {
	return model.Photo{}, nil
}

func (r *scanPhotoRepo) DeleteByItemID(context.Context, uuid.UUID, uuid.UUID) (model.Photo, error) {
	return model.Photo{}, nil
}

func (r *scanPhotoRepo) GetLabelByItemID(context.Context, uuid.UUID) (*model.ScanLabel, error) {
	return nil, nil
}

type scanStorage struct{}

func (s *scanStorage) PresignPut(context.Context, string, string) (string, error) {
	return "", nil
}

func (s *scanStorage) PresignGet(context.Context, string) (string, error) {
	return "", nil
}

func (s *scanStorage) Delete(context.Context, string) error {
	return nil
}
