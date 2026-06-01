package backup

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type TargetType string

const (
	TargetTypeSFTP   TargetType = "sftp"
	TargetTypeLocal  TargetType = "local"
	TargetTypeS3     TargetType = "s3"
	TargetTypeWebDAV TargetType = "webdav"
)

type JobStatus string

const (
	StatusPending   JobStatus = "pending"
	StatusRunning   JobStatus = "running"
	StatusCompleted JobStatus = "completed"
	StatusFailed    JobStatus = "failed"
)

type BackupTarget struct {
	ID            uuid.UUID       `json:"id"`
	Name          string          `json:"name"`
	Type          TargetType      `json:"type"`
	Enabled       bool            `json:"enabled"`
	Configuration json.RawMessage `json:"configuration"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
	DeletedAt     *time.Time      `json:"deleted_at,omitempty"`
}

type RetentionPolicy struct {
	KeepLastBackups int `json:"keep_last_backups"`
}

type BackupSchedule struct {
	ID             uuid.UUID       `json:"id"`
	TargetID       uuid.UUID       `json:"target_id"`
	Name           string          `json:"name"`
	CronExpression string          `json:"cron_expression"`
	Enabled        bool            `json:"enabled"`
	Retention      RetentionPolicy `json:"retention_policy"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
	DeletedAt      *time.Time      `json:"deleted_at,omitempty"`
}

type BackupTargetPatch struct {
	Name          string
	Enabled       bool
	Configuration json.RawMessage
}

type BackupSchedulePatch struct {
	TargetID       uuid.UUID
	Name           string
	CronExpression string
	Enabled        bool
	Retention      RetentionPolicy
}

type BackupRun struct {
	ID              uuid.UUID  `json:"id"`
	TargetID        uuid.UUID  `json:"target_id"`
	ScheduleID      *uuid.UUID `json:"schedule_id,omitempty"`
	Status          JobStatus  `json:"status"`
	Phase           string     `json:"phase"`
	ProgressPercent int        `json:"progress_percent"`
	StartedAt       *time.Time `json:"started_at,omitempty"`
	FinishedAt      *time.Time `json:"finished_at,omitempty"`
	SizeBytes       *int64     `json:"size_bytes,omitempty"`
	BackupPath      *string    `json:"backup_path,omitempty"`
	ErrorMessage    *string    `json:"error_message,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

type RestoreRun struct {
	ID               uuid.UUID  `json:"id"`
	TargetID         uuid.UUID  `json:"target_id"`
	BackupIdentifier string     `json:"backup_identifier"`
	Status           JobStatus  `json:"status"`
	Phase            string     `json:"phase"`
	ProgressPercent  int        `json:"progress_percent"`
	StartedAt        *time.Time `json:"started_at,omitempty"`
	FinishedAt       *time.Time `json:"finished_at,omitempty"`
	ErrorMessage     *string    `json:"error_message,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

type Checksum struct {
	Algorithm string `json:"algorithm"`
	Value     string `json:"value"`
}

type BackupManifest struct {
	Version            int                 `json:"version"`
	CreatedAt          time.Time           `json:"created_at"`
	ApplicationVersion string              `json:"application_version"`
	PostgresBackupFile string              `json:"postgres_backup_file"`
	MinIOBackupFile    string              `json:"minio_backup_file"`
	Checksums          map[string]Checksum `json:"checksums"`
}

type BackupObject struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Path      string    `json:"path"`
	SizeBytes int64     `json:"size_bytes"`
	CreatedAt time.Time `json:"created_at"`
	Checksum  string    `json:"checksum,omitempty"`
}
