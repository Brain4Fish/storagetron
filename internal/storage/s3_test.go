package storage

import (
	"testing"

	"github.com/Brain4Fish/storagetron/internal/config"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/stretchr/testify/require"
)

func TestNewS3UsesRequiredOnlyRequestChecksums(t *testing.T) {
	client := NewS3(config.Config{
		S3Endpoint:       "http://minio:9000",
		S3PublicEndpoint: "https://minio.example.com",
		S3Bucket:         "inventory",
		S3AccessKey:      "minio",
		S3SecretKey:      "secret",
	})

	require.Equal(t, aws.RequestChecksumCalculationWhenRequired, client.internalClient.Options().RequestChecksumCalculation)
	require.Equal(t, aws.RequestChecksumCalculationWhenRequired, client.publicClient.Options().RequestChecksumCalculation)
}
