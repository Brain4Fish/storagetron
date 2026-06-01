package backup

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
)

const encryptedPrefix = "enc:v1:"

type SecretBox struct {
	key []byte
}

func NewSecretBox(secret string) (*SecretBox, error) {
	if strings.TrimSpace(secret) == "" {
		return nil, errors.New("backup secret key is required to encrypt target credentials")
	}
	if decoded, err := base64.StdEncoding.DecodeString(secret); err == nil && len(decoded) == 32 {
		return &SecretBox{key: decoded}, nil
	}
	sum := sha256.Sum256([]byte(secret))
	return &SecretBox{key: sum[:]}, nil
}

func (b *SecretBox) EncryptConfig(raw json.RawMessage) (json.RawMessage, error) {
	return b.transformConfig(raw, b.encryptString)
}

func (b *SecretBox) DecryptConfig(raw json.RawMessage) (json.RawMessage, error) {
	return b.transformConfig(raw, b.decryptString)
}

func (b *SecretBox) RedactConfig(raw json.RawMessage) json.RawMessage {
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return json.RawMessage(`{}`)
	}
	redactValue(value)
	out, err := json.Marshal(value)
	if err != nil {
		return json.RawMessage(`{}`)
	}
	return out
}

func (b *SecretBox) transformConfig(raw json.RawMessage, transform func(string) (string, error)) (json.RawMessage, error) {
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, fmt.Errorf("decode target configuration: %w", err)
	}
	if err := transformValue(value, transform); err != nil {
		return nil, err
	}
	out, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("encode target configuration: %w", err)
	}
	return out, nil
}

func transformValue(value any, transform func(string) (string, error)) error {
	switch typed := value.(type) {
	case map[string]any:
		for key, child := range typed {
			if isSecretKey(key) {
				if s, ok := child.(string); ok && s != "" {
					updated, err := transform(s)
					if err != nil {
						return err
					}
					typed[key] = updated
				}
				continue
			}
			if err := transformValue(child, transform); err != nil {
				return err
			}
		}
	case []any:
		for _, child := range typed {
			if err := transformValue(child, transform); err != nil {
				return err
			}
		}
	}
	return nil
}

func redactValue(value any) {
	switch typed := value.(type) {
	case map[string]any:
		for key, child := range typed {
			if isSecretKey(key) {
				if s, ok := child.(string); ok && s != "" {
					typed[key] = "********"
				}
				continue
			}
			redactValue(child)
		}
	case []any:
		for _, child := range typed {
			redactValue(child)
		}
	}
}

func isSecretKey(key string) bool {
	switch strings.ToLower(key) {
	case "password", "private_key", "privatekey", "passphrase", "secret_key", "secretkey", "access_key", "accesskey":
		return true
	default:
		return false
	}
}

func (b *SecretBox) encryptString(plain string) (string, error) {
	if strings.HasPrefix(plain, encryptedPrefix) {
		return plain, nil
	}
	block, err := aes.NewCipher(b.key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nil, nonce, []byte(plain), nil)
	return encryptedPrefix + base64.RawURLEncoding.EncodeToString(nonce) + ":" + base64.RawURLEncoding.EncodeToString(ciphertext), nil
}

func (b *SecretBox) decryptString(cipherValue string) (string, error) {
	if !strings.HasPrefix(cipherValue, encryptedPrefix) {
		return cipherValue, nil
	}
	parts := strings.Split(strings.TrimPrefix(cipherValue, encryptedPrefix), ":")
	if len(parts) != 2 {
		return "", errors.New("invalid encrypted target credential")
	}
	nonce, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return "", fmt.Errorf("decode credential nonce: %w", err)
	}
	ciphertext, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", fmt.Errorf("decode credential ciphertext: %w", err)
	}
	block, err := aes.NewCipher(b.key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	plain, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", errors.New("decrypt target credential")
	}
	return string(plain), nil
}
