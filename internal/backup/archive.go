package backup

import (
	"archive/tar"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/klauspost/compress/zstd"
)

func WriteJSONFile(path string, value any) error {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	defer file.Close()
	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	return encoder.Encode(value)
}

func SHA256File(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func CreateTarZstd(ctx context.Context, sourceDir, destination string) error {
	out, err := os.OpenFile(destination, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return fmt.Errorf("create archive: %w", err)
	}
	defer out.Close()

	zw, err := zstd.NewWriter(out)
	if err != nil {
		return fmt.Errorf("create zstd writer: %w", err)
	}
	defer zw.Close()
	tw := tar.NewWriter(zw)
	defer tw.Close()

	return filepath.WalkDir(sourceDir, func(pathOnDisk string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		if pathOnDisk == sourceDir {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(sourceDir, pathOnDisk)
		if err != nil {
			return err
		}
		name := filepath.ToSlash(rel)
		if !safeArchiveName(name) {
			return fmt.Errorf("unsafe archive path %q", name)
		}
		header, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return err
		}
		header.Name = name
		if err := tw.WriteHeader(header); err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		file, err := os.Open(pathOnDisk)
		if err != nil {
			return err
		}
		_, copyErr := io.Copy(tw, file)
		closeErr := file.Close()
		if copyErr != nil {
			return copyErr
		}
		return closeErr
	})
}

func ExtractTarZstd(ctx context.Context, archivePath, destinationDir string) error {
	file, err := os.Open(archivePath)
	if err != nil {
		return fmt.Errorf("open archive: %w", err)
	}
	defer file.Close()
	zr, err := zstd.NewReader(file)
	if err != nil {
		return fmt.Errorf("open zstd reader: %w", err)
	}
	defer zr.Close()
	return extractTar(ctx, tar.NewReader(zr), destinationDir)
}

func extractTar(ctx context.Context, tr *tar.Reader, destinationDir string) error {
	cleanDestination, err := filepath.Abs(destinationDir)
	if err != nil {
		return err
	}
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
		if !safeArchiveName(header.Name) {
			return fmt.Errorf("unsafe archive path %q", header.Name)
		}
		targetPath := filepath.Join(cleanDestination, filepath.FromSlash(header.Name))
		if !strings.HasPrefix(targetPath, cleanDestination+string(os.PathSeparator)) && targetPath != cleanDestination {
			return fmt.Errorf("archive path escapes destination %q", header.Name)
		}
		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(targetPath, 0700); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(targetPath), 0700); err != nil {
				return err
			}
			out, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
			if err != nil {
				return err
			}
			if _, err := io.Copy(out, tr); err != nil {
				_ = out.Close()
				return err
			}
			if err := out.Close(); err != nil {
				return err
			}
		default:
			return fmt.Errorf("unsupported archive entry type %q for %s", header.Typeflag, header.Name)
		}
	}
}

func safeArchiveName(name string) bool {
	if name == "" || strings.Contains(name, "\x00") || filepath.IsAbs(name) || strings.HasPrefix(name, "/") {
		return false
	}
	cleaned := pathCleanSlash(name)
	return cleaned == name && cleaned != "." && !strings.HasPrefix(cleaned, "../") && cleaned != ".."
}

func pathCleanSlash(name string) string {
	return strings.TrimPrefix(filepath.ToSlash(filepath.Clean(filepath.FromSlash(name))), "./")
}
