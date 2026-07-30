package repository

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	documentation "github.com/Brain4Fish/storagetron/internal/documentation"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func TestDocumentationRepositoryScopesAndDeduplication(t *testing.T) {
	pool := repositoryIntegrationPool(t)
	ctx := context.Background()
	repo := NewDocumentationRepo(pool)

	locationID := uuid.New()
	otherLocationID := uuid.New()
	_, err := pool.Exec(ctx, `
		INSERT INTO locations (id, name, country, city) VALUES
			($1, 'Москва', 'Россия', 'Москва'),
			($2, 'Алматы', 'Казахстан', 'Алматы')
	`, locationID, otherLocationID)
	require.NoError(t, err)

	containerA := uuid.New()
	containerB := uuid.New()
	containerOutside := uuid.New()
	_, err = pool.Exec(ctx, `
		INSERT INTO containers (id, name, location_id, package_code) VALUES
			($1, 'Коробка А', $4, 'PKG-A'),
			($2, 'Коробка Б', $4, 'PKG-B'),
			($3, 'Вне scope', $5, 'PKG-Z')
	`, containerA, containerB, containerOutside, locationID, otherLocationID)
	require.NoError(t, err)

	packed := uuid.New()
	duplicate := uuid.New()
	loose := uuid.New()
	outsideLoose := uuid.New()
	_, err = pool.Exec(ctx, `
		INSERT INTO items (id, name, location_id, quantity, category, condition) VALUES
			($1, 'В контейнере', $5, 1, '', 'used'),
			($2, 'В двух контейнерах', $5, 1, '', 'new'),
			($3, 'Loose', $5, 1, '', 'used'),
			($4, 'Вне scope', $6, 1, '', 'used')
	`, packed, duplicate, loose, outsideLoose, locationID, otherLocationID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `
		INSERT INTO item_container (item_id, container_id) VALUES
			($1, $3), ($2, $3), ($2, $4)
	`, packed, duplicate, containerA, containerB)
	require.NoError(t, err)

	labelA := uuid.New()
	labelB := uuid.New()
	_, err = pool.Exec(ctx, `
		INSERT INTO labels (id, name) VALUES ($1, 'Ярлык'), ($2, 'Альфа');
		INSERT INTO container_labels (container_id, label_id) VALUES ($3, $1), ($3, $2);
		INSERT INTO item_labels (item_id, label_id) VALUES ($4, $1), ($4, $2)
	`, labelA, labelB, containerA, packed)
	require.NoError(t, err)

	locationScope, err := repo.ResolveLocationScope(ctx, locationID)
	require.NoError(t, err)
	require.Len(t, locationScope.Containers, 2)
	require.Len(t, locationScope.LooseItems, 1)
	require.Equal(t, loose, locationScope.LooseItems[0].ID)
	require.Equal(t, []string{"Альфа", "Ярлык"}, locationScope.Containers[0].Labels)
	seen := map[uuid.UUID]int{}
	for _, container := range locationScope.Containers {
		for _, item := range container.Items {
			seen[item.ID]++
		}
	}
	require.Equal(t, 1, seen[packed])
	require.Equal(t, 1, seen[duplicate])
	require.NotContains(t, seen, loose)

	containerScope, err := repo.ResolveContainersScope(ctx, []uuid.UUID{containerA, containerB})
	require.NoError(t, err)
	require.Empty(t, containerScope.LooseItems)
	require.Len(t, containerScope.Containers, 2)

	_, err = repo.ResolveLocationScope(ctx, uuid.New())
	require.ErrorIs(t, err, pgx.ErrNoRows)
	_, err = repo.ResolveContainersScope(ctx, []uuid.UUID{containerA, uuid.New()})
	require.ErrorIs(t, err, pgx.ErrNoRows)
}

func TestDocumentationRepositoryListNewestFirstLimit50(t *testing.T) {
	pool := repositoryIntegrationPool(t)
	ctx := context.Background()
	repo := NewDocumentationRepo(pool)
	scopeJSON, err := json.Marshal(documentation.ScopeSnapshot{Type: "containers", Containers: []documentation.ContainerSnapshot{}, LooseItems: []documentation.ItemSnapshot{}})
	require.NoError(t, err)
	for index := 0; index < 51; index++ {
		id := uuid.New()
		_, err := pool.Exec(ctx, `
			INSERT INTO documentation_reports (
				id, filename, relative_path, format, language, scope_type,
				scope_snapshot, request_snapshot, content_type, size_bytes, created_at
			) VALUES ($1, $2, $2, 'pdf', 'ru', 'containers', $3, '{}'::jsonb, 'application/pdf', 1, $4)
		`, id, "documentation-report-"+id.String()+".pdf", scopeJSON, time.Date(2026, 1, 1, 0, 0, index, 0, time.UTC))
		require.NoError(t, err)
	}
	reports, err := repo.ListReports(ctx, 50)
	require.NoError(t, err)
	require.Len(t, reports, 50)
	for index := 1; index < len(reports); index++ {
		require.True(t, reports[index-1].CreatedAt.After(reports[index].CreatedAt))
	}
}
