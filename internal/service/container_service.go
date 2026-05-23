package service

import (
	"context"

	"github.com/Brain4Fish/storagetron/pkg/model"

	"github.com/google/uuid"
)

type ContainerRepository interface {
	Create(context.Context, model.Container, string) error
	List(context.Context) ([]model.Container, error)
	Get(context.Context, uuid.UUID) (model.Container, error)
	Update(context.Context, uuid.UUID, model.UpdateContainerRequest) error
	AddItem(context.Context, uuid.UUID, uuid.UUID) error
	RemoveItem(context.Context, uuid.UUID, uuid.UUID) error
	GetByLabelCode(context.Context, string) (model.Container, error)
	GetLabelByContainerID(context.Context, uuid.UUID) (*model.Label, error)
	GetLabelByCode(context.Context, string) (*model.Label, error)
}

type ContainerService struct {
	repo     ContainerRepository
	photoSvc *PhotoService
}

func NewContainerService(r ContainerRepository, photoSvc *PhotoService) *ContainerService {
	return &ContainerService{repo: r, photoSvc: photoSvc}
}

func (s *ContainerService) Create(ctx context.Context, req model.CreateContainerRequest) (model.Container, error) {
	container := model.Container{
		ID:          uuid.New(),
		Name:        req.Name,
		Description: req.Description,
		LocationID:  req.LocationID,
	}
	if err := s.repo.Create(ctx, container, req.LabelCode); err != nil {
		return model.Container{}, err
	}
	return s.repo.Get(ctx, container.ID)
}

func (s *ContainerService) List(ctx context.Context) ([]model.Container, error) {
	containers, err := s.repo.List(ctx)
	if err != nil {
		return nil, err
	}

	if s.photoSvc == nil {
		return containers, nil
	}

	for i := range containers {
		photos, err := s.photoSvc.ListByContainerID(ctx, containers[i].ID)
		if err != nil {
			return nil, err
		}
		containers[i].Photos = photos
	}

	return containers, nil
}

func (s *ContainerService) Get(ctx context.Context, id uuid.UUID) (model.Container, error) {
	container, err := s.repo.Get(ctx, id)
	if err != nil {
		return model.Container{}, err
	}

	if s.photoSvc == nil {
		return container, nil
	}

	photos, err := s.photoSvc.ListByContainerID(ctx, id)
	if err != nil {
		return model.Container{}, err
	}
	container.Photos = photos

	return container, nil
}

func (s *ContainerService) Update(ctx context.Context, id uuid.UUID, req model.UpdateContainerRequest) (model.Container, error) {
	if err := s.repo.Update(ctx, id, req); err != nil {
		return model.Container{}, err
	}
	return s.repo.Get(ctx, id)
}

func (s *ContainerService) AddItem(ctx context.Context, containerID, itemID uuid.UUID) error {
	return s.repo.AddItem(ctx, containerID, itemID)
}

func (s *ContainerService) RemoveItem(ctx context.Context, containerID, itemID uuid.UUID) error {
	return s.repo.RemoveItem(ctx, containerID, itemID)
}

func (s *ContainerService) GetByCode(ctx context.Context, code string) (model.Container, error) {
	return s.repo.GetByLabelCode(ctx, code)
}

func (s *ContainerService) GetLabel(ctx context.Context, containerID uuid.UUID) (*model.Label, error) {
	return s.repo.GetLabelByContainerID(ctx, containerID)
}

func (s *ContainerService) GetLabelByCode(ctx context.Context, code string) (*model.Label, error) {
	return s.repo.GetLabelByCode(ctx, code)
}
