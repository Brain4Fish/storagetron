package repository

import (
	"context"
	"errors"
	"time"

	"github.com/Brain4Fish/storagetron/pkg/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type scanner interface {
	Scan(dest ...any) error
}

type ItemRepo struct {
	db *pgxpool.Pool
}

func NewItemRepo(db *pgxpool.Pool) *ItemRepo {
	return &ItemRepo{db: db}
}

func (r *ItemRepo) Create(ctx context.Context, item model.Item, labelCode string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO items (id, name, description, location_id)
		VALUES ($1, $2, $3, $4)
	`, item.ID, item.Name, item.Description, item.LocationID)
	if err != nil {
		return err
	}

	if labelCode != "" {
		_, err = tx.Exec(ctx, `
			INSERT INTO labels (code, item_id)
			VALUES ($1, $2)
		`, labelCode, item.ID)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (r *ItemRepo) List(ctx context.Context) ([]model.Item, error) {
	rows, err := r.db.Query(ctx, `
        SELECT
            i.id, i.name, COALESCE(i.description, ''), i.location_id, i.created_at,
            l.id, COALESCE(l.name, ''), COALESCE(l.country, ''), COALESCE(l.city, ''), COALESCE(l.room, ''), COALESCE(l.shelf, ''), l.created_at,
            il.id, COALESCE(il.name, ''), COALESCE(il.country, ''), COALESCE(il.city, ''), COALESCE(il.room, ''), COALESCE(il.shelf, ''), il.created_at
        FROM items i
        LEFT JOIN locations l ON l.id = i.location_id
        LEFT JOIN item_container ic ON ic.item_id = i.id
        LEFT JOIN containers c ON c.id = ic.container_id
        LEFT JOIN locations il ON il.id = c.location_id
        ORDER BY i.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := make([]model.Item, 0)
	for rows.Next() {
		var i model.Item
		if err := scanItemWithLocations(rows, &i); err != nil {
			return nil, err
		}
		res = append(res, i)
	}
	return res, rows.Err()
}

func (r *ItemRepo) ListPage(ctx context.Context, limit, offset int) ([]model.Item, int, error) {
	rows, err := r.db.Query(ctx, `
        SELECT
            i.id, i.name, COALESCE(i.description, ''), i.location_id, i.created_at,
            l.id, COALESCE(l.name, ''), COALESCE(l.country, ''), COALESCE(l.city, ''), COALESCE(l.room, ''), COALESCE(l.shelf, ''), l.created_at,
            il.id, COALESCE(il.name, ''), COALESCE(il.country, ''), COALESCE(il.city, ''), COALESCE(il.room, ''), COALESCE(il.shelf, ''), il.created_at
        FROM items i
        LEFT JOIN locations l ON l.id = i.location_id
        LEFT JOIN item_container ic ON ic.item_id = i.id
        LEFT JOIN containers c ON c.id = ic.container_id
        LEFT JOIN locations il ON il.id = c.location_id
        ORDER BY i.created_at DESC
        LIMIT $1 OFFSET $2
    `, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	res := make([]model.Item, 0)
	for rows.Next() {
		var i model.Item
		if err := scanItemWithLocations(rows, &i); err != nil {
			return nil, 0, err
		}
		res = append(res, i)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	var total int
	if err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM items`).Scan(&total); err != nil {
		return nil, 0, err
	}

	return res, total, nil
}

func (r *ItemRepo) Get(ctx context.Context, id uuid.UUID) (model.Item, error) {
	var i model.Item
	err := scanItemWithLocations(r.db.QueryRow(ctx, `
		SELECT
			i.id, i.name, COALESCE(i.description, ''), i.location_id, i.created_at,
			l.id, COALESCE(l.name, ''), COALESCE(l.country, ''), COALESCE(l.city, ''), COALESCE(l.room, ''), COALESCE(l.shelf, ''), l.created_at,
			il.id, COALESCE(il.name, ''), COALESCE(il.country, ''), COALESCE(il.city, ''), COALESCE(il.room, ''), COALESCE(il.shelf, ''), il.created_at
		FROM items i
		LEFT JOIN locations l ON l.id = i.location_id
		LEFT JOIN item_container ic ON ic.item_id = i.id
		LEFT JOIN containers c ON c.id = ic.container_id
		LEFT JOIN locations il ON il.id = c.location_id
		WHERE i.id = $1
	`, id), &i)
	return i, err
}

func (r *ItemRepo) Update(ctx context.Context, id uuid.UUID, req model.UpdateItemRequest) error {
	cmd, err := r.db.Exec(ctx, `
		UPDATE items
		SET name = $2, description = $3, location_id = $4
		WHERE id = $1
	`, id, req.Name, req.Description, req.LocationID)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (r *ItemRepo) Delete(ctx context.Context, id uuid.UUID) error {
	cmd, err := r.db.Exec(ctx, `DELETE FROM items WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (r *ItemRepo) GetByLabelCode(ctx context.Context, code string) (model.Item, error) {
	var itemID uuid.UUID
	err := r.db.QueryRow(ctx, `
		SELECT item_id
		FROM labels
		WHERE code = $1 AND item_id IS NOT NULL
	`, code).Scan(&itemID)
	if err != nil {
		return model.Item{}, err
	}
	return r.Get(ctx, itemID)
}

func (r *ItemRepo) GetLabelByCode(ctx context.Context, code string) (*model.Label, error) {
	var label model.Label
	err := r.db.QueryRow(ctx, `
		SELECT code, item_id, container_id, created_at
		FROM labels
		WHERE code = $1
	`, code).Scan(&label.Code, &label.ItemID, &label.ContainerID, &label.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &label, nil
}

func scanItemWithLocations(row scanner, item *model.Item) error {
	var location model.Location
	var inheritedLocation model.Location
	var locationID *uuid.UUID
	var inheritedLocationID *uuid.UUID
	var locationCreatedAt *time.Time
	var inheritedLocationCreatedAt *time.Time
	if err := row.Scan(
		&item.ID, &item.Name, &item.Description, &item.LocationID, &item.CreatedAt,
		&locationID, &location.Name, &location.Country, &location.City, &location.Room, &location.Shelf, &locationCreatedAt,
		&inheritedLocationID, &inheritedLocation.Name, &inheritedLocation.Country, &inheritedLocation.City, &inheritedLocation.Room, &inheritedLocation.Shelf, &inheritedLocationCreatedAt,
	); err != nil {
		return err
	}
	if locationID != nil {
		location.ID = *locationID
		if locationCreatedAt != nil {
			location.CreatedAt = *locationCreatedAt
		}
		item.Location = &location
	}
	if inheritedLocationID != nil {
		inheritedLocation.ID = *inheritedLocationID
		if inheritedLocationCreatedAt != nil {
			inheritedLocation.CreatedAt = *inheritedLocationCreatedAt
		}
		item.InheritedLocation = &inheritedLocation
	}
	return nil
}
