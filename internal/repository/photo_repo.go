package repository

import (
	"context"
	"errors"

	"github.com/Brain4Fish/storagetron/pkg/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PhotoRepo struct {
	db *pgxpool.Pool
}

func NewPhotoRepo(db *pgxpool.Pool) *PhotoRepo {
	return &PhotoRepo{db: db}
}

func (r *PhotoRepo) Create(ctx context.Context, photo model.Photo) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO photos (id, item_id, container_id, object_key, content_type)
		VALUES ($1, $2, $3, $4, $5)
	`, photo.ID, photo.ItemID, photo.ContainerID, photo.ObjectKey, photo.ContentType)
	return err
}

func (r *PhotoRepo) ListByItemID(ctx context.Context, itemID uuid.UUID) ([]model.Photo, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, item_id, container_id, object_key, COALESCE(content_type, ''), created_at
		FROM photos
		WHERE item_id = $1
		ORDER BY created_at DESC
	`, itemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var photos []model.Photo
	for rows.Next() {
		var p model.Photo
		if err := rows.Scan(&p.ID, &p.ItemID, &p.ContainerID, &p.ObjectKey, &p.ContentType, &p.CreatedAt); err != nil {
			return nil, err
		}
		photos = append(photos, p)
	}

	return photos, rows.Err()
}

func (r *PhotoRepo) ListByContainerID(ctx context.Context, containerID uuid.UUID) ([]model.Photo, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, item_id, container_id, object_key, COALESCE(content_type, ''), created_at
		FROM photos
		WHERE container_id = $1
		ORDER BY created_at ASC
	`, containerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var photos []model.Photo
	for rows.Next() {
		var p model.Photo
		if err := rows.Scan(&p.ID, &p.ItemID, &p.ContainerID, &p.ObjectKey, &p.ContentType, &p.CreatedAt); err != nil {
			return nil, err
		}
		photos = append(photos, p)
	}

	return photos, rows.Err()
}

func (r *PhotoRepo) ItemExists(ctx context.Context, itemID uuid.UUID) error {
	var id uuid.UUID
	err := r.db.QueryRow(ctx, `SELECT id FROM items WHERE id = $1`, itemID).Scan(&id)
	if err != nil {
		return err
	}
	return nil
}

func (r *PhotoRepo) ContainerExists(ctx context.Context, containerID uuid.UUID) error {
	var id uuid.UUID
	err := r.db.QueryRow(ctx, `SELECT id FROM containers WHERE id = $1`, containerID).Scan(&id)
	if err != nil {
		return err
	}
	return nil
}

func (r *PhotoRepo) DeleteByContainerID(ctx context.Context, containerID, photoID uuid.UUID) (model.Photo, error) {
	var photo model.Photo
	err := r.db.QueryRow(ctx, `
		DELETE FROM photos
		WHERE id = $1 AND container_id = $2
		RETURNING id, item_id, container_id, object_key, COALESCE(content_type, ''), created_at
	`, photoID, containerID).Scan(
		&photo.ID,
		&photo.ItemID,
		&photo.ContainerID,
		&photo.ObjectKey,
		&photo.ContentType,
		&photo.CreatedAt,
	)
	if err != nil {
		return model.Photo{}, err
	}
	return photo, nil
}

func (r *PhotoRepo) DeleteByItemID(ctx context.Context, itemID, photoID uuid.UUID) (model.Photo, error) {
	var photo model.Photo
	err := r.db.QueryRow(ctx, `
		DELETE FROM photos
		WHERE id = $1 AND item_id = $2
		RETURNING id, item_id, container_id, object_key, COALESCE(content_type, ''), created_at
	`, photoID, itemID).Scan(
		&photo.ID,
		&photo.ItemID,
		&photo.ContainerID,
		&photo.ObjectKey,
		&photo.ContentType,
		&photo.CreatedAt,
	)
	if err != nil {
		return model.Photo{}, err
	}
	return photo, nil
}

func (r *PhotoRepo) GetLabelByItemID(ctx context.Context, itemID uuid.UUID) (*model.Label, error) {
	var label model.Label
	err := r.db.QueryRow(ctx, `
		SELECT code, item_id, container_id, created_at
		FROM labels
		WHERE item_id = $1
		LIMIT 1
	`, itemID).Scan(&label.Code, &label.ItemID, &label.ContainerID, &label.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &label, nil
}
