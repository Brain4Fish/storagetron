package backup

import (
	"context"
	"io"

	"github.com/Brain4Fish/storagetron/internal/storage"
)

type S3ObjectStorage struct {
	client *storage.S3
}

func NewS3ObjectStorage(client *storage.S3) *S3ObjectStorage {
	return &S3ObjectStorage{client: client}
}

func (s *S3ObjectStorage) ListObjects(ctx context.Context) ([]ObjectInfo, error) {
	objects, err := s.client.ListObjects(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]ObjectInfo, 0, len(objects))
	for _, object := range objects {
		result = append(result, ObjectInfo{
			Key:          object.Key,
			Size:         object.Size,
			LastModified: object.LastModified,
		})
	}
	return result, nil
}

func (s *S3ObjectStorage) GetObject(ctx context.Context, key string) (io.ReadCloser, error) {
	return s.client.GetObject(ctx, key)
}

func (s *S3ObjectStorage) PutObject(ctx context.Context, key string, body io.Reader, size int64, contentType string) error {
	return s.client.PutObject(ctx, key, body, size, contentType)
}
