package backup

import (
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

type Metrics struct {
	BackupRuns      prometheus.Counter
	BackupFailures  prometheus.Counter
	BackupDuration  prometheus.Histogram
	BackupSizeBytes prometheus.Histogram
	RestoreRuns     prometheus.Counter
	RestoreFailures prometheus.Counter
}

func NewMetrics(reg prometheus.Registerer) *Metrics {
	m := &Metrics{
		BackupRuns: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "backup_runs_total",
			Help: "Total number of backup runs started.",
		}),
		BackupFailures: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "backup_failures_total",
			Help: "Total number of failed backup runs.",
		}),
		BackupDuration: prometheus.NewHistogram(prometheus.HistogramOpts{
			Name:    "backup_duration_seconds",
			Help:    "Backup run duration in seconds.",
			Buckets: prometheus.DefBuckets,
		}),
		BackupSizeBytes: prometheus.NewHistogram(prometheus.HistogramOpts{
			Name:    "backup_size_bytes",
			Help:    "Completed backup archive sizes in bytes.",
			Buckets: []float64{1024, 10240, 102400, 1048576, 10485760, 104857600, 1073741824, 10737418240},
		}),
		RestoreRuns: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "restore_runs_total",
			Help: "Total number of restore runs started.",
		}),
		RestoreFailures: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "restore_failures_total",
			Help: "Total number of failed restore runs.",
		}),
	}
	reg.MustRegister(m.BackupRuns, m.BackupFailures, m.BackupDuration, m.BackupSizeBytes, m.RestoreRuns, m.RestoreFailures)
	return m
}

func (m *Metrics) ObserveBackup(duration time.Duration, sizeBytes int64, failed bool) {
	if m == nil {
		return
	}
	m.BackupRuns.Inc()
	m.BackupDuration.Observe(duration.Seconds())
	if sizeBytes > 0 {
		m.BackupSizeBytes.Observe(float64(sizeBytes))
	}
	if failed {
		m.BackupFailures.Inc()
	}
}

func (m *Metrics) ObserveRestore(failed bool) {
	if m == nil {
		return
	}
	m.RestoreRuns.Inc()
	if failed {
		m.RestoreFailures.Inc()
	}
}
