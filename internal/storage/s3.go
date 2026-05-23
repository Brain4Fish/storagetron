package storage

import (
	"context"
	"time"

	"github.com/Brain4Fish/storagetron/internal/config"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type S3 struct {
	internalClient *s3.Client // for bucket ops
	publicClient   *s3.Client // for presign
	bucket         string
}

func NewS3(cfg config.Config) *S3 {
	awsCfg, err := awsconfig.LoadDefaultConfig(context.TODO(),
		awsconfig.WithRegion("us-east-1"),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(cfg.S3AccessKey, cfg.S3SecretKey, ""),
		),
	)
	if err != nil {
		panic(err)
	}

	internalClient := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(cfg.S3Endpoint) // minio:9000
		o.UsePathStyle = true
	})

	publicClient := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(cfg.S3PublicEndpoint) // localhost:9005
		o.UsePathStyle = true
	})

	return &S3{
		internalClient: internalClient,
		publicClient:   publicClient,
		bucket:         cfg.S3Bucket,
	}
}

func (s *S3) EnsureBucket(ctx context.Context) error {
	_, err := s.internalClient.HeadBucket(ctx, &s3.HeadBucketInput{
		Bucket: &s.bucket,
	})
	if err == nil {
		return nil
	}

	_, err = s.internalClient.CreateBucket(ctx, &s3.CreateBucketInput{
		Bucket: &s.bucket,
	})
	return err
}

func (s *S3) PresignPut(ctx context.Context, key string, contentType string) (string, error) {
	ps := s3.NewPresignClient(s.publicClient)

	req, err := ps.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      &s.bucket,
		Key:         &key,
		ContentType: aws.String(contentType),
	}, s3.WithPresignExpires(5*time.Minute))
	if err != nil {
		return "", err
	}

	return req.URL, nil
}

func (s *S3) PresignGet(ctx context.Context, key string) (string, error) {
	ps := s3.NewPresignClient(s.publicClient)

	req, err := ps.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: &s.bucket,
		Key:    &key,
	}, s3.WithPresignExpires(24*time.Hour))
	if err != nil {
		return "", err
	}

	return req.URL, nil
}

func (s *S3) Delete(ctx context.Context, key string) error {
	_, err := s.internalClient.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: &s.bucket,
		Key:    &key,
	})
	return err
}
