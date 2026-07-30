package repository

import (
	"context"
	"sort"
	"strings"

	documentation "github.com/Brain4Fish/storagetron/internal/documentation"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type DocumentationRepo struct {
	db *pgxpool.Pool
}

func NewDocumentationRepo(db *pgxpool.Pool) *DocumentationRepo {
	return &DocumentationRepo{db: db}
}

func (r *DocumentationRepo) ResolveLocationScope(ctx context.Context, locationID uuid.UUID) (documentation.ScopeSnapshot, error) {
	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{
		IsoLevel:   pgx.RepeatableRead,
		AccessMode: pgx.ReadOnly,
	})
	if err != nil {
		return documentation.ScopeSnapshot{}, err
	}
	defer tx.Rollback(ctx)

	location, err := getDocumentationLocation(ctx, tx, locationID)
	if err != nil {
		return documentation.ScopeSnapshot{}, err
	}
	containers, err := listDocumentationContainers(ctx, tx, "c.location_id = $1", locationID)
	if err != nil {
		return documentation.ScopeSnapshot{}, err
	}
	if err := hydrateDocumentationContainers(ctx, tx, containers); err != nil {
		return documentation.ScopeSnapshot{}, err
	}
	looseItems, err := listDocumentationLooseItems(ctx, tx, locationID)
	if err != nil {
		return documentation.ScopeSnapshot{}, err
	}
	if err := hydrateDocumentationItemLabels(ctx, tx, looseItems); err != nil {
		return documentation.ScopeSnapshot{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return documentation.ScopeSnapshot{}, err
	}
	return documentation.ScopeSnapshot{
		Type:       "location",
		Location:   &location,
		Containers: containers,
		LooseItems: looseItems,
	}, nil
}

func (r *DocumentationRepo) ResolveContainersScope(ctx context.Context, ids []uuid.UUID) (documentation.ScopeSnapshot, error) {
	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{
		IsoLevel:   pgx.RepeatableRead,
		AccessMode: pgx.ReadOnly,
	})
	if err != nil {
		return documentation.ScopeSnapshot{}, err
	}
	defer tx.Rollback(ctx)

	containers, err := listDocumentationContainers(ctx, tx, "c.id = ANY($1)", ids)
	if err != nil {
		return documentation.ScopeSnapshot{}, err
	}
	if len(containers) != len(ids) {
		return documentation.ScopeSnapshot{}, pgx.ErrNoRows
	}
	if err := hydrateDocumentationContainers(ctx, tx, containers); err != nil {
		return documentation.ScopeSnapshot{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return documentation.ScopeSnapshot{}, err
	}
	return documentation.ScopeSnapshot{
		Type:       "containers",
		Containers: containers,
		LooseItems: []documentation.ItemSnapshot{},
	}, nil
}

func (r *DocumentationRepo) InsertReport(ctx context.Context, report *documentation.ReportRecord) error {
	return r.db.QueryRow(ctx, `
		INSERT INTO documentation_reports (
			id, filename, relative_path, format, language, scope_type,
			scope_snapshot, request_snapshot, transport_order_number,
			content_type, size_bytes
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING created_at
	`, report.ID, report.Filename, report.RelativePath, report.Format, report.Language,
		report.ScopeType, report.ScopeSnapshot, report.RequestSnapshot,
		report.TransportOrderNumber, report.ContentType, report.SizeBytes,
	).Scan(&report.CreatedAt)
}

func (r *DocumentationRepo) ListReports(ctx context.Context, limit int) ([]documentation.ReportRecord, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			id, filename, relative_path, format, language, scope_type,
			scope_snapshot, request_snapshot, transport_order_number,
			content_type, size_bytes, created_at
		FROM documentation_reports
		ORDER BY created_at DESC, id DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	reports := make([]documentation.ReportRecord, 0)
	for rows.Next() {
		var report documentation.ReportRecord
		if err := scanDocumentationReport(rows, &report); err != nil {
			return nil, err
		}
		reports = append(reports, report)
	}
	return reports, rows.Err()
}

func (r *DocumentationRepo) GetReport(ctx context.Context, id uuid.UUID) (documentation.ReportRecord, error) {
	var report documentation.ReportRecord
	err := scanDocumentationReport(r.db.QueryRow(ctx, `
		SELECT
			id, filename, relative_path, format, language, scope_type,
			scope_snapshot, request_snapshot, transport_order_number,
			content_type, size_bytes, created_at
		FROM documentation_reports
		WHERE id = $1
	`, id), &report)
	return report, err
}

func scanDocumentationReport(row scanner, report *documentation.ReportRecord) error {
	return row.Scan(
		&report.ID,
		&report.Filename,
		&report.RelativePath,
		&report.Format,
		&report.Language,
		&report.ScopeType,
		&report.ScopeSnapshot,
		&report.RequestSnapshot,
		&report.TransportOrderNumber,
		&report.ContentType,
		&report.SizeBytes,
		&report.CreatedAt,
	)
}

func getDocumentationLocation(ctx context.Context, tx pgx.Tx, id uuid.UUID) (documentation.LocationSnapshot, error) {
	var location documentation.LocationSnapshot
	err := tx.QueryRow(ctx, `
		SELECT id, name, country, city, room, shelf
		FROM locations
		WHERE id = $1
	`, id).Scan(
		&location.ID,
		&location.Name,
		&location.Country,
		&location.City,
		&location.Room,
		&location.Shelf,
	)
	return location, err
}

func listDocumentationContainers(ctx context.Context, tx pgx.Tx, predicate string, argument any) ([]documentation.ContainerSnapshot, error) {
	rows, err := tx.Query(ctx, `
		SELECT
			c.id, c.name, COALESCE(c.description, ''), c.package_code,
			c.gross_weight_kg, c.volume_m3, c.estimated_value, c.value_currency,
			c.source_language
		FROM containers c
		WHERE `+predicate, argument)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	containers := make([]documentation.ContainerSnapshot, 0)
	for rows.Next() {
		var container documentation.ContainerSnapshot
		if err := rows.Scan(
			&container.ID,
			&container.Name,
			&container.Description,
			&container.PackageCode,
			&container.GrossWeightKg,
			&container.VolumeM3,
			&container.EstimatedValue,
			&container.ValueCurrency,
			&container.SourceLanguage,
		); err != nil {
			return nil, err
		}
		container.Labels = []string{}
		container.Items = []documentation.ItemSnapshot{}
		containers = append(containers, container)
	}
	return containers, rows.Err()
}

func hydrateDocumentationContainers(ctx context.Context, tx pgx.Tx, containers []documentation.ContainerSnapshot) error {
	sort.Slice(containers, func(i, j int) bool {
		left := strings.ToLower(containers[i].PackageID())
		right := strings.ToLower(containers[j].PackageID())
		if left == right {
			return containers[i].ID.String() < containers[j].ID.String()
		}
		return left < right
	})
	ids := make([]uuid.UUID, 0, len(containers))
	indexByID := make(map[uuid.UUID]int, len(containers))
	for index := range containers {
		ids = append(ids, containers[index].ID)
		indexByID[containers[index].ID] = index
	}
	if len(ids) == 0 {
		return nil
	}

	containerLabels, err := listDocumentationLabels(ctx, tx, "container_labels", "container_id", ids)
	if err != nil {
		return err
	}
	for index := range containers {
		containers[index].Labels = containerLabels[containers[index].ID]
	}

	candidates, err := listDocumentationContainerItemCandidates(ctx, tx, ids)
	if err != nil {
		return err
	}
	sort.Slice(candidates, func(i, j int) bool {
		leftRank := indexByID[candidates[i].containerID]
		rightRank := indexByID[candidates[j].containerID]
		if leftRank != rightRank {
			return leftRank < rightRank
		}
		leftName := strings.ToLower(candidates[i].item.Name)
		rightName := strings.ToLower(candidates[j].item.Name)
		if leftName == rightName {
			return candidates[i].item.ID.String() < candidates[j].item.ID.String()
		}
		return leftName < rightName
	})
	seen := make(map[uuid.UUID]struct{}, len(candidates))
	items := make([]documentation.ItemSnapshot, 0, len(candidates))
	ownerByItemID := make(map[uuid.UUID]uuid.UUID, len(candidates))
	for _, candidate := range candidates {
		if _, exists := seen[candidate.item.ID]; exists {
			continue
		}
		seen[candidate.item.ID] = struct{}{}
		items = append(items, candidate.item)
		ownerByItemID[candidate.item.ID] = candidate.containerID
	}
	if err := hydrateDocumentationItemLabels(ctx, tx, items); err != nil {
		return err
	}
	for _, item := range items {
		containerID := ownerByItemID[item.ID]
		index := indexByID[containerID]
		containers[index].Items = append(containers[index].Items, item)
	}
	return nil
}

type documentationItemCandidate struct {
	containerID uuid.UUID
	item        documentation.ItemSnapshot
}

func listDocumentationContainerItemCandidates(ctx context.Context, tx pgx.Tx, containerIDs []uuid.UUID) ([]documentationItemCandidate, error) {
	rows, err := tx.Query(ctx, `
		SELECT
			ic.container_id,
			i.id, i.name, COALESCE(i.description, ''), i.quantity, i.category,
			i.acquisition_year, i.condition, i.serial_number, i.estimated_value,
			i.value_currency, i.source_language
		FROM item_container ic
		JOIN items i ON i.id = ic.item_id
		WHERE ic.container_id = ANY($1)
	`, containerIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	candidates := make([]documentationItemCandidate, 0)
	for rows.Next() {
		var candidate documentationItemCandidate
		if err := scanDocumentationItem(rows, &candidate.containerID, &candidate.item); err != nil {
			return nil, err
		}
		candidates = append(candidates, candidate)
	}
	return candidates, rows.Err()
}

func listDocumentationLooseItems(ctx context.Context, tx pgx.Tx, locationID uuid.UUID) ([]documentation.ItemSnapshot, error) {
	rows, err := tx.Query(ctx, `
		SELECT
			i.id, i.name, COALESCE(i.description, ''), i.quantity, i.category,
			i.acquisition_year, i.condition, i.serial_number, i.estimated_value,
			i.value_currency, i.source_language
		FROM items i
		WHERE i.location_id = $1
		  AND NOT EXISTS (
			SELECT 1 FROM item_container ic WHERE ic.item_id = i.id
		  )
	`, locationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]documentation.ItemSnapshot, 0)
	for rows.Next() {
		var item documentation.ItemSnapshot
		if err := scanDocumentationItem(rows, nil, &item); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func scanDocumentationItem(row scanner, containerID *uuid.UUID, item *documentation.ItemSnapshot) error {
	destinations := make([]any, 0, 12)
	if containerID != nil {
		destinations = append(destinations, containerID)
	}
	destinations = append(destinations,
		&item.ID,
		&item.Name,
		&item.Description,
		&item.Quantity,
		&item.Category,
		&item.AcquisitionYear,
		&item.Condition,
		&item.SerialNumber,
		&item.EstimatedValue,
		&item.ValueCurrency,
		&item.SourceLanguage,
	)
	item.Labels = []string{}
	return row.Scan(destinations...)
}

func hydrateDocumentationItemLabels(ctx context.Context, tx pgx.Tx, items []documentation.ItemSnapshot) error {
	ids := make([]uuid.UUID, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.ID)
	}
	labels, err := listDocumentationLabels(ctx, tx, "item_labels", "item_id", ids)
	if err != nil {
		return err
	}
	for index := range items {
		items[index].Labels = labels[items[index].ID]
	}
	return nil
}

func listDocumentationLabels(ctx context.Context, tx pgx.Tx, joinTable, ownerColumn string, ids []uuid.UUID) (map[uuid.UUID][]string, error) {
	result := make(map[uuid.UUID][]string, len(ids))
	for _, id := range ids {
		result[id] = []string{}
	}
	if len(ids) == 0 {
		return result, nil
	}
	rows, err := tx.Query(ctx, `
		SELECT relation.`+ownerColumn+`, label.name
		FROM `+joinTable+` relation
		JOIN labels label ON label.id = relation.label_id
		WHERE relation.`+ownerColumn+` = ANY($1)
		ORDER BY relation.`+ownerColumn+`, lower(label.name), label.id
	`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var ownerID uuid.UUID
		var name string
		if err := rows.Scan(&ownerID, &name); err != nil {
			return nil, err
		}
		result[ownerID] = append(result[ownerID], name)
	}
	return result, rows.Err()
}
