package backup

import (
	"archive/tar"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/klauspost/compress/zstd"
)

type ObjectInfo struct {
	Key          string
	Size         int64
	ContentType  string
	LastModified time.Time
}

type ObjectStorage interface {
	ListObjects(ctx context.Context) ([]ObjectInfo, error)
	GetObject(ctx context.Context, key string) (io.ReadCloser, error)
	PutObject(ctx context.Context, key string, body io.Reader, size int64, contentType string) error
}

func ExportObjects(ctx context.Context, storage ObjectStorage, destination string) error {
	out, err := os.OpenFile(destination, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return fmt.Errorf("create minio export: %w", err)
	}
	defer out.Close()
	zw, err := zstd.NewWriter(out)
	if err != nil {
		return fmt.Errorf("create minio zstd writer: %w", err)
	}
	defer zw.Close()
	tw := tar.NewWriter(zw)
	defer tw.Close()

	objects, err := storage.ListObjects(ctx)
	if err != nil {
		return fmt.Errorf("list minio objects: %w", err)
	}
	for _, object := range objects {
		if err := ctx.Err(); err != nil {
			return err
		}
		if !safeObjectKey(object.Key) {
			return fmt.Errorf("unsafe minio object key %q", object.Key)
		}
		body, err := storage.GetObject(ctx, object.Key)
		if err != nil {
			return fmt.Errorf("get minio object %q: %w", object.Key, err)
		}
		header := &tar.Header{
			Name: object.Key,
			Mode: 0600,
			Size: object.Size,
		}
		if object.ContentType != "" {
			header.PAXRecords = map[string]string{"storagetron.content_type": object.ContentType}
		}
		if err := tw.WriteHeader(header); err != nil {
			_ = body.Close()
			return err
		}
		if _, err := io.Copy(tw, body); err != nil {
			_ = body.Close()
			return fmt.Errorf("write minio object %q: %w", object.Key, err)
		}
		if err := body.Close(); err != nil {
			return fmt.Errorf("close minio object %q: %w", object.Key, err)
		}
	}
	return nil
}

func ImportObjects(ctx context.Context, storage ObjectStorage, source string) error {
	file, err := os.Open(source)
	if err != nil {
		return fmt.Errorf("open minio export: %w", err)
	}
	defer file.Close()
	zr, err := zstd.NewReader(file)
	if err != nil {
		return fmt.Errorf("open minio zstd reader: %w", err)
	}
	defer zr.Close()
	tr := tar.NewReader(zr)
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		header, err := tr.Next()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
		if header.Typeflag != tar.TypeReg {
			return fmt.Errorf("unsupported minio archive entry type %q for %s", header.Typeflag, header.Name)
		}
		if !safeObjectKey(header.Name) {
			return fmt.Errorf("unsafe minio object key %q", header.Name)
		}
		contentType := ""
		if header.PAXRecords != nil {
			contentType = header.PAXRecords["storagetron.content_type"]
		}
		if err := storage.PutObject(ctx, header.Name, tr, header.Size, contentType); err != nil {
			return fmt.Errorf("restore minio object %q: %w", header.Name, err)
		}
	}
}

func safeObjectKey(key string) bool {
	if key == "" || strings.Contains(key, "\x00") || strings.HasPrefix(key, "/") || filepath.IsAbs(key) {
		return false
	}
	cleaned := pathCleanSlash(key)
	return cleaned == key && cleaned != "." && !strings.HasPrefix(cleaned, "../") && cleaned != ".."
}
