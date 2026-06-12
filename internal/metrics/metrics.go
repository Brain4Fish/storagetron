package metrics

import (
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
)

type HTTPMetrics struct {
	requests *prometheus.CounterVec
	duration *prometheus.HistogramVec
}

func NewHTTPMetrics(reg prometheus.Registerer) *HTTPMetrics {
	if reg == nil {
		reg = prometheus.DefaultRegisterer
	}

	m := &HTTPMetrics{
		requests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "storagetron_http_requests_total",
			Help: "Total number of HTTP requests handled by the API.",
		}, []string{"method", "route", "status"}),
		duration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name:    "storagetron_http_request_duration_seconds",
			Help:    "HTTP request duration in seconds",
			Buckets: prometheus.DefBuckets,
		}, []string{"method", "route", "status"}),
	}

	reg.MustRegister(m.requests, m.duration)
	return m
}

func (m *HTTPMetrics) ObserveRequest(method, route string, status int, duration time.Duration) {
	if m == nil {
		return
	}
	if route == "" {
		route = "unmatched"
	}
	if status == 0 {
		status = 200
	}

	statusLabel := strconv.Itoa(status)
	m.requests.WithLabelValues(method, route, statusLabel).Inc()
	m.duration.WithLabelValues(method, route, statusLabel).Observe(duration.Seconds())
}

func RegisterBuildInfo(reg prometheus.Registerer, version, commit, buildDate string) {
	if reg == nil {
		reg = prometheus.DefaultRegisterer
	}

	buildInfo := prometheus.NewGaugeVec(prometheus.GaugeOpts{
		Name: "storagetron_build_info",
		Help: "Build information for the Storagetron API. The metric value is always 1.",
	}, []string{"version", "commit", "build_date"})
	reg.MustRegister(buildInfo)
	buildInfo.WithLabelValues(version, commit, buildDate).Set(1)
}

func RegisterPostgresPoolStats(reg prometheus.Registerer, poolName string, pool *pgxpool.Pool) {
	if reg == nil {
		reg = prometheus.DefaultRegisterer
	}
	if poolName == "" {
		poolName = "default"
	}
	if pool == nil {
		return
	}

	labels := prometheus.Labels{"pool": poolName}
	reg.MustRegister(
		prometheus.NewGaugeFunc(prometheus.GaugeOpts{
			Name:        "storagetron_postgres_pool_acquired_connections",
			Help:        "Number of currently acquired Postgres pool connections.",
			ConstLabels: labels,
		}, func() float64 {
			return float64(pool.Stat().AcquiredConns())
		}),
		prometheus.NewGaugeFunc(prometheus.GaugeOpts{
			Name:        "storagetron_postgres_pool_idle_connections",
			Help:        "Number of currently idle Postgres pool connections.",
			ConstLabels: labels,
		}, func() float64 {
			return float64(pool.Stat().IdleConns())
		}),
		prometheus.NewGaugeFunc(prometheus.GaugeOpts{
			Name:        "storagetron_postgres_pool_total_connections",
			Help:        "Total number of Postgres pool connections.",
			ConstLabels: labels,
		}, func() float64 {
			return float64(pool.Stat().TotalConns())
		}),
		prometheus.NewCounterFunc(prometheus.CounterOpts{
			Name:        "storagetron_postgres_pool_acquire_count_total",
			Help:        "Cumulative number of successful Postgres pool connection acquires.",
			ConstLabels: labels,
		}, func() float64 {
			return float64(pool.Stat().AcquireCount())
		}),
		prometheus.NewCounterFunc(prometheus.CounterOpts{
			Name:        "storagetron_postgres_pool_acquire_duration_seconds_total",
			Help:        "Cumulative duration spent acquiring Postgres pool connections in seconds.",
			ConstLabels: labels,
		}, func() float64 {
			return pool.Stat().AcquireDuration().Seconds()
		}),
		prometheus.NewCounterFunc(prometheus.CounterOpts{
			Name:        "storagetron_postgres_pool_canceled_acquire_count_total",
			Help:        "Cumulative number of canceled Postgres pool connection acquires.",
			ConstLabels: labels,
		}, func() float64 {
			return float64(pool.Stat().CanceledAcquireCount())
		}),
	)
}
