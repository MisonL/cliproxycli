package api

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
	configaccess "cliproxy/internal/access/config_access"
	proxyconfig "cliproxy/internal/config"
	sdkaccess "cliproxy/sdk/access"
	"cliproxy/sdk/cliproxy/auth"
	sdkconfig "cliproxy/sdk/config"
)

// TestAuthMiddleware_LocalPassword verifies that the AuthMiddleware correctly handles
// the X-Local-Password header for internal authentication.
func TestAuthMiddleware_LocalPassword(t *testing.T) {
	configaccess.Register()
	gin.SetMode(gin.TestMode)

	// Setup basic config and deps
	tmpDir := t.TempDir()
	authDir := filepath.Join(tmpDir, "auth")
	_ = os.MkdirAll(authDir, 0o700)

	cfg := &proxyconfig.Config{
		SDKConfig: sdkconfig.SDKConfig{
			APIKeys: []string{"public-key"},
			Port:    0,
			AuthDir: authDir,
		},
	}
	authManager := auth.NewManager(nil, nil, nil)
	accessManager := sdkaccess.NewManager()
	configPath := filepath.Join(tmpDir, "config.yaml")

	// correct password
	correctPassword := "internal-secret-123"

	// Create server with local password option
	server := NewServer(cfg, authManager, accessManager, configPath, WithLocalManagementPassword(correctPassword))

	// Setup a protected route for testing
	// We'll use a new engine to isolate from default routes for simplicity,
	// or we can attach to server.engine if we want to test exact middleware chain.
	// Since AuthMiddleware is a method on Server, we can stick it on a fresh router.
	r := gin.New()
	r.Use(server.AuthMiddleware())
	r.GET("/protected", func(c *gin.Context) {
		c.String(http.StatusOK, "success")
	})

	testCases := []struct {
		name           string
		headers        map[string]string
		expectedStatus int
	}{
		{
			name:           "No Headers",
			headers:        map[string]string{},
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name: "Wrong Local Password",
			headers: map[string]string{
				"X-Local-Password": "wrong-password",
			},
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name: "Wrong Bearer Token",
			headers: map[string]string{
				"Authorization": "Bearer wrong-password",
			},
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name: "Correct Local Password Header",
			headers: map[string]string{
				"X-Local-Password": correctPassword,
			},
			expectedStatus: http.StatusOK,
		},
		{
			name: "Correct Bearer Token",
			headers: map[string]string{
				"Authorization": "Bearer " + correctPassword,
			},
			expectedStatus: http.StatusOK,
		},
		{
			name: "Valid Public API Key (Normal Auth)",
			headers: map[string]string{
				"Authorization": "Bearer public-key",
			},
			expectedStatus: http.StatusOK,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/protected", nil)
			for k, v := range tc.headers {
				req.Header.Set(k, v)
			}
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			if w.Code != tc.expectedStatus {
				t.Errorf("expected status %d, got %d", tc.expectedStatus, w.Code)
			}
		})
	}
}
