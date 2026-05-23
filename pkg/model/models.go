package model

import (
	"time"

	"github.com/google/uuid"
)

type Item struct {
	ID          uuid.UUID  `json:"id"`
	Name        string     `json:"name"`
	Description string     `json:"description,omitempty"`
	LocationID  *uuid.UUID `json:"location_id,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	Photos      []Photo    `json:"photos"`
}

type ItemListResponse struct {
	Items  []Item `json:"items"`
	Total  int    `json:"total"`
	Limit  int    `json:"limit"`
	Offset int    `json:"offset"`
}

type Container struct {
	ID          uuid.UUID  `json:"id"`
	Name        string     `json:"name"`
	Description string     `json:"description,omitempty"`
	LocationID  *uuid.UUID `json:"location_id,omitempty"`
	CreatedAt   time.Time  `json:"created_at,omitempty"`
	Items       []Item     `json:"items,omitempty"`
	ItemsCount  int        `json:"items_count,omitempty"`
	Photos      []Photo    `json:"photos,omitempty"`
}

type Location struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at,omitempty"`
}

type Photo struct {
	ID          uuid.UUID  `json:"id"`
	ItemID      *uuid.UUID `json:"item_id,omitempty"`
	ContainerID *uuid.UUID `json:"container_id,omitempty"`
	ObjectKey   string     `json:"object_key"`
	ContentType string     `json:"content_type,omitempty"`
	CreatedAt   time.Time  `json:"created_at,omitempty"`
	URL         string     `json:"url"`
}

type Label struct {
	Code        string     `json:"code"`
	ItemID      *uuid.UUID `json:"item_id,omitempty"`
	ContainerID *uuid.UUID `json:"container_id,omitempty"`
	CreatedAt   time.Time  `json:"created_at,omitempty"`
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
	Label     *Label     `json:"label,omitempty"`
}
