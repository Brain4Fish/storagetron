package service

import (
	"context"
	"fmt"
	"path"
	"strings"

	storageapi "github.com/Brain4Fish/storagetron/internal/storage"
	"github.com/Brain4Fish/storagetron/pkg/model"

	"github.com/google/uuid"
)

type PhotoRepository interface {
	Create(context.Context, model.Photo) error
	GetByID(context.Context, uuid.UUID) (model.Photo, error)
	ListByItemID(context.Context, uuid.UUID) ([]model.Photo, error)
	ListByContainerID(context.Context, uuid.UUID) ([]model.Photo, error)
	ItemExists(context.Context, uuid.UUID) error
	ContainerExists(context.Context, uuid.UUID) error
	DeleteByContainerID(context.Context, uuid.UUID, uuid.UUID) (model.Photo, error)
	DeleteByItemID(context.Context, uuid.UUID, uuid.UUID) (model.Photo, error)
	GetLabelByItemID(context.Context, uuid.UUID) (*model.ScanLabel, error)
}

type PhotoStorage interface {
	PresignPut(context.Context, string, string) (string, error)
	PresignGet(ctx context.Context, key string) (string, error)
	OpenObject(context.Context, string) (storageapi.ObjectContent, error)
	Delete(context.Context, string) error
}

type PhotoService struct {
	repo    PhotoRepository
	storage PhotoStorage
}

func NewPhotoService(repo PhotoRepository, storage PhotoStorage) *PhotoService {
	return &PhotoService{repo: repo, storage: storage}
}

func (s *PhotoService) CreateUpload(ctx context.Context, itemID uuid.UUID, req model.CreatePhotoRequest) (model.CreatePhotoResponse, error) {
	if err := s.repo.ItemExists(ctx, itemID); err != nil {
		return model.CreatePhotoResponse{}, err
	}

	photoID := uuid.New()
	objectKey := buildPhotoObjectKey(itemID, photoID, req.FileName)

	uploadURL, err := s.storage.PresignPut(ctx, objectKey, req.ContentType)
	if err != nil {
		return model.CreatePhotoResponse{}, err
	}

	photo := model.Photo{
		ID:          photoID,
		ItemID:      &itemID,
		ObjectKey:   objectKey,
		ContentType: req.ContentType,
	}
	if err := s.repo.Create(ctx, photo); err != nil {
		return model.CreatePhotoResponse{}, err
	}

	return model.CreatePhotoResponse{
		PhotoID:   photoID,
		ObjectKey: objectKey,
		UploadURL: uploadURL,
	}, nil
}

func (s *PhotoService) CreateContainerUpload(ctx context.Context, containerID uuid.UUID, req model.CreatePhotoRequest) (model.CreatePhotoResponse, error) {
	if err := s.repo.ContainerExists(ctx, containerID); err != nil {
		return model.CreatePhotoResponse{}, err
	}

	photoID := uuid.New()
	objectKey := buildContainerPhotoObjectKey(containerID, photoID, req.FileName)

	uploadURL, err := s.storage.PresignPut(ctx, objectKey, req.ContentType)
	if err != nil {
		return model.CreatePhotoResponse{}, err
	}

	photo := model.Photo{
		ID:          photoID,
		ContainerID: &containerID,
		ObjectKey:   objectKey,
		ContentType: req.ContentType,
	}
	if err := s.repo.Create(ctx, photo); err != nil {
		return model.CreatePhotoResponse{}, err
	}

	return model.CreatePhotoResponse{
		PhotoID:   photoID,
		ObjectKey: objectKey,
		UploadURL: uploadURL,
	}, nil
}

func (s *PhotoService) ListByItemID(ctx context.Context, itemID uuid.UUID) ([]model.Photo, error) {
	photos, err := s.repo.ListByItemID(ctx, itemID)
	if err != nil {
		return nil, err
	}

	for i := range photos {
		url, err := s.storage.PresignGet(ctx, photos[i].ObjectKey)
		if err != nil {
			return nil, err
		}
		photos[i].URL = url
		photos[i].ContentURL = photoContentURL(photos[i].ID)
	}

	return photos, nil
}

func (s *PhotoService) ListByContainerID(ctx context.Context, containerID uuid.UUID) ([]model.Photo, error) {
	photos, err := s.repo.ListByContainerID(ctx, containerID)
	if err != nil {
		return nil, err
	}

	for i := range photos {
		url, err := s.storage.PresignGet(ctx, photos[i].ObjectKey)
		if err != nil {
			return nil, err
		}
		photos[i].URL = url
		photos[i].ContentURL = photoContentURL(photos[i].ID)
	}

	return photos, nil
}

func (s *PhotoService) GetContent(ctx context.Context, photoID uuid.UUID) (storageapi.ObjectContent, error) {
	photo, err := s.repo.GetByID(ctx, photoID)
	if err != nil {
		return storageapi.ObjectContent{}, err
	}

	object, err := s.storage.OpenObject(ctx, photo.ObjectKey)
	if err != nil {
		return storageapi.ObjectContent{}, err
	}
	if object.ContentType == "" {
		object.ContentType = photo.ContentType
	}
	return object, nil
}

func (s *PhotoService) ListObjectKeysByItemID(ctx context.Context, itemID uuid.UUID) ([]string, error) {
	photos, err := s.repo.ListByItemID(ctx, itemID)
	if err != nil {
		return nil, err
	}

	keys := make([]string, 0, len(photos))
	for _, photo := range photos {
		keys = append(keys, photo.ObjectKey)
	}
	return keys, nil
}

func (s *PhotoService) ListObjectKeysByContainerID(ctx context.Context, containerID uuid.UUID) ([]string, error) {
	photos, err := s.repo.ListByContainerID(ctx, containerID)
	if err != nil {
		return nil, err
	}

	keys := make([]string, 0, len(photos))
	for _, photo := range photos {
		keys = append(keys, photo.ObjectKey)
	}
	return keys, nil
}

func (s *PhotoService) DeleteObjectKeys(ctx context.Context, keys []string) error {
	for _, key := range keys {
		if err := s.storage.Delete(ctx, key); err != nil {
			return err
		}
	}
	return nil
}

func (s *PhotoService) DeleteContainerPhoto(ctx context.Context, containerID, photoID uuid.UUID) error {
	photo, err := s.repo.DeleteByContainerID(ctx, containerID, photoID)
	if err != nil {
		return err
	}

	return s.storage.Delete(ctx, photo.ObjectKey)
}

func (s *PhotoService) DeleteItemPhoto(ctx context.Context, itemID, photoID uuid.UUID) error {
	photo, err := s.repo.DeleteByItemID(ctx, itemID, photoID)
	if err != nil {
		return err
	}

	return s.storage.Delete(ctx, photo.ObjectKey)
}

func buildPhotoObjectKey(itemID, photoID uuid.UUID, fileName string) string {
	ext := strings.ToLower(path.Ext(fileName))
	if ext == "" {
		ext = ".bin"
	}
	return fmt.Sprintf("items/%s/photos/%s%s", itemID.String(), photoID.String(), ext)
}

func buildContainerPhotoObjectKey(containerID, photoID uuid.UUID, fileName string) string {
	ext := strings.ToLower(path.Ext(fileName))
	if ext == "" {
		ext = ".bin"
	}
	return fmt.Sprintf("containers/%s/photos/%s%s", containerID.String(), photoID.String(), ext)
}

func photoContentURL(photoID uuid.UUID) string {
	return "/api/photos/" + photoID.String() + "/content"
}
