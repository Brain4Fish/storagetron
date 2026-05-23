package repository

import (
	"context"
	"errors"

	"github.com/Brain4Fish/storagetron/pkg/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

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
        SELECT id, name, COALESCE(description, ''), location_id, created_at
        FROM items
        ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := make([]model.Item, 0)
	for rows.Next() {
		var i model.Item
		if err := rows.Scan(&i.ID, &i.Name, &i.Description, &i.LocationID, &i.CreatedAt); err != nil {
			return nil, err
		}
		res = append(res, i)
	}
	return res, rows.Err()
}

func (r *ItemRepo) ListPage(ctx context.Context, limit, offset int) ([]model.Item, int, error) {
	rows, err := r.db.Query(ctx, `
        SELECT id, name, COALESCE(description, ''), location_id, created_at
        FROM items
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
    `, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	res := make([]model.Item, 0)
	for rows.Next() {
		var i model.Item
		if err := rows.Scan(&i.ID, &i.Name, &i.Description, &i.LocationID, &i.CreatedAt); err != nil {
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
	err := r.db.QueryRow(ctx, `
		SELECT id, name, COALESCE(description, ''), location_id, created_at
		FROM items
		WHERE id = $1
	`, id).Scan(&i.ID, &i.Name, &i.Description, &i.LocationID, &i.CreatedAt)
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
