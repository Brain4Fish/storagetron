package backup

import (
	"context"
	"encoding/json"
	"fmt"
)

type BackupTargetDriver interface {
	Upload(ctx context.Context, localFile string, remoteName string) (BackupObject, error)
	Download(ctx context.Context, backupID string, localFile string) error
	List(ctx context.Context) ([]BackupObject, error)
	Delete(ctx context.Context, backupID string) error
}

type DriverFactory interface {
	Type() TargetType
	New(ctx context.Context, config json.RawMessage) (BackupTargetDriver, error)
}

type DriverRegistry struct {
	factories map[TargetType]DriverFactory
}

func NewDriverRegistry(factories ...DriverFactory) *DriverRegistry {
	registry := &DriverRegistry{factories: make(map[TargetType]DriverFactory)}
	for _, factory := range factories {
		registry.factories[factory.Type()] = factory
	}
	return registry
}

func (r *DriverRegistry) DriverFor(ctx context.Context, target BackupTarget) (BackupTargetDriver, error) {
	factory, ok := r.factories[target.Type]
	if !ok {
		return nil, fmt.Errorf("backup target type %q is not supported", target.Type)
	}
	return factory.New(ctx, target.Configuration)
}
