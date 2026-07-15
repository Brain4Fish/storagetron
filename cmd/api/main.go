package main

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	backupcore "github.com/Brain4Fish/storagetron/internal/backup"
	backuphttp "github.com/Brain4Fish/storagetron/internal/backup/httpapi"
	backupstore "github.com/Brain4Fish/storagetron/internal/backup/store"
	sftptarget "github.com/Brain4Fish/storagetron/internal/backup/target/sftp"
	"github.com/Brain4Fish/storagetron/internal/config"
	"github.com/Brain4Fish/storagetron/internal/db"
	"github.com/Brain4Fish/storagetron/internal/handler"
	appmetrics "github.com/Brain4Fish/storagetron/internal/metrics"
	"github.com/Brain4Fish/storagetron/internal/repository"
	"github.com/Brain4Fish/storagetron/internal/service"
	"github.com/Brain4Fish/storagetron/internal/storage"
	"github.com/Brain4Fish/storagetron/internal/version"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.uber.org/zap"
)

func main() {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	cfg := config.MustLoad()

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
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
	labelRepo := repository.NewLabelRepo(dbConn)
	photoRepo := repository.NewPhotoRepo(dbConn)
	backupRepo := backupstore.NewPostgres(dbConn)

	photoSvc := service.NewPhotoService(photoRepo, s3Client)
	itemSvc := service.NewItemService(itemRepo, photoSvc)
	containerSvc := service.NewContainerService(containerRepo, photoSvc)
	locationSvc := service.NewLocationService(locationRepo)
	labelSvc := service.NewLabelService(labelRepo)
	backupSecrets, err := backupcore.NewSecretBox(cfg.BackupSecretKey)
	if err != nil {
		logger.Fatal("backup secret initialization failed", zap.Error(err))
	}
	registerer := prometheus.DefaultRegisterer
	versionInfo := version.Info()
	httpMetrics := appmetrics.NewHTTPMetrics(registerer)
	appmetrics.RegisterBuildInfo(registerer, versionInfo.Version, versionInfo.Commit, versionInfo.Date)
	appmetrics.RegisterPostgresPoolStats(registerer, "main", dbConn)
	backupMetrics := backupcore.NewMetrics(registerer)
	backupRegistry := backupcore.NewDriverRegistry(sftptarget.NewFactory())
	backupSvc := backupcore.NewService(backupcore.ServiceConfig{
		Repository: backupRepo,
		Targets:    backupRegistry,
		Secrets:    backupSecrets,
		Postgres: backupcore.PostgresTools{
			DatabaseURL: cfg.DatabaseURL,
			Timeout:     30 * time.Minute,
		},
		Objects:    backupcore.NewS3ObjectStorage(s3Client),
		TempDir:    cfg.BackupTempDir,
		AppVersion: versionInfo.Version + " (" + versionInfo.Commit + ")",
		Metrics:    backupMetrics,
		Logger:     logger,
	})
	backupScheduler := backupcore.NewScheduler(backupRepo, logger)
	backupWorker := backupcore.NewWorker(backupRepo, backupSvc, 10*time.Second, 2*time.Hour, logger)
	backupHandler := backuphttp.NewHandler(backupRepo, backupSecrets, backupScheduler, logger)

	workerCtx, workerCancel := context.WithCancel(context.Background())
	defer workerCancel()
	if err := backupScheduler.Start(workerCtx); err != nil {
		logger.Fatal("backup scheduler failed to start", zap.Error(err))
	}
	go backupWorker.Run(workerCtx)

	itemHandler := handler.NewItemHandler(itemSvc, logger)
	containerHandler := handler.NewContainerHandler(containerSvc, logger)
	locationHandler := handler.NewLocationHandler(locationSvc, logger)
	labelHandler := handler.NewLabelHandler(labelSvc, logger)
	photoHandler := handler.NewPhotoHandler(photoSvc, logger)
	scanHandler := handler.NewScanHandler(itemSvc, containerSvc, logger)

	r := chi.NewRouter()

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Accept", "Authorization", "Content-Type"},
		MaxAge:         300,
	}))

	r.Use(handler.ObservabilityMiddleware(logger, httpMetrics))

	registerAPIRoutes := func(r chi.Router) {
		r.Handle("/metrics", promhttp.Handler())
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
			r.Put("/{id}/labels/{label_id}", itemHandler.AttachLabel)
			r.Delete("/{id}/labels/{label_id}", itemHandler.DetachLabel)
			r.Post("/{id}/photos", photoHandler.Upload)
			r.Delete("/{id}/photos/{photo_id}", photoHandler.DeleteItemPhoto)
		})

		r.Route("/containers", func(r chi.Router) {
			r.Post("/", containerHandler.Create)
			r.Get("/", containerHandler.List)
			r.Get("/{id}", containerHandler.Get)
			r.Patch("/{id}", containerHandler.Update)
			r.Delete("/{id}", containerHandler.Delete)
			r.Put("/{id}/labels/{label_id}", containerHandler.AttachLabel)
			r.Delete("/{id}/labels/{label_id}", containerHandler.DetachLabel)
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

		r.Get("/labels", labelHandler.List)
		r.Post("/labels", labelHandler.Create)
		r.Patch("/labels/{id}", labelHandler.Update)
		r.Delete("/labels/{id}", labelHandler.Delete)
		r.Get("/photos/{photo_id}/content", photoHandler.Content)

		r.Get("/scan/{code}", scanHandler.Scan)
		r.Route("/backup", backupHandler.Routes)
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
