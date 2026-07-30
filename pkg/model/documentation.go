package model

import (
	"time"

	"github.com/google/uuid"
)

type DocumentationScope struct {
	Type         string      `json:"type"`
	LocationID   *uuid.UUID  `json:"location_id,omitempty"`
	ContainerIDs []uuid.UUID `json:"container_ids,omitempty"`
}

type DocumentationSummary struct {
	OwnerName            string `json:"owner_name"`
	Carrier              string `json:"carrier"`
	TransportOrderNumber string `json:"transport_order_number"`
	OriginCountry        string `json:"origin_country"`
	OriginAddress        string `json:"origin_address"`
	DestinationCountry   string `json:"destination_country"`
	DestinationAddress   string `json:"destination_address"`
	ShipmentDate         string `json:"shipment_date"`
}

type CreateDocumentationReportRequest struct {
	Scope    DocumentationScope    `json:"scope"`
	Format   string                `json:"format"`
	Language string                `json:"language"`
	Summary  *DocumentationSummary `json:"summary"`
}

type DocumentationReportScopeSummary struct {
	LocationName    string `json:"location_name,omitempty"`
	ContainersCount int    `json:"containers_count"`
}

type DocumentationReportMetadata struct {
	ID                   uuid.UUID                       `json:"id"`
	Filename             string                          `json:"filename"`
	Format               string                          `json:"format"`
	Language             string                          `json:"language"`
	ScopeType            string                          `json:"scope_type"`
	ScopeSummary         DocumentationReportScopeSummary `json:"scope_summary"`
	TransportOrderNumber string                          `json:"transport_order_number"`
	ContentType          string                          `json:"content_type"`
	SizeBytes            int64                           `json:"size_bytes"`
	CreatedAt            time.Time                       `json:"created_at"`
	DownloadURL          string                          `json:"download_url"`
}
