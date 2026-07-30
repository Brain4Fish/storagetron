package config

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDocumentationReportsDirDefaultAndOverride(t *testing.T) {
	t.Setenv("DOCUMENTATION_REPORTS_DIR", "")
	require.Equal(t, "./data/reports", envOrDefault("DOCUMENTATION_REPORTS_DIR", "./data/reports"))
	t.Setenv("DOCUMENTATION_REPORTS_DIR", "/persistent/reports")
	require.Equal(t, "/persistent/reports", envOrDefault("DOCUMENTATION_REPORTS_DIR", "./data/reports"))
}
