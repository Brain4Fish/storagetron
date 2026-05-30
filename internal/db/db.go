package db

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/juju/zaputil/zapctx"
	"go.uber.org/zap"
)

func MustConnect(ctx context.Context, url string) *pgxpool.Pool {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		panic(err)
	}

	cfg.MaxConns = 10

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		panic(err)
	}

	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	var lastErr error
	for {
		ctxPing, cancel := context.WithTimeout(ctx, 5*time.Second)
		lastErr = pool.Ping(ctxPing)
		cancel()
		if lastErr == nil {
			return pool
		}

		select {
		case <-ctx.Done():
			pool.Close()
			panic(fmt.Errorf("database connection failed: %w", lastErr))
		case <-ticker.C:
		}
	}
}

func RunMigrations(ctx context.Context, db *pgxpool.Pool) error {
	_, err := db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			filename TEXT PRIMARY KEY,
			applied_at TIMESTAMP DEFAULT now()
		)
	`)
	if err != nil {
		return err
	}

	files, err := filepath.Glob("migrations/*.sql")
	if err != nil {
		return err
	}
	sort.Strings(files)

	for _, f := range files {
		var exists bool
		err := db.QueryRow(ctx,
			`SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE filename=$1)`,
			f,
		).Scan(&exists)
		if err != nil {
			return err
		}

		if exists {
			zapctx.Info(ctx, "skipping migration", zap.String("filename", f))
			continue
		}

		content, err := os.ReadFile(f)
		if err != nil {
			return err
		}

		ctxExec, cancel := context.WithTimeout(ctx, 10*time.Second)
		_, err = db.Exec(ctxExec, string(content))
		cancel()

		if err != nil {
			return fmt.Errorf("migration failed %s: %w", f, err)
		}

		_, err = db.Exec(ctx,
			`INSERT INTO schema_migrations (filename) VALUES ($1)`,
			f,
		)
		if err != nil {
			return err
		}
		zapctx.Info(ctx, "Applied migration", zap.String("filename", f))
	}

	return nil
}
