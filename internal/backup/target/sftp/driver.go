package sftp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path"
	"sort"
	"strings"
	"time"

	"github.com/Brain4Fish/storagetron/internal/backup"
	pkgsftp "github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

type Config struct {
	Host                     string `json:"host"`
	Port                     int    `json:"port"`
	Username                 string `json:"username"`
	Password                 string `json:"password,omitempty"`
	PrivateKey               string `json:"private_key,omitempty"`
	Passphrase               string `json:"passphrase,omitempty"`
	HostKey                  string `json:"host_key,omitempty"`
	InsecureSkipHostKeyCheck bool   `json:"insecure_skip_host_key_check,omitempty"`
	RemotePath               string `json:"remote_path"`
	TimeoutSeconds           int    `json:"timeout_seconds,omitempty"`
}

type Factory struct{}

func NewFactory() Factory {
	return Factory{}
}

func (Factory) Type() backup.TargetType {
	return backup.TargetTypeSFTP
}

func (Factory) New(ctx context.Context, raw json.RawMessage) (backup.BackupTargetDriver, error) {
	var cfg Config
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("decode sftp configuration: %w", err)
	}
	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return &Driver{cfg: cfg}, nil
}

type Driver struct {
	cfg Config
}

func (d *Driver) Upload(ctx context.Context, localFile string, remoteName string) (backup.BackupObject, error) {
	if err := validateLocalFile(localFile); err != nil {
		return backup.BackupObject{}, err
	}
	if !safeRemoteName(remoteName) {
		return backup.BackupObject{}, fmt.Errorf("invalid remote backup name %q", remoteName)
	}
	client, closeFn, err := d.client(ctx)
	if err != nil {
		return backup.BackupObject{}, err
	}
	defer closeFn()

	remoteDir := d.cleanRemotePath()
	if err := client.MkdirAll(remoteDir); err != nil {
		return backup.BackupObject{}, fmt.Errorf("create remote backup directory: %w", err)
	}
	remotePath := path.Join(remoteDir, remoteName)
	src, err := os.Open(localFile)
	if err != nil {
		return backup.BackupObject{}, fmt.Errorf("open backup archive: %w", err)
	}
	defer src.Close()

	dst, err := client.OpenFile(remotePath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC)
	if err != nil {
		return backup.BackupObject{}, fmt.Errorf("open remote backup file: %w", err)
	}
	if _, err := io.Copy(dst, src); err != nil {
		_ = dst.Close()
		return backup.BackupObject{}, fmt.Errorf("upload backup archive: %w", err)
	}
	if err := dst.Close(); err != nil {
		return backup.BackupObject{}, fmt.Errorf("close remote backup file: %w", err)
	}
	stat, err := client.Stat(remotePath)
	if err != nil {
		return backup.BackupObject{}, fmt.Errorf("stat remote backup file: %w", err)
	}
	return backup.BackupObject{
		ID:        remoteName,
		Name:      remoteName,
		Path:      remotePath,
		SizeBytes: stat.Size(),
		CreatedAt: stat.ModTime(),
	}, nil
}

func (d *Driver) Download(ctx context.Context, backupID string, localFile string) error {
	if !safeRemoteName(backupID) {
		return fmt.Errorf("invalid backup identifier %q", backupID)
	}
	if err := validateLocalDestination(localFile); err != nil {
		return err
	}
	client, closeFn, err := d.client(ctx)
	if err != nil {
		return err
	}
	defer closeFn()

	src, err := client.Open(path.Join(d.cleanRemotePath(), backupID))
	if err != nil {
		return fmt.Errorf("open remote backup archive: %w", err)
	}
	defer src.Close()
	dst, err := os.OpenFile(localFile, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return fmt.Errorf("create local backup archive: %w", err)
	}
	if _, err := io.Copy(dst, src); err != nil {
		_ = dst.Close()
		return fmt.Errorf("download backup archive: %w", err)
	}
	if err := dst.Close(); err != nil {
		return fmt.Errorf("close local backup archive: %w", err)
	}
	return nil
}

func (d *Driver) List(ctx context.Context) ([]backup.BackupObject, error) {
	client, closeFn, err := d.client(ctx)
	if err != nil {
		return nil, err
	}
	defer closeFn()

	entries, err := client.ReadDir(d.cleanRemotePath())
	if err != nil {
		return nil, fmt.Errorf("list remote backups: %w", err)
	}
	objects := make([]backup.BackupObject, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".tar.zst") {
			continue
		}
		objects = append(objects, backup.BackupObject{
			ID:        entry.Name(),
			Name:      entry.Name(),
			Path:      path.Join(d.cleanRemotePath(), entry.Name()),
			SizeBytes: entry.Size(),
			CreatedAt: entry.ModTime(),
		})
	}
	sort.Slice(objects, func(i, j int) bool {
		return objects[i].CreatedAt.After(objects[j].CreatedAt)
	})
	return objects, nil
}

func (d *Driver) Delete(ctx context.Context, backupID string) error {
	if !safeRemoteName(backupID) {
		return fmt.Errorf("invalid backup identifier %q", backupID)
	}
	client, closeFn, err := d.client(ctx)
	if err != nil {
		return err
	}
	defer closeFn()
	if err := client.Remove(path.Join(d.cleanRemotePath(), backupID)); err != nil {
		return fmt.Errorf("delete remote backup archive: %w", err)
	}
	return nil
}

func (d *Driver) client(ctx context.Context) (*pkgsftp.Client, func(), error) {
	timeout := time.Duration(d.cfg.TimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	auth, err := d.authMethods()
	if err != nil {
		return nil, nil, err
	}
	sshCfg := &ssh.ClientConfig{
		User:            d.cfg.Username,
		Auth:            auth,
		HostKeyCallback: d.hostKeyCallback(),
		Timeout:         timeout,
	}
	address := net.JoinHostPort(d.cfg.Host, fmt.Sprintf("%d", d.port()))

	dialer := net.Dialer{Timeout: timeout}
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return nil, nil, fmt.Errorf("connect sftp target: %w", err)
	}
	sshConn, chans, reqs, err := ssh.NewClientConn(conn, address, sshCfg)
	if err != nil {
		_ = conn.Close()
		return nil, nil, fmt.Errorf("authenticate sftp target: %w", err)
	}
	sshClient := ssh.NewClient(sshConn, chans, reqs)
	sftpClient, err := pkgsftp.NewClient(sshClient)
	if err != nil {
		_ = sshClient.Close()
		return nil, nil, fmt.Errorf("open sftp client: %w", err)
	}
	return sftpClient, func() {
		_ = sftpClient.Close()
		_ = sshClient.Close()
	}, nil
}

func (d *Driver) authMethods() ([]ssh.AuthMethod, error) {
	methods := make([]ssh.AuthMethod, 0, 2)
	if d.cfg.PrivateKey != "" {
		var signer ssh.Signer
		var err error
		key := []byte(d.cfg.PrivateKey)
		if d.cfg.Passphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase(key, []byte(d.cfg.Passphrase))
		} else {
			signer, err = ssh.ParsePrivateKey(key)
		}
		if err != nil {
			return nil, fmt.Errorf("parse sftp private key: %w", err)
		}
		methods = append(methods, ssh.PublicKeys(signer))
	}
	if d.cfg.Password != "" {
		methods = append(methods, ssh.Password(d.cfg.Password))
	}
	if len(methods) == 0 {
		return nil, errors.New("sftp target requires password or private_key")
	}
	return methods, nil
}

func (d *Driver) hostKeyCallback() ssh.HostKeyCallback {
	if d.cfg.HostKey != "" {
		publicKey, _, _, _, err := ssh.ParseAuthorizedKey([]byte(d.cfg.HostKey))
		if err == nil {
			return ssh.FixedHostKey(publicKey)
		}
	}
	if d.cfg.InsecureSkipHostKeyCheck {
		return ssh.InsecureIgnoreHostKey()
	}
	return func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		return errors.New("sftp host_key is required unless insecure_skip_host_key_check is true")
	}
}

func (d *Driver) cleanRemotePath() string {
	cleaned := path.Clean("/" + strings.TrimSpace(d.cfg.RemotePath))
	if cleaned == "." || cleaned == "/" {
		return "/"
	}
	return cleaned
}

func (d *Driver) port() int {
	if d.cfg.Port == 0 {
		return 22
	}
	return d.cfg.Port
}

func (c Config) validate() error {
	if strings.TrimSpace(c.Host) == "" {
		return errors.New("sftp host is required")
	}
	if strings.TrimSpace(c.Username) == "" {
		return errors.New("sftp username is required")
	}
	if c.Port < 0 || c.Port > 65535 {
		return errors.New("sftp port must be between 0 and 65535")
	}
	if strings.TrimSpace(c.RemotePath) == "" {
		return errors.New("sftp remote_path is required")
	}
	if c.Password == "" && c.PrivateKey == "" {
		return errors.New("sftp password or private_key is required")
	}
	if c.HostKey == "" && !c.InsecureSkipHostKeyCheck {
		return errors.New("sftp host_key is required unless insecure_skip_host_key_check is true")
	}
	if c.HostKey != "" {
		if _, _, _, _, err := ssh.ParseAuthorizedKey([]byte(c.HostKey)); err != nil {
			return fmt.Errorf("invalid sftp host_key: %w", err)
		}
	}
	return nil
}

func validateLocalFile(file string) error {
	stat, err := os.Stat(file)
	if err != nil {
		return fmt.Errorf("stat local backup archive: %w", err)
	}
	if stat.IsDir() {
		return fmt.Errorf("local backup archive is a directory")
	}
	return nil
}

func validateLocalDestination(file string) error {
	if strings.TrimSpace(file) == "" || strings.Contains(file, "\x00") {
		return errors.New("invalid local destination")
	}
	return nil
}

func safeRemoteName(name string) bool {
	return name != "" && !strings.Contains(name, "/") && !strings.Contains(name, "\\") && !strings.Contains(name, "..") && !strings.Contains(name, "\x00")
}
