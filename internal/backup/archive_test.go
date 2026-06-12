package backup

import (
	"archive/tar"
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCreateAndExtractTarZstdRoundTrip(t *testing.T) {
	source := t.TempDir()
	require.NoError(t, os.MkdirAll(filepath.Join(source, "photos", "items"), 0700))
	require.NoError(t, os.WriteFile(filepath.Join(source, "postgres.dump"), []byte("pg-data"), 0600))
	require.NoError(t, os.WriteFile(filepath.Join(source, "photos", "items", "one.jpg"), []byte("image-data"), 0600))

	archive := filepath.Join(t.TempDir(), "backup.tar.zst")
	require.NoError(t, CreateTarZstd(context.Background(), source, archive))

	destination := t.TempDir()
	require.NoError(t, ExtractTarZstd(context.Background(), archive, destination))

	pgDump, err := os.ReadFile(filepath.Join(destination, "postgres.dump"))
	require.NoError(t, err)
	require.Equal(t, "pg-data", string(pgDump))

	photo, err := os.ReadFile(filepath.Join(destination, "photos", "items", "one.jpg"))
	require.NoError(t, err)
	require.Equal(t, "image-data", string(photo))
}

func TestSHA256File(t *testing.T) {
	file := filepath.Join(t.TempDir(), "data.txt")
	require.NoError(t, os.WriteFile(file, []byte("storagetron"), 0600))

	got, err := SHA256File(file)
	require.NoError(t, err)
	require.Equal(t, "60a1de4b49972152b8d03d4a26946d3a9b03d0f8a6bb08976c4fabfa0710875c", got)
}

func TestExtractTarRejectsUnsafePaths(t *testing.T) {
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	require.NoError(t, tw.WriteHeader(&tar.Header{
		Name: "../escape.txt",
		Mode: 0600,
		Size: int64(len("bad")),
	}))
	_, err := tw.Write([]byte("bad"))
	require.NoError(t, err)
	require.NoError(t, tw.Close())

	err = extractTar(context.Background(), tar.NewReader(&buf), t.TempDir())
	require.Error(t, err)
	require.Contains(t, err.Error(), "unsafe archive path")
}

func TestExtractTarRejectsUnsupportedEntryTypes(t *testing.T) {
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	require.NoError(t, tw.WriteHeader(&tar.Header{
		Name:     "link",
		Typeflag: tar.TypeSymlink,
		Linkname: "postgres.dump",
	}))
	require.NoError(t, tw.Close())

	err := extractTar(context.Background(), tar.NewReader(&buf), t.TempDir())
	require.Error(t, err)
	require.Contains(t, err.Error(), "unsupported archive entry type")
}

func TestReadManifestRejectsUnsafeBackupPaths(t *testing.T) {
	path := filepath.Join(t.TempDir(), "manifest.json")
	require.NoError(t, WriteJSONFile(path, BackupManifest{
		Version:            1,
		PostgresBackupFile: "../postgres.dump",
		MinIOBackupFile:    "minio.tar.zst",
	}))

	_, err := readManifest(path)
	require.Error(t, err)
	require.Contains(t, err.Error(), "unsafe file paths")
}

func TestValidateManifestRejectsChecksumMismatch(t *testing.T) {
	root := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(root, "postgres.dump"), []byte("actual"), 0600))

	err := validateManifest(root, BackupManifest{
		Checksums: map[string]Checksum{
			"postgres.dump": {Algorithm: "sha256", Value: strings.Repeat("0", 64)},
		},
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "checksum mismatch")
}

func TestValidateManifestRejectsUnsafeChecksumPaths(t *testing.T) {
	err := validateManifest(t.TempDir(), BackupManifest{
		Checksums: map[string]Checksum{
			"../postgres.dump": {Algorithm: "sha256", Value: strings.Repeat("0", 64)},
		},
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "unsafe checksum path")
}
