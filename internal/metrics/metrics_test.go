package metrics

import (
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
	"github.com/stretchr/testify/require"
)

func TestMetricsRegisterWithCustomRegistry(t *testing.T) {
	registry := prometheus.NewRegistry()
	httpMetrics := NewHTTPMetrics(registry)
	RegisterBuildInfo(registry, "1.2.3", "abc123", "2026-06-12T00:00:00Z")

	httpMetrics.ObserveRequest("GET", "/items/{id}", 200, 15*time.Millisecond)

	families, err := registry.Gather()
	require.NoError(t, err)

	assertMetricFamilyExists(t, families, "storagetron_http_requests_total")
	assertMetricFamilyExists(t, families, "storagetron_http_request_duration_seconds")
	assertMetricFamilyExists(t, families, "storagetron_build_info")
}

func TestHTTPMetricsDefaultsEmptyRouteAndStatus(t *testing.T) {
	registry := prometheus.NewRegistry()
	httpMetrics := NewHTTPMetrics(registry)

	httpMetrics.ObserveRequest("GET", "", 0, time.Millisecond)

	families, err := registry.Gather()
	require.NoError(t, err)

	requests := metricFamily(t, families, "storagetron_http_requests_total")
	require.Len(t, requests.Metric, 1)

	labels := labelsByName(requests.Metric[0])
	require.Equal(t, "unmatched", labels["route"])
	require.Equal(t, "200", labels["status"])
}

func assertMetricFamilyExists(t *testing.T, families []*dto.MetricFamily, name string) {
	t.Helper()

	_ = metricFamily(t, families, name)
}

func metricFamily(t *testing.T, families []*dto.MetricFamily, name string) *dto.MetricFamily {
	t.Helper()

	for _, family := range families {
		if family.GetName() == name {
			return family
		}
	}
	require.Failf(t, "metric family not found", "metric family %q not found", name)
	return nil
}

func labelsByName(metric *dto.Metric) map[string]string {
	labels := make(map[string]string, len(metric.Label))
	for _, label := range metric.Label {
		labels[label.GetName()] = label.GetValue()
	}
	return labels
}
