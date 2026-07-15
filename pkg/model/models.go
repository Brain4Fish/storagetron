package model

import (
	"time"

	"github.com/google/uuid"
)

type Item struct {
	ID                uuid.UUID  `json:"id"`
	Name              string     `json:"name"`
	Description       string     `json:"description,omitempty"`
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

type CreateContainerRequest struct {
	Name        string     `json:"name"`
	Description string     `json:"description"`
	LocationID  *uuid.UUID `json:"location_id"`
	LabelCode   string     `json:"label_code"`
}

type UpdateContainerRequest struct {
	Name        string     `json:"name"`
	Description string     `json:"description"`
	LocationID  *uuid.UUID `json:"location_id"`
}

type CreateItemRequest struct {
	Name        string     `json:"name"`
	Description string     `json:"description"`
	LocationID  *uuid.UUID `json:"location_id"`
	LabelCode   string     `json:"label_code"`
}

type UpdateItemRequest struct {
	Name        string     `json:"name"`
	Description string     `json:"description"`
	LocationID  *uuid.UUID `json:"location_id"`
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
