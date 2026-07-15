package storage

import (
	"context"
	"io"
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
	awsCfg.RequestChecksumCalculation = aws.RequestChecksumCalculationWhenRequired

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

type ObjectInfo struct {
	Key          string
	Size         int64
	LastModified time.Time
}

type ObjectContent struct {
	Body          io.ReadCloser
	ContentType   string
	ContentLength int64
	ETag          string
	LastModified  time.Time
}

func (s *S3) ListObjects(ctx context.Context) ([]ObjectInfo, error) {
	paginator := s3.NewListObjectsV2Paginator(s.internalClient, &s3.ListObjectsV2Input{
		Bucket: &s.bucket,
	})

	var objects []ObjectInfo
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		for _, object := range page.Contents {
			if object.Key == nil {
				continue
			}
			objects = append(objects, ObjectInfo{
				Key:          *object.Key,
				Size:         aws.ToInt64(object.Size),
				LastModified: aws.ToTime(object.LastModified),
			})
		}
	}
	return objects, nil
}

func (s *S3) GetObject(ctx context.Context, key string) (io.ReadCloser, error) {
	object, err := s.OpenObject(ctx, key)
	if err != nil {
		return nil, err
	}
	return object.Body, nil
}

func (s *S3) OpenObject(ctx context.Context, key string) (ObjectContent, error) {
	out, err := s.internalClient.GetObject(ctx, &s3.GetObjectInput{
		Bucket: &s.bucket,
		Key:    &key,
	})
	if err != nil {
		return ObjectContent{}, err
	}

	contentLength := int64(-1)
	if out.ContentLength != nil {
		contentLength = *out.ContentLength
	}

	return ObjectContent{
		Body:          out.Body,
		ContentType:   aws.ToString(out.ContentType),
		ContentLength: contentLength,
		ETag:          aws.ToString(out.ETag),
		LastModified:  aws.ToTime(out.LastModified),
	}, nil
}

func (s *S3) PutObject(ctx context.Context, key string, body io.Reader, size int64, contentType string) error {
	input := &s3.PutObjectInput{
		Bucket:        &s.bucket,
		Key:           &key,
		Body:          body,
		ContentLength: &size,
	}
	if contentType != "" {
		input.ContentType = aws.String(contentType)
	}
	_, err := s.internalClient.PutObject(ctx, input)
	return err
}
