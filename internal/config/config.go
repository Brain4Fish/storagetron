package config

import (
	"log"
	"os"
)

type Config struct {
	DatabaseURL      string
	S3Endpoint       string
	S3PublicEndpoint string
	S3Bucket         string
	S3AccessKey      string
	S3SecretKey      string
}

func MustLoad() Config {
	cfg := Config{
		DatabaseURL:      os.Getenv("DATABASE_URL"),
		S3Endpoint:       os.Getenv("S3_ENDPOINT"),
		S3PublicEndpoint: os.Getenv("S3_PUBLIC_ENDPOINT"),
		S3Bucket:         os.Getenv("S3_BUCKET"),
		S3AccessKey:      os.Getenv("S3_ACCESS_KEY"),
		S3SecretKey:      os.Getenv("S3_SECRET_KEY"),
	}

	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL required")
	}
	if cfg.S3Endpoint == "" {
		log.Fatal("S3_ENDPOINT required")
	}
	if cfg.S3PublicEndpoint == "" {
		log.Fatal("S3_PUBLIC_ENDPOINT required")
	}
	if cfg.S3Bucket == "" {
		log.Fatal("S3_BUCKET required")
	}
	if cfg.S3AccessKey == "" {
		log.Fatal("S3_ACCESS_KEY required")
	}
	if cfg.S3SecretKey == "" {
		log.Fatal("S3_SECRET_KEY required")
	}

	return cfg
}
