package backup

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"time"
)

type PostgresTools struct {
	DatabaseURL string
	Timeout     time.Duration
}

func (p PostgresTools) Dump(ctx context.Context, destination string) error {
	conn, err := pgConn(p.DatabaseURL)
	if err != nil {
		return err
	}
	args := append([]string{
		"--format=custom",
		"--exclude-table-data=backup_runs",
		"--exclude-table-data=restore_runs",
		"--file",
		destination,
	}, conn.Args...)
	args = append(args, conn.Database)
	return p.run(ctx, "pg_dump", conn.Env, args...)
}

func (p PostgresTools) Restore(ctx context.Context, source string) error {
	conn, err := pgConn(p.DatabaseURL)
	if err != nil {
		return err
	}
	args := append([]string{"--clean", "--if-exists", "--no-owner"}, conn.Args...)
	args = append(args, "--dbname", conn.Database, source)
	return p.run(ctx, "pg_restore", conn.Env, args...)
}

func (p PostgresTools) run(ctx context.Context, binary string, env []string, args ...string) error {
	timeout := p.Timeout
	if timeout <= 0 {
		timeout = 30 * time.Minute
	}
	cmdCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(cmdCtx, binary, args...)
	cmd.Env = append(os.Environ(), env...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if errors.Is(cmdCtx.Err(), context.DeadlineExceeded) {
			return fmt.Errorf("%s timed out", binary)
		}
		if errors.Is(err, exec.ErrNotFound) {
			return fmt.Errorf("%s not found in PATH", binary)
		}
		return fmt.Errorf("%s failed: %s", binary, sanitizeCommandOutput(stdout.String(), stderr.String(), err))
	}
	return nil
}

type pgConnection struct {
	Env      []string
	Args     []string
	Database string
}

func pgConn(databaseURL string) (pgConnection, error) {
	parsed, err := url.Parse(databaseURL)
	if err != nil {
		return pgConnection{}, fmt.Errorf("parse database url: %w", err)
	}
	if parsed.Scheme != "postgres" && parsed.Scheme != "postgresql" {
		return pgConnection{}, errors.New("database url must use postgres or postgresql scheme")
	}
	password, _ := parsed.User.Password()
	username := parsed.User.Username()
	host := parsed.Hostname()
	port := parsed.Port()
	dbName := strings.TrimPrefix(parsed.EscapedPath(), "/")
	if decoded, err := url.PathUnescape(dbName); err == nil {
		dbName = decoded
	}
	if username == "" || host == "" || dbName == "" {
		return pgConnection{}, errors.New("database url must include username, host, and database name")
	}
	args := []string{"--host", host, "--username", username}
	if port != "" {
		args = append(args, "--port", port)
	}
	env := make([]string, 0, 2)
	if password != "" {
		env = append(env, "PGPASSWORD="+password)
	}
	if sslMode := parsed.Query().Get("sslmode"); sslMode != "" {
		env = append(env, "PGSSLMODE="+sslMode)
	}
	return pgConnection{Env: env, Args: args, Database: dbName}, nil
}

func sanitizeCommandOutput(stdout, stderr string, runErr error) string {
	clean := strings.TrimSpace(stderr)
	if clean == "" {
		clean = strings.TrimSpace(stdout)
	}
	if clean == "" {
		return runErr.Error()
	}
	if len(clean) > 2000 {
		clean = clean[:2000]
	}
	return clean
}
