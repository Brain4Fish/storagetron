package service

import (
	"context"

	"github.com/Brain4Fish/storagetron/pkg/model"

	"github.com/google/uuid"
)

type ItemRepo interface {
	Create(context.Context, model.Item, string) error
	List(context.Context) ([]model.Item, error)
	ListPage(context.Context, int, int) ([]model.Item, int, error)
	Get(context.Context, uuid.UUID) (model.Item, error)
	Update(context.Context, uuid.UUID, model.UpdateItemRequest) error
	Delete(context.Context, uuid.UUID) error
	GetByLabelCode(context.Context, string) (model.Item, error)
	GetLabelByCode(context.Context, string) (*model.Label, error)
}

type ItemService struct {
	repo     ItemRepo
	photoSvc *PhotoService
}

func NewItemService(r ItemRepo, photoSvc *PhotoService) *ItemService {
	return &ItemService{
		repo:     r,
		photoSvc: photoSvc,
	}
}

func (s *ItemService) Create(ctx context.Context, req model.CreateItemRequest) (model.Item, error) {
	item := model.Item{
		ID:          uuid.New(),
		Name:        req.Name,
		Description: req.Description,
		LocationID:  req.LocationID,
	}
	if err := s.repo.Create(ctx, item, req.LabelCode); err != nil {
		return model.Item{}, err
	}
	return s.repo.Get(ctx, item.ID)
}

func (s *ItemService) List(ctx context.Context) ([]model.Item, error) {
	items, err := s.repo.List(ctx)
	if err != nil {
		return nil, err
	}

	for i := range items {
		photos, err := s.photoSvc.ListByItemID(ctx, items[i].ID)
		if err != nil {
			return nil, err
		}
		items[i].Photos = photos
	}

	return items, nil
}

func (s *ItemService) ListPage(ctx context.Context, limit, offset int) (model.ItemListResponse, error) {
	items, total, err := s.repo.ListPage(ctx, limit, offset)
	if err != nil {
		return model.ItemListResponse{}, err
	}

	for i := range items {
		photos, err := s.photoSvc.ListByItemID(ctx, items[i].ID)
		if err != nil {
			return model.ItemListResponse{}, err
		}
		items[i].Photos = photos
	}

	return model.ItemListResponse{
		Items:  items,
		Total:  total,
		Limit:  limit,
		Offset: offset,
	}, nil
}

func (s *ItemService) Get(ctx context.Context, id uuid.UUID) (model.Item, error) {
	item, err := s.repo.Get(ctx, id)
	if err != nil {
		return model.Item{}, err
	}

	photos, err := s.photoSvc.ListByItemID(ctx, id)
	if err != nil {
		return model.Item{}, err
	}

	item.Photos = photos
	return item, nil
}

func (s *ItemService) Update(ctx context.Context, id uuid.UUID, req model.UpdateItemRequest) (model.Item, error) {
	if err := s.repo.Update(ctx, id, req); err != nil {
		return model.Item{}, err
	}
	return s.Get(ctx, id)
}

func (s *ItemService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.repo.Delete(ctx, id)
}

func (s *ItemService) GetByCode(ctx context.Context, code string) (model.Item, error) {
	return s.repo.GetByLabelCode(ctx, code)
}

func (s *ItemService) GetLabelByCode(ctx context.Context, code string) (*model.Label, error) {
	return s.repo.GetLabelByCode(ctx, code)
}
