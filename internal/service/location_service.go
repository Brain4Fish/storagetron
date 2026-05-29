package service

import (
	"context"

	"github.com/Brain4Fish/storagetron/pkg/model"
	"github.com/google/uuid"
)

type LocationRepository interface {
	Create(context.Context, model.Location) error
	List(context.Context) ([]model.Location, error)
	Get(context.Context, uuid.UUID) (model.Location, error)
	Update(context.Context, uuid.UUID, model.UpdateLocationRequest) error
	Delete(context.Context, uuid.UUID) error
}

type LocationService struct {
	repo LocationRepository
}

func NewLocationService(repo LocationRepository) *LocationService {
	return &LocationService{repo: repo}
}

func (s *LocationService) Create(ctx context.Context, req model.CreateLocationRequest) (model.Location, error) {
	location := model.Location{
		ID:      uuid.New(),
		Country: req.Country,
		City:    req.City,
		Room:    req.Room,
		Shelf:   req.Shelf,
	}
	if err := s.repo.Create(ctx, location); err != nil {
		return model.Location{}, err
	}
	return s.repo.Get(ctx, location.ID)
}

func (s *LocationService) List(ctx context.Context) ([]model.Location, error) {
	return s.repo.List(ctx)
}

func (s *LocationService) Get(ctx context.Context, id uuid.UUID) (model.Location, error) {
	return s.repo.Get(ctx, id)
}

func (s *LocationService) Update(ctx context.Context, id uuid.UUID, req model.UpdateLocationRequest) (model.Location, error) {
	if err := s.repo.Update(ctx, id, req); err != nil {
		return model.Location{}, err
	}
	return s.repo.Get(ctx, id)
}

func (s *LocationService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.repo.Delete(ctx, id)
}
