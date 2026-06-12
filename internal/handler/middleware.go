package handler

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"go.uber.org/zap"
)

type RequestMetrics interface {
	ObserveRequest(method, route string, status int, duration time.Duration)
}

func LoggingMiddleware(logger *zap.Logger) func(http.Handler) http.Handler {
	return ObservabilityMiddleware(logger, nil)
}

func ObservabilityMiddleware(logger *zap.Logger, metrics RequestMetrics) func(http.Handler) http.Handler {
	if logger == nil {
		logger = zap.NewNop()
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := chimiddleware.NewWrapResponseWriter(w, r.ProtoMajor)

			next.ServeHTTP(ww, r)

			duration := time.Since(start)
			status := ww.Status()
			if status == 0 {
				status = http.StatusOK
			}
			route := routePattern(r)
			if metrics != nil && !skipRequestMetrics(r.URL.Path) {
				metrics.ObserveRequest(r.Method, route, status, duration)
			}
			logger.Info("request",
				zap.String("method", r.Method),
				zap.String("path", r.URL.Path),
				zap.String("route", route),
				zap.Int("status", status),
				zap.Duration("duration", duration),
				zap.String("remote", r.RemoteAddr),
			)
		})
	}
}

func routePattern(r *http.Request) string {
	if routeCtx := chi.RouteContext(r.Context()); routeCtx != nil {
		if pattern := routeCtx.RoutePattern(); pattern != "" {
			return pattern
		}
	}
	return "unmatched"
}

func skipRequestMetrics(path string) bool {
	return path == "/metrics" || strings.HasSuffix(path, "/metrics")
}
