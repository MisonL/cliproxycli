package managementasset

import (
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"

	"cliproxy/internal/config"
	"cliproxy/internal/util"

	log "github.com/sirupsen/logrus"
)

//go:embed embedded/management.html
var embeddedAsset []byte

const (
	managementAssetName = "management.html"
)

// ManagementFileName exposes the control panel asset filename.
const ManagementFileName = managementAssetName

var (
	currentConfigPtr    atomic.Pointer[config.Config]
	disableControlPanel atomic.Bool
	schedulerOnce       sync.Once
	schedulerConfigPath atomic.Value
)

// SetCurrentConfig stores the latest configuration snapshot for management asset decisions.
func SetCurrentConfig(cfg *config.Config) {
	if cfg == nil {
		currentConfigPtr.Store(nil)
		return
	}

	currentConfigPtr.Store(cfg)
	disableControlPanel.Store(cfg.RemoteManagement.DisableControlPanel)
}

// StaticDir resolves the directory that stores the management control panel asset.
func StaticDir(configFilePath string) string {
	if override := strings.TrimSpace(os.Getenv("MANAGEMENT_STATIC_PATH")); override != "" {
		cleaned := filepath.Clean(override)
		if strings.EqualFold(filepath.Base(cleaned), managementAssetName) {
			return filepath.Dir(cleaned)
		}
		return cleaned
	}

	if writable := util.WritablePath(); writable != "" {
		return filepath.Join(writable, "static")
	}

	configFilePath = strings.TrimSpace(configFilePath)
	if configFilePath == "" {
		return ""
	}

	base := filepath.Dir(configFilePath)
	fileInfo, err := os.Stat(configFilePath)
	if err == nil {
		if fileInfo.IsDir() {
			base = configFilePath
		}
	}

	return filepath.Join(base, "static")
}

// FilePath resolves the absolute path to the management control panel asset.
func FilePath(configFilePath string) string {
	if override := strings.TrimSpace(os.Getenv("MANAGEMENT_STATIC_PATH")); override != "" {
		cleaned := filepath.Clean(override)
		if strings.EqualFold(filepath.Base(cleaned), managementAssetName) {
			return cleaned
		}
		return filepath.Join(cleaned, ManagementFileName)
	}

	dir := StaticDir(configFilePath)
	if dir == "" {
		return ""
	}
	return filepath.Join(dir, ManagementFileName)
}

// EnsureAsset checks if the management asset exists and attempts to restore it from embedded if missing.
func EnsureAsset(configFilePath string) (string, error) {
	path := FilePath(configFilePath)
	if path == "" {
		return "", fmt.Errorf("could not resolve asset path")
	}

	// If local file exists, use it (allows customization)
	if _, err := os.Stat(path); err == nil {
		return path, nil
	}

	// Otherwise, restore from embedded asset
	log.Infof("Management asset missing at %s, restoring from embedded source...", path)

	// Create directory if missing
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("failed to create static directory: %w", err)
	}

	// Write embedded asset to the path
	if err := os.WriteFile(path, embeddedAsset, 0644); err != nil {
		return "", fmt.Errorf("failed to restore embedded management asset: %w", err)
	}

	log.Infof("Management asset successfully restored to %s", path)
	return path, nil
}
