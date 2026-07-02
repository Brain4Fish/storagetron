package service

import (
	"context"
	"testing"

	"github.com/Brain4Fish/storagetron/pkg/model"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestLabelServiceValidatesAndNormalizes(t *testing.T) {
	repo := &fakeLabelRepository{}
	svc := NewLabelService(repo)

	created, err := svc.Create(context.Background(), model.CreateLabelRequest{Name: "  Electronics  "})
	require.NoError(t, err)
	require.Equal(t, "Electronics", created.Name)
	require.Equal(t, "blue", created.Color)

	_, err = svc.Create(context.Background(), model.CreateLabelRequest{Name: "", Color: "blue"})
	require.ErrorIs(t, err, ErrInvalidLabelName)
	_, err = svc.Create(context.Background(), model.CreateLabelRequest{Name: "Tools", Color: "cyan"})
	require.ErrorIs(t, err, ErrInvalidLabelColor)
}

type fakeLabelRepository struct{}

func (r *fakeLabelRepository) List(context.Context) ([]model.Label, error) {
	return []model.Label{}, nil
}
func (r *fakeLabelRepository) Get(context.Context, uuid.UUID) (model.Label, error) {
	return model.Label{}, nil
}
func (r *fakeLabelRepository) Create(_ context.Context, label model.Label) (model.Label, error) {
	return label, nil
}
func (r *fakeLabelRepository) Update(_ context.Context, id uuid.UUID, req model.UpdateLabelRequest) (model.Label, error) {
	return model.Label{ID: id, Name: req.Name, Color: req.Color}, nil
}
func (r *fakeLabelRepository) Delete(context.Context, uuid.UUID) error { return nil }
