package docreport

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"

	"github.com/google/uuid"
)

var reportFilenamePattern = regexp.MustCompile(`^documentation-report-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(xlsx|pdf)$`)

type FileStore struct {
	dir string
}

func NewFileStore(dir string) *FileStore {
	return &FileStore{dir: dir}
}

func (s *FileStore) WriteAtomic(filename string, render func(io.Writer) error) (size int64, err error) {
	if !safeReportFilename(filename) {
		return 0, fmt.Errorf("unsafe documentation report filename")
	}
	if err := os.MkdirAll(s.dir, 0o750); err != nil {
		return 0, fmt.Errorf("create documentation reports directory: %w", err)
	}
	root, err := os.OpenRoot(s.dir)
	if err != nil {
		return 0, fmt.Errorf("open documentation reports directory: %w", err)
	}
	defer root.Close()

	tempName := ".tmp-" + uuid.NewString()
	file, err := root.OpenFile(tempName, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return 0, fmt.Errorf("create temporary documentation report: %w", err)
	}
	tempOpen := true
	defer func() {
		if tempOpen {
			_ = file.Close()
		}
		_ = root.Remove(tempName)
	}()

	if err := render(file); err != nil {
		return 0, err
	}
	if err := file.Sync(); err != nil {
		return 0, fmt.Errorf("sync documentation report: %w", err)
	}
	if err := file.Close(); err != nil {
		tempOpen = false
		return 0, fmt.Errorf("close documentation report: %w", err)
	}
	tempOpen = false
	if err := root.Rename(tempName, filename); err != nil {
		return 0, fmt.Errorf("publish documentation report: %w", err)
	}

	info, err := root.Stat(filename)
	if err != nil {
		_ = root.Remove(filename)
		return 0, fmt.Errorf("stat documentation report: %w", err)
	}
	if !info.Mode().IsRegular() {
		_ = root.Remove(filename)
		return 0, fmt.Errorf("documentation report is not a regular file")
	}
	return info.Size(), nil
}

func (s *FileStore) Remove(filename string) error {
	if !safeReportFilename(filename) {
		return fmt.Errorf("unsafe documentation report filename")
	}
	root, err := os.OpenRoot(s.dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	defer root.Close()
	err = root.Remove(filename)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func (s *FileStore) Exists(filename string) bool {
	if !safeReportFilename(filename) {
		return false
	}
	root, err := os.OpenRoot(s.dir)
	if err != nil {
		return false
	}
	defer root.Close()
	info, err := root.Stat(filename)
	return err == nil && info.Mode().IsRegular()
}

func (s *FileStore) Open(filename string) (*os.File, os.FileInfo, error) {
	if !safeReportFilename(filename) {
		return nil, nil, os.ErrNotExist
	}
	root, err := os.OpenRoot(s.dir)
	if err != nil {
		return nil, nil, err
	}
	defer root.Close()
	file, err := root.Open(filename)
	if err != nil {
		return nil, nil, err
	}
	info, err := file.Stat()
	if err != nil {
		file.Close()
		return nil, nil, err
	}
	if !info.Mode().IsRegular() {
		file.Close()
		return nil, nil, os.ErrNotExist
	}
	return file, info, nil
}

func safeReportFilename(filename string) bool {
	return filename != "" &&
		filepath.Base(filename) == filename &&
		reportFilenamePattern.MatchString(filename)
}
