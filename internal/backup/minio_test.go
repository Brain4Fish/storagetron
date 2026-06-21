package backup

import (
	"archive/tar"
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/klauspost/compress/zstd"
	"github.com/stretchr/testify/require"
)

func TestExportImportObjectsRoundTrip(t *testing.T) {
	source := newMemoryObjectStorage()
	source.objects["items/one.jpg"] = memoryObject{body: []byte("image"), contentType: "image/jpeg"}
	source.objects["docs/readme.txt"] = memoryObject{body: []byte("notes"), contentType: "text/plain"}

	archive := filepath.Join(t.TempDir(), "minio.tar.zst")
	require.NoError(t, ExportObjects(context.Background(), source, archive))

	destination := newMemoryObjectStorage()
	require.NoError(t, ImportObjects(context.Background(), destination, archive))

	require.Equal(t, []byte("image"), destination.objects["items/one.jpg"].body)
	require.Equal(t, "image/jpeg", destination.objects["items/one.jpg"].contentType)
	require.Equal(t, []byte("notes"), destination.objects["docs/readme.txt"].body)
	require.Equal(t, "text/plain", destination.objects["docs/readme.txt"].contentType)
}

func TestImportObjectsProvidesSeekableBodies(t *testing.T) {
	archive := filepath.Join(t.TempDir(), "minio.tar.zst")
	require.NoError(t, writeObjectArchive(archive, "config", []byte("settings"), "application/octet-stream"))

	destination := &seekableObjectStorage{memoryObjectStorage: newMemoryObjectStorage()}
	require.NoError(t, ImportObjects(context.Background(), destination, archive))

	require.True(t, destination.sawSeekable)
	require.Equal(t, []byte("settings"), destination.objects["config"].body)
}

func TestExportObjectsRejectsUnsafeKeys(t *testing.T) {
	storage := newMemoryObjectStorage()
	storage.objects["../escape.jpg"] = memoryObject{body: []byte("bad")}

	err := ExportObjects(context.Background(), storage, filepath.Join(t.TempDir(), "minio.tar.zst"))
	require.Error(t, err)
	require.Contains(t, err.Error(), "unsafe minio object key")
}

func TestImportObjectsRejectsUnsafeKeys(t *testing.T) {
	archive := filepath.Join(t.TempDir(), "minio.tar.zst")
	require.NoError(t, writeObjectArchive(archive, "../escape.jpg", []byte("bad"), "image/jpeg"))

	err := ImportObjects(context.Background(), newMemoryObjectStorage(), archive)
	require.Error(t, err)
	require.Contains(t, err.Error(), "unsafe minio object key")
}

func TestImportObjectsRejectsDirectories(t *testing.T) {
	archive := filepath.Join(t.TempDir(), "minio.tar.zst")
	require.NoError(t, writeDirectoryObjectArchive(archive, "photos"))

	err := ImportObjects(context.Background(), newMemoryObjectStorage(), archive)
	require.Error(t, err)
	require.Contains(t, err.Error(), "unsupported minio archive entry type")
}

type memoryObject struct {
	body        []byte
	contentType string
}

type memoryObjectStorage struct {
	objects map[string]memoryObject
}

func newMemoryObjectStorage() *memoryObjectStorage {
	return &memoryObjectStorage{objects: make(map[string]memoryObject)}
}

func (s *memoryObjectStorage) ListObjects(context.Context) ([]ObjectInfo, error) {
	objects := make([]ObjectInfo, 0, len(s.objects))
	for key, object := range s.objects {
		objects = append(objects, ObjectInfo{
			Key:         key,
			Size:        int64(len(object.body)),
			ContentType: object.contentType,
		})
	}
	return objects, nil
}

func (s *memoryObjectStorage) GetObject(_ context.Context, key string) (io.ReadCloser, error) {
	object := s.objects[key]
	return io.NopCloser(bytes.NewReader(object.body)), nil
}

func (s *memoryObjectStorage) PutObject(_ context.Context, key string, body io.Reader, _ int64, contentType string) error {
	data, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	s.objects[key] = memoryObject{body: data, contentType: contentType}
	return nil
}

type seekableObjectStorage struct {
	*memoryObjectStorage
	sawSeekable bool
}

func (s *seekableObjectStorage) PutObject(ctx context.Context, key string, body io.Reader, size int64, contentType string) error {
	seeker, ok := body.(io.Seeker)
	if !ok {
		return errors.New("put object body is not seekable")
	}
	offset, err := seeker.Seek(0, io.SeekCurrent)
	if err != nil {
		return err
	}
	if offset != 0 {
		return errors.New("put object body was not rewound")
	}
	s.sawSeekable = true
	return s.memoryObjectStorage.PutObject(ctx, key, body, size, contentType)
}

func writeObjectArchive(path, key string, body []byte, contentType string) error {
	var buf bytes.Buffer
	zw, err := zstd.NewWriter(&buf)
	if err != nil {
		return err
	}
	tw := tar.NewWriter(zw)
	header := &tar.Header{Name: key, Mode: 0600, Size: int64(len(body))}
	if contentType != "" {
		header.PAXRecords = map[string]string{"storagetron.content_type": contentType}
	}
	if err := tw.WriteHeader(header); err != nil {
		return err
	}
	if _, err := tw.Write(body); err != nil {
		return err
	}
	if err := tw.Close(); err != nil {
		return err
	}
	if err := zw.Close(); err != nil {
		return err
	}
	return os.WriteFile(path, buf.Bytes(), 0600)
}

func writeDirectoryObjectArchive(path, key string) error {
	var buf bytes.Buffer
	zw, err := zstd.NewWriter(&buf)
	if err != nil {
		return err
	}
	tw := tar.NewWriter(zw)
	if err := tw.WriteHeader(&tar.Header{Name: key, Typeflag: tar.TypeDir, Mode: 0700}); err != nil {
		return err
	}
	if err := tw.Close(); err != nil {
		return err
	}
	if err := zw.Close(); err != nil {
		return err
	}
	return os.WriteFile(path, buf.Bytes(), 0600)
}
