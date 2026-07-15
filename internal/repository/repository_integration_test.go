package repository

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"testing"
	"time"

	"github.com/Brain4Fish/storagetron/pkg/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

func TestRepositoryIntegrationItemContainerLabelsAndInheritedLocation(t *testing.T) {
	pool := repositoryIntegrationPool(t)
	ctx := context.Background()

	locationRepo := NewLocationRepo(pool)
	itemRepo := NewItemRepo(pool)
	containerRepo := NewContainerRepo(pool)

	containerLocationID := uuid.New()
	require.NoError(t, locationRepo.Create(ctx, model.Location{
		ID:      containerLocationID,
		Country: "Kazakhstan",
		City:    "Almaty",
		Room:    "Storage",
		Shelf:   "A1",
	}))

	containerID := uuid.New()
	require.NoError(t, containerRepo.Create(ctx, model.Container{
		ID:          containerID,
		Name:        "Box 07",
		Description: "Desk gear",
		LocationID:  &containerLocationID,
	}, "BOX-007"))

	itemID := uuid.New()
	require.NoError(t, itemRepo.Create(ctx, model.Item{
		ID:          itemID,
		Name:        "Keyboard",
		Description: "Split keyboard",
	}, "ITEM-KEYBOARD"))
	require.NoError(t, containerRepo.AddItem(ctx, containerID, itemID))

	item, err := itemRepo.Get(ctx, itemID)
	require.NoError(t, err)
	require.Equal(t, "Keyboard", item.Name)
	require.Nil(t, item.Location)
	require.NotNil(t, item.InheritedLocation)
	require.Equal(t, "Kazakhstan / Almaty / Storage / A1", item.InheritedLocation.Name)

	byItemLabel, err := itemRepo.GetByLabelCode(ctx, "ITEM-KEYBOARD")
	require.NoError(t, err)
	require.Equal(t, itemID, byItemLabel.ID)

	byContainerLabel, err := containerRepo.GetByLabelCode(ctx, "BOX-007")
	require.NoError(t, err)
	require.Equal(t, containerID, byContainerLabel.ID)
	require.Len(t, byContainerLabel.Items, 1)
	require.Equal(t, itemID, byContainerLabel.Items[0].ID)

	err = containerRepo.AddItem(ctx, uuid.New(), itemID)
	require.ErrorIs(t, err, pgx.ErrNoRows)
}

func TestRepositoryIntegrationPhotoCreateListAndDelete(t *testing.T) {
	pool := repositoryIntegrationPool(t)
	ctx := context.Background()

	itemRepo := NewItemRepo(pool)
	photoRepo := NewPhotoRepo(pool)
	itemID := uuid.New()
	require.NoError(t, itemRepo.Create(ctx, model.Item{ID: itemID, Name: "Camera"}, "ITEM-CAMERA"))

	photoID := uuid.New()
	require.NoError(t, photoRepo.Create(ctx, model.Photo{
		ID:          photoID,
		ItemID:      &itemID,
		ObjectKey:   "items/camera.jpg",
		ContentType: "image/jpeg",
	}))

	photos, err := photoRepo.ListByItemID(ctx, itemID)
	require.NoError(t, err)
	require.Len(t, photos, 1)
	require.Equal(t, photoID, photos[0].ID)
	require.Equal(t, "items/camera.jpg", photos[0].ObjectKey)
	require.Equal(t, "image/jpeg", photos[0].ContentType)

	photo, err := photoRepo.GetByID(ctx, photoID)
	require.NoError(t, err)
	require.Equal(t, photoID, photo.ID)
	require.Equal(t, "items/camera.jpg", photo.ObjectKey)

	deleted, err := photoRepo.DeleteByItemID(ctx, itemID, photoID)
	require.NoError(t, err)
	require.Equal(t, photoID, deleted.ID)
	require.Equal(t, "items/camera.jpg", deleted.ObjectKey)

	photos, err = photoRepo.ListByItemID(ctx, itemID)
	require.NoError(t, err)
	require.Empty(t, photos)
}

func TestRepositoryIntegrationReusableLabelsAndInheritance(t *testing.T) {
	pool := repositoryIntegrationPool(t)
	ctx := context.Background()
	itemRepo := NewItemRepo(pool)
	containerRepo := NewContainerRepo(pool)
	labelRepo := NewLabelRepo(pool)

	itemID := uuid.New()
	containerID := uuid.New()
	require.NoError(t, itemRepo.Create(ctx, model.Item{ID: itemID, Name: "Camera"}, "SCAN-CAMERA"))
	require.NoError(t, containerRepo.Create(ctx, model.Container{ID: containerID, Name: "Gear box"}, "SCAN-BOX"))
	require.NoError(t, containerRepo.AddItem(ctx, containerID, itemID))

	label, err := labelRepo.Create(ctx, model.Label{ID: uuid.New(), Name: "Electronics", Color: "blue"})
	require.NoError(t, err)
	require.NoError(t, itemRepo.AttachLabel(ctx, itemID, label.ID))
	require.NoError(t, itemRepo.AttachLabel(ctx, itemID, label.ID))

	item, err := itemRepo.Get(ctx, itemID)
	require.NoError(t, err)
	require.Len(t, item.Labels, 1)

	container, err := containerRepo.Get(ctx, containerID)
	require.NoError(t, err)
	require.Empty(t, container.Labels)
	require.Len(t, container.InheritedLabels, 1)
	require.Len(t, container.Items[0].Labels, 1)

	require.NoError(t, containerRepo.AttachLabel(ctx, containerID, label.ID))
	require.NoError(t, containerRepo.AttachLabel(ctx, containerID, label.ID))
	container, err = containerRepo.Get(ctx, containerID)
	require.NoError(t, err)
	require.Len(t, container.Labels, 1)
	require.Empty(t, container.InheritedLabels)

	require.NoError(t, containerRepo.DetachLabel(ctx, containerID, label.ID))
	require.NoError(t, containerRepo.DetachLabel(ctx, containerID, label.ID))
	require.NoError(t, labelRepo.Delete(ctx, label.ID))
	item, err = itemRepo.Get(ctx, itemID)
	require.NoError(t, err)
	require.Empty(t, item.Labels)
	_, err = itemRepo.GetByLabelCode(ctx, "SCAN-CAMERA")
	require.NoError(t, err)
}

func TestRepositoryIntegrationLocationNameAndNoRows(t *testing.T) {
	pool := repositoryIntegrationPool(t)
	ctx := context.Background()

	locationRepo := NewLocationRepo(pool)
	locationID := uuid.New()
	require.NoError(t, locationRepo.Create(ctx, model.Location{
		ID:    locationID,
		City:  "SPb",
		Room:  "Office",
		Shelf: "Shelf 2",
	}))

	location, err := locationRepo.Get(ctx, locationID)
	require.NoError(t, err)
	require.Equal(t, "SPb / Office / Shelf 2", location.Name)

	require.NoError(t, locationRepo.Update(ctx, locationID, model.UpdateLocationRequest{Country: "Kazakhstan", City: "SPb"}))
	location, err = locationRepo.Get(ctx, locationID)
	require.NoError(t, err)
	require.Equal(t, "Kazakhstan / SPb", location.Name)

	require.NoError(t, locationRepo.Delete(ctx, locationID))
	_, err = locationRepo.Get(ctx, locationID)
	require.ErrorIs(t, err, pgx.ErrNoRows)
}

func repositoryIntegrationPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set TEST_DATABASE_URL to run repository integration tests against a disposable Postgres database")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	t.Cleanup(cancel)

	pool, err := pgxpool.New(ctx, databaseURL)
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	require.NoError(t, applyRepositoryMigrations(ctx, pool))
	require.NoError(t, truncateRepositoryTables(ctx, pool))
	return pool
}

func applyRepositoryMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	_, file, _, _ := runtime.Caller(0)
	root := filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".."))
	files, err := filepath.Glob(filepath.Join(root, "migrations", "*.sql"))
	if err != nil {
		return err
	}
	sort.Strings(files)
	for _, file := range files {
		content, err := os.ReadFile(file)
		if err != nil {
			return err
		}
		if _, err := pool.Exec(ctx, string(content)); err != nil {
			return err
		}
	}
	return nil
}

func truncateRepositoryTables(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, `
		TRUNCATE
			restore_runs,
			backup_runs,
			backup_schedules,
			backup_targets,
			photos,
			item_labels,
			container_labels,
			labels,
			scan_labels,
			item_container,
			items,
			containers,
			locations
		RESTART IDENTITY CASCADE
	`)
	return err
}
