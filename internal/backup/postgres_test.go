package backup

import (
	"errors"
	"os/exec"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPgConnParsesPostgresURL(t *testing.T) {
	conn, err := pgConn("postgres://app:secret@localhost:5432/inventory?sslmode=require")

	require.NoError(t, err)
	require.Equal(t, "inventory", conn.Database)
	require.Equal(t, []string{"--host", "localhost", "--username", "app", "--port", "5432"}, conn.Args)
	require.ElementsMatch(t, []string{"PGPASSWORD=secret", "PGSSLMODE=require"}, conn.Env)
}

func TestPgConnParsesEscapedDatabaseName(t *testing.T) {
	conn, err := pgConn("postgresql://app:secret@db.local/inventory%20prod")

	require.NoError(t, err)
	require.Equal(t, "inventory prod", conn.Database)
}

func TestPgConnRejectsIncompleteURLs(t *testing.T) {
	tests := []string{
		"http://app:secret@localhost/inventory",
		"postgres://localhost/inventory",
		"postgres://app:secret@/inventory",
		"postgres://app:secret@localhost/",
	}

	for _, input := range tests {
		t.Run(input, func(t *testing.T) {
			_, err := pgConn(input)
			require.Error(t, err)
		})
	}
}

func TestSanitizeCommandOutputPrefersStderrAndTrims(t *testing.T) {
	got := sanitizeCommandOutput(" stdout details ", " stderr details ", errors.New("run failed"))

	require.Equal(t, "stderr details", got)
}

func TestSanitizeCommandOutputFallsBackToRunError(t *testing.T) {
	got := sanitizeCommandOutput("", "", exec.ErrNotFound)

	require.Equal(t, exec.ErrNotFound.Error(), got)
}

func TestSanitizeCommandOutputTruncatesLongOutput(t *testing.T) {
	got := sanitizeCommandOutput("", strings.Repeat("x", 2100), errors.New("run failed"))

	require.Len(t, got, 2000)
}
