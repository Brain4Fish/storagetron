package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

type observedRequest struct {
	method string
	route  string
	status int
}

type recordingMetrics struct {
	requests []observedRequest
}

func (m *recordingMetrics) ObserveRequest(method, route string, status int, duration time.Duration) {
	m.requests = append(m.requests, observedRequest{
		method: method,
		route:  route,
		status: status,
	})
}

func TestObservabilityMiddlewareRecordsExplicitStatus(t *testing.T) {
	metrics := &recordingMetrics{}
	router := chi.NewRouter()
	router.Use(ObservabilityMiddleware(zap.NewNop(), metrics))
	router.Post("/items", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
	})

	router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/items", nil))

	assertObservedRequest(t, metrics, observedRequest{
		method: http.MethodPost,
		route:  "/items",
		status: http.StatusCreated,
	})
}

func TestObservabilityMiddlewareDefaultsImplicitWriteToStatusOK(t *testing.T) {
	metrics := &recordingMetrics{}
	router := chi.NewRouter()
	router.Use(ObservabilityMiddleware(zap.NewNop(), metrics))
	router.Get("/version", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})

	router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/version", nil))

	assertObservedRequest(t, metrics, observedRequest{
		method: http.MethodGet,
		route:  "/version",
		status: http.StatusOK,
	})
}

func TestObservabilityMiddlewareUsesRoutePattern(t *testing.T) {
	metrics := &recordingMetrics{}
	router := chi.NewRouter()
	router.Use(ObservabilityMiddleware(zap.NewNop(), metrics))
	router.Route("/api", func(r chi.Router) {
		r.Get("/items/{id}", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNoContent)
		})
	})

	router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/items/9de58d03-6677-49e9-9135-88e1de6150cf", nil))

	assertObservedRequest(t, metrics, observedRequest{
		method: http.MethodGet,
		route:  "/api/items/{id}",
		status: http.StatusNoContent,
	})
}

func TestObservabilityMiddlewareSkipsMetricsEndpoint(t *testing.T) {
	metrics := &recordingMetrics{}
	router := chi.NewRouter()
	router.Use(ObservabilityMiddleware(zap.NewNop(), metrics))
	router.Get("/metrics", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("metrics"))
	})
	router.Get("/api/metrics", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("metrics"))
	})

	router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/metrics", nil))
	router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/metrics", nil))

	require.Empty(t, metrics.requests)
}

func assertObservedRequest(t *testing.T, metrics *recordingMetrics, want observedRequest) {
	t.Helper()

	require.Len(t, metrics.requests, 1)
	require.Equal(t, want, metrics.requests[0])
}
