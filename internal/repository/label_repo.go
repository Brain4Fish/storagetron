package repository

import (
	"context"
	"strings"

	"github.com/Brain4Fish/storagetron/pkg/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type LabelRepo struct {
	db *pgxpool.Pool
}

func NewLabelRepo(db *pgxpool.Pool) *LabelRepo {
	return &LabelRepo{db: db}
}

func (r *LabelRepo) List(ctx context.Context) ([]model.Label, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, name, color, created_at, updated_at
		FROM labels
		ORDER BY lower(name), id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	labels := make([]model.Label, 0)
	for rows.Next() {
		var label model.Label
		if err := rows.Scan(&label.ID, &label.Name, &label.Color, &label.CreatedAt, &label.UpdatedAt); err != nil {
			return nil, err
		}
		labels = append(labels, label)
	}
	return labels, rows.Err()
}

func (r *LabelRepo) Get(ctx context.Context, id uuid.UUID) (model.Label, error) {
	var label model.Label
	err := r.db.QueryRow(ctx, `
		SELECT id, name, color, created_at, updated_at
		FROM labels
		WHERE id = $1
	`, id).Scan(&label.ID, &label.Name, &label.Color, &label.CreatedAt, &label.UpdatedAt)
	return label, err
}

func (r *LabelRepo) Create(ctx context.Context, label model.Label) (model.Label, error) {
	err := r.db.QueryRow(ctx, `
		INSERT INTO labels (id, name, color)
		VALUES ($1, $2, $3)
		RETURNING id, name, color, created_at, updated_at
	`, label.ID, strings.TrimSpace(label.Name), label.Color).Scan(
		&label.ID, &label.Name, &label.Color, &label.CreatedAt, &label.UpdatedAt,
	)
	return label, err
}

func (r *LabelRepo) Update(ctx context.Context, id uuid.UUID, req model.UpdateLabelRequest) (model.Label, error) {
	var label model.Label
	err := r.db.QueryRow(ctx, `
		UPDATE labels
		SET name = $2, color = $3, updated_at = now()
		WHERE id = $1
		RETURNING id, name, color, created_at, updated_at
	`, id, strings.TrimSpace(req.Name), req.Color).Scan(
		&label.ID, &label.Name, &label.Color, &label.CreatedAt, &label.UpdatedAt,
	)
	return label, err
}

func (r *LabelRepo) Delete(ctx context.Context, id uuid.UUID) error {
	cmd, err := r.db.Exec(ctx, `DELETE FROM labels WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func listLabelsByItemIDs(ctx context.Context, db *pgxpool.Pool, ids []uuid.UUID) (map[uuid.UUID][]model.Label, error) {
	result := make(map[uuid.UUID][]model.Label, len(ids))
	for _, id := range ids {
		result[id] = []model.Label{}
	}
	if len(ids) == 0 {
		return result, nil
	}

	rows, err := db.Query(ctx, `
		SELECT il.item_id, l.id, l.name, l.color, l.created_at, l.updated_at
		FROM item_labels il
		JOIN labels l ON l.id = il.label_id
		WHERE il.item_id = ANY($1)
		ORDER BY il.item_id, lower(l.name), l.id
	`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var ownerID uuid.UUID
		var label model.Label
		if err := rows.Scan(&ownerID, &label.ID, &label.Name, &label.Color, &label.CreatedAt, &label.UpdatedAt); err != nil {
			return nil, err
		}
		result[ownerID] = append(result[ownerID], label)
	}
	return result, rows.Err()
}

func listLabelsByContainerIDs(ctx context.Context, db *pgxpool.Pool, ids []uuid.UUID) (map[uuid.UUID][]model.Label, error) {
	result := make(map[uuid.UUID][]model.Label, len(ids))
	for _, id := range ids {
		result[id] = []model.Label{}
	}
	if len(ids) == 0 {
		return result, nil
	}

	rows, err := db.Query(ctx, `
		SELECT cl.container_id, l.id, l.name, l.color, l.created_at, l.updated_at
		FROM container_labels cl
		JOIN labels l ON l.id = cl.label_id
		WHERE cl.container_id = ANY($1)
		ORDER BY cl.container_id, lower(l.name), l.id
	`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var ownerID uuid.UUID
		var label model.Label
		if err := rows.Scan(&ownerID, &label.ID, &label.Name, &label.Color, &label.CreatedAt, &label.UpdatedAt); err != nil {
			return nil, err
		}
		result[ownerID] = append(result[ownerID], label)
	}
	return result, rows.Err()
}

func listInheritedLabelsByContainerIDs(ctx context.Context, db *pgxpool.Pool, ids []uuid.UUID) (map[uuid.UUID][]model.Label, error) {
	result := make(map[uuid.UUID][]model.Label, len(ids))
	for _, id := range ids {
		result[id] = []model.Label{}
	}
	if len(ids) == 0 {
		return result, nil
	}

	rows, err := db.Query(ctx, `
		SELECT container_id, id, name, color, created_at, updated_at
		FROM (
			SELECT DISTINCT ic.container_id, l.id, l.name, l.color, l.created_at, l.updated_at
			FROM item_container ic
			JOIN item_labels il ON il.item_id = ic.item_id
			JOIN labels l ON l.id = il.label_id
			LEFT JOIN container_labels cl ON cl.container_id = ic.container_id AND cl.label_id = l.id
			WHERE ic.container_id = ANY($1) AND cl.label_id IS NULL
		) inherited
		ORDER BY container_id, lower(name), id
	`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var ownerID uuid.UUID
		var label model.Label
		if err := rows.Scan(&ownerID, &label.ID, &label.Name, &label.Color, &label.CreatedAt, &label.UpdatedAt); err != nil {
			return nil, err
		}
		result[ownerID] = append(result[ownerID], label)
	}
	return result, rows.Err()
}
