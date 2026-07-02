package service

import (
	"context"
	"errors"
	"strings"

	"github.com/Brain4Fish/storagetron/pkg/model"
	"github.com/google/uuid"
)

var (
	ErrInvalidLabelName  = errors.New("label name must be between 1 and 64 characters")
	ErrInvalidLabelColor = errors.New("invalid label color")
)

var labelColors = map[string]struct{}{
	"gray": {}, "red": {}, "orange": {}, "yellow": {},
	"green": {}, "blue": {}, "purple": {}, "pink": {},
}

type LabelRepository interface {
	List(context.Context) ([]model.Label, error)
	Get(context.Context, uuid.UUID) (model.Label, error)
	Create(context.Context, model.Label) (model.Label, error)
	Update(context.Context, uuid.UUID, model.UpdateLabelRequest) (model.Label, error)
	Delete(context.Context, uuid.UUID) error
}

type LabelService struct {
	repo LabelRepository
}

func NewLabelService(repo LabelRepository) *LabelService {
	return &LabelService{repo: repo}
}

func (s *LabelService) List(ctx context.Context) ([]model.Label, error) {
	return s.repo.List(ctx)
}

func (s *LabelService) Create(ctx context.Context, req model.CreateLabelRequest) (model.Label, error) {
	name, color, err := validateLabel(req.Name, req.Color)
	if err != nil {
		return model.Label{}, err
	}
	return s.repo.Create(ctx, model.Label{ID: uuid.New(), Name: name, Color: color})
}

func (s *LabelService) Update(ctx context.Context, id uuid.UUID, req model.UpdateLabelRequest) (model.Label, error) {
	name, color, err := validateLabel(req.Name, req.Color)
	if err != nil {
		return model.Label{}, err
	}
	req.Name = name
	req.Color = color
	return s.repo.Update(ctx, id, req)
}

func (s *LabelService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.repo.Delete(ctx, id)
}

func validateLabel(rawName, rawColor string) (string, string, error) {
	name := strings.TrimSpace(rawName)
	if len([]rune(name)) < 1 || len([]rune(name)) > 64 {
		return "", "", ErrInvalidLabelName
	}
	color := strings.TrimSpace(rawColor)
	if color == "" {
		color = "blue"
	}
	if _, ok := labelColors[color]; !ok {
		return "", "", ErrInvalidLabelColor
	}
	return name, color, nil
}
