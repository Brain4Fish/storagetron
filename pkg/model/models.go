package model

import (
	"bytes"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Item struct {
	ID                uuid.UUID  `json:"id"`
	Name              string     `json:"name"`
	Description       string     `json:"description,omitempty"`
	Quantity          int        `json:"quantity"`
	Category          string     `json:"category"`
	AcquisitionYear   *int16     `json:"acquisition_year"`
	Condition         string     `json:"condition"`
	SerialNumber      string     `json:"serial_number"`
	EstimatedValue    *float64   `json:"estimated_value"`
	ValueCurrency     *string    `json:"value_currency"`
	SourceLanguage    string     `json:"source_language"`
	LocationID        *uuid.UUID `json:"location_id,omitempty"`
	Location          *Location  `json:"location,omitempty"`
	InheritedLocation *Location  `json:"inherited_location,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
	Photos            []Photo    `json:"photos"`
	Labels            []Label    `json:"labels"`
}

type ItemListResponse struct {
	Items  []Item `json:"items"`
	Total  int    `json:"total"`
	Limit  int    `json:"limit"`
	Offset int    `json:"offset"`
}

type Container struct {
	ID              uuid.UUID  `json:"id"`
	Name            string     `json:"name"`
	Description     string     `json:"description,omitempty"`
	PackageCode     string     `json:"package_code"`
	GrossWeightKg   *float64   `json:"gross_weight_kg"`
	VolumeM3        *float64   `json:"volume_m3"`
	EstimatedValue  *float64   `json:"estimated_value"`
	ValueCurrency   *string    `json:"value_currency"`
	SourceLanguage  string     `json:"source_language"`
	LocationID      *uuid.UUID `json:"location_id,omitempty"`
	Location        *Location  `json:"location,omitempty"`
	CreatedAt       time.Time  `json:"created_at,omitempty"`
	Items           []Item     `json:"items,omitempty"`
	ItemsCount      int        `json:"items_count,omitempty"`
	Photos          []Photo    `json:"photos,omitempty"`
	Labels          []Label    `json:"labels"`
	InheritedLabels []Label    `json:"inherited_labels"`
}

type Location struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Country   string    `json:"country"`
	City      string    `json:"city"`
	Room      string    `json:"room"`
	Shelf     string    `json:"shelf"`
	CreatedAt time.Time `json:"created_at,omitempty"`
}

type CreateLocationRequest struct {
	Country string `json:"country"`
	City    string `json:"city"`
	Room    string `json:"room"`
	Shelf   string `json:"shelf"`
}

type UpdateLocationRequest struct {
	Country string `json:"country"`
	City    string `json:"city"`
	Room    string `json:"room"`
	Shelf   string `json:"shelf"`
}

type Photo struct {
	ID          uuid.UUID  `json:"id"`
	ItemID      *uuid.UUID `json:"item_id,omitempty"`
	ContainerID *uuid.UUID `json:"container_id,omitempty"`
	ObjectKey   string     `json:"object_key"`
	ContentType string     `json:"content_type,omitempty"`
	CreatedAt   time.Time  `json:"created_at,omitempty"`
	URL         string     `json:"url"`
	ContentURL  string     `json:"content_url"`
}

type ScanLabel struct {
	Code        string     `json:"code"`
	ItemID      *uuid.UUID `json:"item_id,omitempty"`
	ContainerID *uuid.UUID `json:"container_id,omitempty"`
	CreatedAt   time.Time  `json:"created_at,omitempty"`
}

type Label struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Color     string    `json:"color"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type CreateLabelRequest struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

type UpdateLabelRequest struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

type AddItemToContainerRequest struct {
	ItemID uuid.UUID `json:"item_id"`
}

// Optional distinguishes an omitted JSON field from an explicit null value.
// Value is nil for JSON null and Set is false when the field was not present.
type Optional[T any] struct {
	Set   bool
	Value *T
}

func (o *Optional[T]) UnmarshalJSON(data []byte) error {
	o.Set = true
	if bytes.Equal(bytes.TrimSpace(data), []byte("null")) {
		o.Value = nil
		return nil
	}

	var value T
	if err := json.Unmarshal(data, &value); err != nil {
		return err
	}
	o.Value = &value
	return nil
}

type CreateContainerRequest struct {
	Name           string     `json:"name"`
	Description    string     `json:"description"`
	LocationID     *uuid.UUID `json:"location_id"`
	LabelCode      string     `json:"label_code"`
	PackageCode    string     `json:"package_code"`
	GrossWeightKg  *float64   `json:"gross_weight_kg"`
	VolumeM3       *float64   `json:"volume_m3"`
	EstimatedValue *float64   `json:"estimated_value"`
	ValueCurrency  *string    `json:"value_currency"`
}

type UpdateContainerRequest struct {
	Name           string            `json:"name"`
	Description    string            `json:"description"`
	LocationID     *uuid.UUID        `json:"location_id"`
	PackageCode    Optional[string]  `json:"package_code"`
	GrossWeightKg  Optional[float64] `json:"gross_weight_kg"`
	VolumeM3       Optional[float64] `json:"volume_m3"`
	EstimatedValue Optional[float64] `json:"estimated_value"`
	ValueCurrency  Optional[string]  `json:"value_currency"`
}

type CreateItemRequest struct {
	Name            string     `json:"name"`
	Description     string     `json:"description"`
	LocationID      *uuid.UUID `json:"location_id"`
	LabelCode       string     `json:"label_code"`
	Quantity        *int       `json:"quantity"`
	Category        string     `json:"category"`
	AcquisitionYear *int16     `json:"acquisition_year"`
	Condition       *string    `json:"condition"`
	SerialNumber    string     `json:"serial_number"`
	EstimatedValue  *float64   `json:"estimated_value"`
	ValueCurrency   *string    `json:"value_currency"`
}

type UpdateItemRequest struct {
	Name            string            `json:"name"`
	Description     string            `json:"description"`
	LocationID      *uuid.UUID        `json:"location_id"`
	Quantity        Optional[int]     `json:"quantity"`
	Category        Optional[string]  `json:"category"`
	AcquisitionYear Optional[int16]   `json:"acquisition_year"`
	Condition       Optional[string]  `json:"condition"`
	SerialNumber    Optional[string]  `json:"serial_number"`
	EstimatedValue  Optional[float64] `json:"estimated_value"`
	ValueCurrency   Optional[string]  `json:"value_currency"`
}

type CreatePhotoRequest struct {
	FileName    string `json:"file_name"`
	ContentType string `json:"content_type"`
}

type CreatePhotoResponse struct {
	PhotoID   uuid.UUID `json:"photo_id"`
	ObjectKey string    `json:"object_key"`
	UploadURL string    `json:"upload_url"`
}

type ScanResult struct {
	Type      string     `json:"type"`
	Item      *Item      `json:"item,omitempty"`
	Container *Container `json:"container,omitempty"`
	Photos    []Photo    `json:"photos,omitempty"`
	Label     *ScanLabel `json:"label,omitempty"`
}
