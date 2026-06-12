package backup

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNewSecretBoxRejectsEmptyKey(t *testing.T) {
	_, err := NewSecretBox("  ")
	require.Error(t, err)
	require.Contains(t, err.Error(), "backup secret key is required")
}

func TestSecretBoxEncryptDecryptAndRedactConfig(t *testing.T) {
	box, err := NewSecretBox("development-test-key")
	require.NoError(t, err)

	raw := json.RawMessage(`{
		"host": "nas.local",
		"password": "secret-password",
		"nested": {
			"private_key": "secret-key",
			"public": "visible"
		},
		"tokens": [
			{"access_key": "access-secret"}
		]
	}`)

	encrypted, err := box.EncryptConfig(raw)
	require.NoError(t, err)
	require.NotContains(t, string(encrypted), "secret-password")
	require.NotContains(t, string(encrypted), "secret-key")
	require.NotContains(t, string(encrypted), "access-secret")
	require.Contains(t, string(encrypted), encryptedPrefix)

	decrypted, err := box.DecryptConfig(encrypted)
	require.NoError(t, err)
	require.JSONEq(t, string(raw), string(decrypted))

	redacted := box.RedactConfig(decrypted)
	require.NotContains(t, string(redacted), "secret-password")
	require.Contains(t, string(redacted), "********")
	require.Contains(t, string(redacted), "visible")
}

func TestSecretBoxEncryptionIsIdempotentForEncryptedValues(t *testing.T) {
	box, err := NewSecretBox("development-test-key")
	require.NoError(t, err)

	encrypted, err := box.EncryptConfig(json.RawMessage(`{"password":"secret"}`))
	require.NoError(t, err)

	encryptedAgain, err := box.EncryptConfig(encrypted)
	require.NoError(t, err)
	require.JSONEq(t, string(encrypted), string(encryptedAgain))
}

func TestSecretBoxDecryptRejectsMalformedCiphertext(t *testing.T) {
	box, err := NewSecretBox("development-test-key")
	require.NoError(t, err)

	_, err = box.DecryptConfig(json.RawMessage(`{"password":"enc:v1:not-valid"}`))
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid encrypted target credential")
}
