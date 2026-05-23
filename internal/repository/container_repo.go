package repository

import (
	"context"
	"errors"

	"github.com/Brain4Fish/storagetron/pkg/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ContainerRepo struct {
	db *pgxpool.Pool
}

func NewContainerRepo(db *pgxpool.Pool) *ContainerRepo {
	return &ContainerRepo{db: db}
}

func (r *ContainerRepo) Create(ctx context.Context, c model.Container, labelCode string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO containers (id, name, description, location_id)
		VALUES ($1, $2, $3, $4)
	`, c.ID, c.Name, c.Description, c.LocationID)
	if err != nil {
		return err
	}

	if labelCode != "" {
		_, err = tx.Exec(ctx, `
			INSERT INTO labels (code, container_id)
			VALUES ($1, $2)
		`, labelCode, c.ID)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (r *ContainerRepo) List(ctx context.Context) ([]model.Container, error) {
	rows, err := r.db.Query(ctx, `
		SELECT c.id, c.name, COALESCE(c.description, ''), c.location_id, c.created_at, COUNT(ic.item_id)
		FROM containers c
		LEFT JOIN item_container ic ON ic.container_id = c.id
		GROUP BY c.id
		ORDER BY c.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	containers := make([]model.Container, 0)
	for rows.Next() {
		var c model.Container
		if err := rows.Scan(&c.ID, &c.Name, &c.Description, &c.LocationID, &c.CreatedAt, &c.ItemsCount); err != nil {
			return nil, err
		}
		items, err := r.getContainerItems(ctx, c.ID)
		if err != nil {
			return nil, err
		}
		c.Items = items
		containers = append(containers, c)
	}
	return containers, rows.Err()
}

func (r *ContainerRepo) Get(ctx context.Context, id uuid.UUID) (model.Container, error) {
	var c model.Container
	err := r.db.QueryRow(ctx, `
		SELECT id, name, COALESCE(description, ''), location_id, created_at
		FROM containers
		WHERE id = $1
	`, id).Scan(&c.ID, &c.Name, &c.Description, &c.LocationID, &c.CreatedAt)
	if err != nil {
		return model.Container{}, err
	}

	items, err := r.getContainerItems(ctx, id)
	if err != nil {
		return model.Container{}, err
	}
	c.Items = items
	c.ItemsCount = len(items)

	return c, nil
}

func (r *ContainerRepo) Update(ctx context.Context, id uuid.UUID, req model.UpdateContainerRequest) error {
	cmd, err := r.db.Exec(ctx, `
		UPDATE containers
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

func (r *ContainerRepo) AddItem(ctx context.Context, containerID, itemID uuid.UUID) error {
	cmd, err := r.db.Exec(ctx, `
		INSERT INTO item_container (item_id, container_id)
		SELECT $1, $2
		WHERE NOT EXISTS (
			SELECT 1
			FROM item_container
			WHERE item_id = $1
		)
	`, itemID, containerID)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (r *ContainerRepo) RemoveItem(ctx context.Context, containerID, itemID uuid.UUID) error {
	cmd, err := r.db.Exec(ctx, `
		DELETE FROM item_container
		WHERE container_id = $1 AND item_id = $2
	`, containerID, itemID)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (r *ContainerRepo) GetByLabelCode(ctx context.Context, code string) (model.Container, error) {
	var containerID uuid.UUID
	err := r.db.QueryRow(ctx, `
		SELECT container_id
		FROM labels
		WHERE code = $1 AND container_id IS NOT NULL
	`, code).Scan(&containerID)
	if err != nil {
		return model.Container{}, err
	}
	return r.Get(ctx, containerID)
}

func (r *ContainerRepo) GetLabelByContainerID(ctx context.Context, containerID uuid.UUID) (*model.Label, error) {
	var label model.Label
	err := r.db.QueryRow(ctx, `
		SELECT code, item_id, container_id, created_at
		FROM labels
		WHERE container_id = $1
		LIMIT 1
	`, containerID).Scan(&label.Code, &label.ItemID, &label.ContainerID, &label.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &label, nil
}

func (r *ContainerRepo) GetLabelByCode(ctx context.Context, code string) (*model.Label, error) {
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

func (r *ContainerRepo) getContainerItems(ctx context.Context, containerID uuid.UUID) ([]model.Item, error) {
	rows, err := r.db.Query(ctx, `
		SELECT i.id, i.name, COALESCE(i.description, ''), i.location_id, i.created_at
		FROM items i
		INNER JOIN item_container ic ON ic.item_id = i.id
		WHERE ic.container_id = $1
		ORDER BY i.created_at DESC
	`, containerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []model.Item
	for rows.Next() {
		var item model.Item
		if err := rows.Scan(&item.ID, &item.Name, &item.Description, &item.LocationID, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
