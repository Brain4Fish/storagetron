package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/Brain4Fish/storagetron/pkg/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func TestPhotoServiceCreateUploadBuildsItemObjectKeyAndPersistsPhoto(t *testing.T) {
	itemID := uuid.New()
	repo := &fakePhotoRepository{}
	storage := &fakePresignStorage{putURL: "https://storage/upload"}
	svc := NewPhotoService(repo, storage)

	resp, err := svc.CreateUpload(context.Background(), itemID, model.CreatePhotoRequest{
		FileName:    "Receipt.JPG",
		ContentType: "image/jpeg",
	})

	require.NoError(t, err)
	require.Equal(t, "https://storage/upload", resp.UploadURL)
	require.Equal(t, resp.PhotoID, repo.created.ID)
	require.Equal(t, &itemID, repo.created.ItemID)
	require.Equal(t, "image/jpeg", repo.created.ContentType)
	require.Equal(t, resp.ObjectKey, repo.created.ObjectKey)
	require.Equal(t, resp.ObjectKey, storage.putKey)
	require.Equal(t, "image/jpeg", storage.putContentType)
	require.True(t, strings.HasPrefix(resp.ObjectKey, "items/"+itemID.String()+"/photos/"))
	require.True(t, strings.HasSuffix(resp.ObjectKey, ".jpg"))
}

func TestPhotoServiceCreateUploadDefaultsMissingExtensionToBin(t *testing.T) {
	itemID := uuid.New()
	svc := NewPhotoService(&fakePhotoRepository{}, &fakePresignStorage{putURL: "https://storage/upload"})

	resp, err := svc.CreateUpload(context.Background(), itemID, model.CreatePhotoRequest{FileName: "photo"})

	require.NoError(t, err)
	require.True(t, strings.HasSuffix(resp.ObjectKey, ".bin"))
}

func TestPhotoServiceCreateUploadDoesNotPersistWhenPresignFails(t *testing.T) {
	repo := &fakePhotoRepository{}
	storage := &fakePresignStorage{putErr: errors.New("s3 unavailable")}
	svc := NewPhotoService(repo, storage)

	_, err := svc.CreateUpload(context.Background(), uuid.New(), model.CreatePhotoRequest{FileName: "photo.jpg"})

	require.ErrorContains(t, err, "s3 unavailable")
	require.False(t, repo.createCalled)
}

func TestPhotoServiceListByItemIDAddsPresignedURLs(t *testing.T) {
	itemID := uuid.New()
	repo := &fakePhotoRepository{
		itemPhotos: []model.Photo{
			{ID: uuid.New(), ObjectKey: "items/one.jpg"},
			{ID: uuid.New(), ObjectKey: "items/two.jpg"},
		},
	}
	storage := &fakePresignStorage{getURLs: map[string]string{
		"items/one.jpg": "https://storage/one",
		"items/two.jpg": "https://storage/two",
	}}
	svc := NewPhotoService(repo, storage)

	photos, err := svc.ListByItemID(context.Background(), itemID)

	require.NoError(t, err)
	require.Equal(t, itemID, repo.listItemID)
	require.Equal(t, "https://storage/one", photos[0].URL)
	require.Equal(t, "https://storage/two", photos[1].URL)
}

func TestPhotoServiceDeleteItemPhotoDeletesObjectReturnedByRepository(t *testing.T) {
	itemID := uuid.New()
	photoID := uuid.New()
	repo := &fakePhotoRepository{deletedItemPhoto: model.Photo{ObjectKey: "items/photo.jpg"}}
	storage := &fakePresignStorage{}
	svc := NewPhotoService(repo, storage)

	err := svc.DeleteItemPhoto(context.Background(), itemID, photoID)

	require.NoError(t, err)
	require.Equal(t, itemID, repo.deleteItemID)
	require.Equal(t, photoID, repo.deletePhotoID)
	require.Equal(t, []string{"items/photo.jpg"}, storage.deletedKeys)
}

func TestPhotoServiceDeleteItemPhotoDoesNotDeleteStorageWhenRepositoryFails(t *testing.T) {
	repo := &fakePhotoRepository{deleteItemErr: pgx.ErrNoRows}
	storage := &fakePresignStorage{}
	svc := NewPhotoService(repo, storage)

	err := svc.DeleteItemPhoto(context.Background(), uuid.New(), uuid.New())

	require.ErrorIs(t, err, pgx.ErrNoRows)
	require.Empty(t, storage.deletedKeys)
}

type fakePhotoRepository struct {
	createCalled bool
	created      model.Photo
	createErr    error

	itemExistsErr      error
	containerExistsErr error

	itemPhotos      []model.Photo
	containerPhotos []model.Photo
	listItemID      uuid.UUID
	listContainerID uuid.UUID
	listErr         error

	deletedItemPhoto      model.Photo
	deletedContainerPhoto model.Photo
	deleteItemID          uuid.UUID
	deleteContainerID     uuid.UUID
	deletePhotoID         uuid.UUID
	deleteItemErr         error
	deleteContainerErr    error
}

func (r *fakePhotoRepository) Create(_ context.Context, photo model.Photo) error {
	r.createCalled = true
	r.created = photo
	return r.createErr
}

func (r *fakePhotoRepository) ListByItemID(_ context.Context, id uuid.UUID) ([]model.Photo, error) {
	r.listItemID = id
	return append([]model.Photo(nil), r.itemPhotos...), r.listErr
}

func (r *fakePhotoRepository) ListByContainerID(_ context.Context, id uuid.UUID) ([]model.Photo, error) {
	r.listContainerID = id
	return append([]model.Photo(nil), r.containerPhotos...), r.listErr
}

func (r *fakePhotoRepository) ItemExists(context.Context, uuid.UUID) error {
	return r.itemExistsErr
}

func (r *fakePhotoRepository) ContainerExists(context.Context, uuid.UUID) error {
	return r.containerExistsErr
}

func (r *fakePhotoRepository) DeleteByContainerID(_ context.Context, containerID, photoID uuid.UUID) (model.Photo, error) {
	r.deleteContainerID = containerID
	r.deletePhotoID = photoID
	return r.deletedContainerPhoto, r.deleteContainerErr
}

func (r *fakePhotoRepository) DeleteByItemID(_ context.Context, itemID, photoID uuid.UUID) (model.Photo, error) {
	r.deleteItemID = itemID
	r.deletePhotoID = photoID
	return r.deletedItemPhoto, r.deleteItemErr
}

func (r *fakePhotoRepository) GetLabelByItemID(context.Context, uuid.UUID) (*model.ScanLabel, error) {
	return nil, nil
}

type fakePresignStorage struct {
	putURL         string
	putKey         string
	putContentType string
	putErr         error

	getURLs map[string]string
	getErr  error

	deletedKeys []string
	deleteErr   error
}

func (s *fakePresignStorage) PresignPut(_ context.Context, key string, contentType string) (string, error) {
	s.putKey = key
	s.putContentType = contentType
	return s.putURL, s.putErr
}

func (s *fakePresignStorage) PresignGet(_ context.Context, key string) (string, error) {
	if s.getErr != nil {
		return "", s.getErr
	}
	return s.getURLs[key], nil
}

func (s *fakePresignStorage) Delete(_ context.Context, key string) error {
	s.deletedKeys = append(s.deletedKeys, key)
	return s.deleteErr
}
