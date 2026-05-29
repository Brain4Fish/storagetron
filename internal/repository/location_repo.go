package repository

import (
	"context"

	"github.com/Brain4Fish/storagetron/pkg/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type LocationRepo struct {
	db *pgxpool.Pool
}

func NewLocationRepo(db *pgxpool.Pool) *LocationRepo {
	return &LocationRepo{db: db}
}

func locationName(country, city, room, shelf string) string {
	parts := make([]string, 0, 4)
	for _, part := range []string{country, city, room, shelf} {
		if part != "" {
			parts = append(parts, part)
		}
	}
	if len(parts) == 0 {
		return "Location"
	}
	name := parts[0]
	for _, part := range parts[1:] {
		name += " / " + part
	}
	return name
}

func (r *LocationRepo) Create(ctx context.Context, location model.Location) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO locations (id, name, country, city, room, shelf)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, location.ID, locationName(location.Country, location.City, location.Room, location.Shelf), location.Country, location.City, location.Room, location.Shelf)
	return err
}

func (r *LocationRepo) List(ctx context.Context) ([]model.Location, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, name, country, city, room, shelf, created_at
		FROM locations
		ORDER BY country, city, room, shelf, created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	locations := make([]model.Location, 0)
	for rows.Next() {
		var location model.Location
		if err := rows.Scan(&location.ID, &location.Name, &location.Country, &location.City, &location.Room, &location.Shelf, &location.CreatedAt); err != nil {
			return nil, err
		}
		locations = append(locations, location)
	}
	return locations, rows.Err()
}

func (r *LocationRepo) Get(ctx context.Context, id uuid.UUID) (model.Location, error) {
	var location model.Location
	err := r.db.QueryRow(ctx, `
		SELECT id, name, country, city, room, shelf, created_at
		FROM locations
		WHERE id = $1
	`, id).Scan(&location.ID, &location.Name, &location.Country, &location.City, &location.Room, &location.Shelf, &location.CreatedAt)
	return location, err
}

func (r *LocationRepo) Update(ctx context.Context, id uuid.UUID, req model.UpdateLocationRequest) error {
	cmd, err := r.db.Exec(ctx, `
		UPDATE locations
		SET name = $2, country = $3, city = $4, room = $5, shelf = $6
		WHERE id = $1
	`, id, locationName(req.Country, req.City, req.Room, req.Shelf), req.Country, req.City, req.Room, req.Shelf)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (r *LocationRepo) Delete(ctx context.Context, id uuid.UUID) error {
	cmd, err := r.db.Exec(ctx, `DELETE FROM locations WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
