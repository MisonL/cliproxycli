package iflow

import (
	"strings"
	"testing"
	"time"

	"cliproxy/internal/config"
)

func TestAuthorizationURL(t *testing.T) {
	cfg := &config.Config{}
	auth := NewIFlowAuth(cfg)
	state := "test-state"
	port := 8080

	authURL, redirectURI := auth.AuthorizationURL(state, port)

	if !strings.Contains(authURL, iFlowOAuthAuthorizeEndpoint) {
		t.Errorf("AuthorizationURL = %s; want endpoint %s", authURL, iFlowOAuthAuthorizeEndpoint)
	}
	if !strings.Contains(authURL, "client_id="+iFlowOAuthClientID) {
		t.Errorf("AuthorizationURL missing client_id")
	}
	if !strings.Contains(authURL, "state="+state) {
		t.Errorf("AuthorizationURL missing state")
	}
	if !strings.Contains(redirectURI, "8080") {
		t.Errorf("redirectURI = %s; want port 8080", redirectURI)
	}
}

func TestCookieHelpers(t *testing.T) {
	// Test ExtractBXAuth
	cookie := "foo=bar; BXAuth=secret_value; baz=qux;"
	if got := ExtractBXAuth(cookie); got != "secret_value" {
		t.Errorf("ExtractBXAuth() = %s; want secret_value", got)
	}

	// Test NormalizeCookie
	raw := "  foo=bar; BXAuth=val  "
	normalized, err := NormalizeCookie(raw)
	if err != nil {
		t.Errorf("NormalizeCookie failed: %v", err)
	}
	if !strings.Contains(normalized, "BXAuth=val") || !strings.HasSuffix(normalized, ";") {
		t.Errorf("NormalizeCookie = %s; malformed", normalized)
	}

	_, err = NormalizeCookie("no_auth_field")
	if err == nil {
		t.Error("NormalizeCookie should fail without BXAuth")
	}

	// Test SanitizeIFlowFileName
	email := "foo.bar@example.com"
	sanitized := SanitizeIFlowFileName(email)
	if sanitized != "foo.bar@example.com" {
		t.Errorf("SanitizeIFlowFileName typical email failed: got %s", sanitized)
	}

	ugly := "invalid/char*name"
	sanitized = SanitizeIFlowFileName(ugly)
	if strings.Contains(sanitized, "*") || strings.Contains(sanitized, "/") {
		t.Errorf("SanitizeIFlowFileName failed to strip chars: %s", sanitized)
	}
}

func TestShouldRefreshAPIKey(t *testing.T) {
	now := time.Now()

	// Case 1: Expired (or expiring very soon)
	expiringSoon := now.Add(1 * time.Hour).Format("2006-01-02 15:04")
	needsRefresh, _, err := ShouldRefreshAPIKey(expiringSoon)
	if err != nil {
		t.Fatalf("ShouldRefreshAPIKey error: %v", err)
	}
	if !needsRefresh {
		t.Error("ShouldRefreshAPIKey should be true for 1 hour left")
	}

	// Case 2: Valid for long time
	validLong := now.Add(100 * time.Hour).Format("2006-01-02 15:04")
	needsRefresh, _, err = ShouldRefreshAPIKey(validLong)
	if err != nil {
		t.Fatalf("ShouldRefreshAPIKey error: %v", err)
	}
	if needsRefresh {
		t.Error("ShouldRefreshAPIKey should be false for 100 hours left")
	}

	// Case 3: Invalid format
	_, _, err = ShouldRefreshAPIKey("invalid-date")
	if err == nil {
		t.Error("ShouldRefreshAPIKey should fail for invalid date")
	}
}

func TestCreateTokenStorage(t *testing.T) {
	cfg := &config.Config{}
	auth := NewIFlowAuth(cfg)

	data := &IFlowTokenData{
		AccessToken:  "acc",
		RefreshToken: "ref",
		Expire:       "2025-01-01T00:00:00Z",
		APIKey:       "key",
		Email:        "test@example.com",
		TokenType:    "Bearer",
		Scope:        "all",
	}

	storage := auth.CreateTokenStorage(data)
	if storage.AccessToken != "acc" {
		t.Errorf("storage.AccessToken = %s; want acc", storage.AccessToken)
	}
	if storage.Email != "test@example.com" {
		t.Errorf("storage.Email = %s; want test@example.com", storage.Email)
	}
}
