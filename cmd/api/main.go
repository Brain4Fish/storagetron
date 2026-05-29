package main

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/Brain4Fish/storagetron/internal/config"
	"github.com/Brain4Fish/storagetron/internal/db"
	"github.com/Brain4Fish/storagetron/internal/handler"
	"github.com/Brain4Fish/storagetron/internal/repository"
	"github.com/Brain4Fish/storagetron/internal/service"
	"github.com/Brain4Fish/storagetron/internal/storage"
	"github.com/Brain4Fish/storagetron/internal/version"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"go.uber.org/zap"
)

func main() {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	cfg := config.MustLoad()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	dbConn := db.MustConnect(ctx, cfg.DatabaseURL)

	if err := db.RunMigrations(ctx, dbConn); err != nil {
		logger.Fatal("migrations failed", zap.Error(err))
	}

	s3Client := storage.NewS3(cfg)

	if err := s3Client.EnsureBucket(ctx); err != nil {
		logger.Fatal("failed to ensure bucket", zap.Error(err))
	}

	itemRepo := repository.NewItemRepo(dbConn)
	containerRepo := repository.NewContainerRepo(dbConn)
	locationRepo := repository.NewLocationRepo(dbConn)
	photoRepo := repository.NewPhotoRepo(dbConn)

	photoSvc := service.NewPhotoService(photoRepo, s3Client)
	itemSvc := service.NewItemService(itemRepo, photoSvc)
	containerSvc := service.NewContainerService(containerRepo, photoSvc)
	locationSvc := service.NewLocationService(locationRepo)

	itemHandler := handler.NewItemHandler(itemSvc, logger)
	containerHandler := handler.NewContainerHandler(containerSvc, logger)
	locationHandler := handler.NewLocationHandler(locationSvc, logger)
	photoHandler := handler.NewPhotoHandler(photoSvc, logger)
	scanHandler := handler.NewScanHandler(itemSvc, containerSvc, logger)

	r := chi.NewRouter()

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Accept", "Authorization", "Content-Type"},
		MaxAge:         300,
	}))

	r.Use(handler.LoggingMiddleware(logger))

	registerAPIRoutes := func(r chi.Router) {
		r.Get("/version", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(version.Info())
		})

		r.Route("/items", func(r chi.Router) {
			r.Post("/", itemHandler.Create)
			r.Get("/", itemHandler.List)
			r.Get("/{id}", itemHandler.Get)
			r.Patch("/{id}", itemHandler.Update)
			r.Delete("/{id}", itemHandler.Delete)
			r.Post("/{id}/photos", photoHandler.Upload)
			r.Delete("/{id}/photos/{photo_id}", photoHandler.DeleteItemPhoto)
		})

		r.Route("/containers", func(r chi.Router) {
			r.Post("/", containerHandler.Create)
			r.Get("/", containerHandler.List)
			r.Get("/{id}", containerHandler.Get)
			r.Patch("/{id}", containerHandler.Update)
			r.Post("/{id}/items", containerHandler.AddItem)
			r.Delete("/{id}/items/{item_id}", containerHandler.RemoveItem)
			r.Post("/{id}/photos", photoHandler.UploadContainer)
			r.Delete("/{id}/photos/{photo_id}", photoHandler.DeleteContainerPhoto)
		})

		r.Route("/locations", func(r chi.Router) {
			r.Post("/", locationHandler.Create)
			r.Get("/", locationHandler.List)
			r.Patch("/{id}", locationHandler.Update)
			r.Delete("/{id}", locationHandler.Delete)
		})

		r.Get("/scan/{code}", scanHandler.Scan)
	}

	registerAPIRoutes(r)
	r.Route("/api", registerAPIRoutes)

	r.Options("/*", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	srv := &http.Server{
		Addr:         ":8080",
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	logger.Info("server started", zap.String("addr", srv.Addr))
	if err := srv.ListenAndServe(); err != nil {
		logger.Fatal("server failed", zap.Error(err))
	}
}
