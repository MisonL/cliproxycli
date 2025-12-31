package auth

import (
	"context"
	"testing"

	cliproxyexecutor "github.com/router-for-me/CLIProxyAPI/v6/sdk/cliproxy/executor"
)

func TestNewUnifiedSelector(t *testing.T) {
	s := NewUnifiedSelector("")
	if s == nil {
		t.Fatal("NewUnifiedSelector returned nil")
	}
	if s.strategy != "priority" {
		t.Errorf("Default strategy = %v, want priority", s.strategy)
	}

	s = NewUnifiedSelector("round-robin")
	if s.strategy != "round-robin" {
		t.Errorf("Strategy = %v, want round-robin", s.strategy)
	}
}

func TestUnifiedSelector_SetStrategy(t *testing.T) {
	s := NewUnifiedSelector("priority")

	s.SetStrategy("load-balance")
	if s.strategy != "load-balance" {
		t.Errorf("Strategy = %v, want load-balance", s.strategy)
	}
}

func TestUnifiedSelector_Pick(t *testing.T) {
	tests := []struct {
		name      string
		strategy  string
		auths     []*Auth
		wantError bool
	}{
		{
			name:      "no auths",
			strategy:  "priority",
			auths:     []*Auth{},
			wantError: true,
		},
		{
			name:     "priority strategy",
			strategy: "priority",
			auths: []*Auth{
				{ID: "1", Provider: "test", Priority: 10, Status: StatusActive},
				{ID: "2", Provider: "test", Priority: 5, Status: StatusActive},
				{ID: "3", Provider: "test", Priority: 1, Status: StatusActive},
			},
			wantError: false,
		},
		{
			name:     "round-robin strategy",
			strategy: "round-robin",
			auths: []*Auth{
				{ID: "1", Provider: "test", Status: StatusActive},
				{ID: "2", Provider: "test", Status: StatusActive},
				{ID: "3", Provider: "test", Status: StatusActive},
			},
			wantError: false,
		},
		{
			name:     "load-balance strategy",
			strategy: "load-balance",
			auths: []*Auth{
				{ID: "1", Provider: "test", Weight: 100, Status: StatusActive},
				{ID: "2", Provider: "test", Weight: 200, Status: StatusActive},
			},
			wantError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := NewUnifiedSelector(tt.strategy)
			ctx := context.Background()
			opts := cliproxyexecutor.Options{}

			auth, err := s.Pick(ctx, "test", "model", opts, tt.auths)
			if (err != nil) != tt.wantError {
				t.Errorf("Pick() error = %v, wantError %v", err, tt.wantError)
				return
			}
			if !tt.wantError && auth == nil {
				t.Error("Pick() returned nil auth")
			}
		})
	}
}

func TestUnifiedSelector_pickPriority(t *testing.T) {
	s := NewUnifiedSelector("priority")

	auths := []*Auth{
		{ID: "1", Provider: "test", Priority: 10, Status: StatusActive},
		{ID: "2", Provider: "test", Priority: 5, Status: StatusActive},
		{ID: "3", Provider: "test", Priority: 1, Status: StatusActive},
	}

	auth, err := s.pickPriority("test", "model", auths)
	if err != nil {
		t.Fatalf("pickPriority failed: %v", err)
	}

	if auth.ID != "3" {
		t.Errorf("Expected ID 3 (priority 1), got %s", auth.ID)
	}
}

func TestUnifiedSelector_pickRoundRobin(t *testing.T) {
	s := NewUnifiedSelector("round-robin")

	auths := []*Auth{
		{ID: "1", Provider: "test", Status: StatusActive},
		{ID: "2", Provider: "test", Status: StatusActive},
		{ID: "3", Provider: "test", Status: StatusActive},
	}

	// First call should return auth 1
	auth1, _ := s.pickRoundRobin("test", "model", auths)
	if auth1.ID != "1" {
		t.Errorf("First call expected ID 1, got %s", auth1.ID)
	}

	// Second call should return auth 2
	auth2, _ := s.pickRoundRobin("test", "model", auths)
	if auth2.ID != "2" {
		t.Errorf("Second call expected ID 2, got %s", auth2.ID)
	}

	// Third call should return auth 3
	auth3, _ := s.pickRoundRobin("test", "model", auths)
	if auth3.ID != "3" {
		t.Errorf("Third call expected ID 3, got %s", auth3.ID)
	}

	// Fourth call should wrap around to auth 1
	auth4, _ := s.pickRoundRobin("test", "model", auths)
	if auth4.ID != "1" {
		t.Errorf("Fourth call expected ID 1, got %s", auth4.ID)
	}
}

func TestUnifiedSelector_pickWeighted(t *testing.T) {
	s := NewUnifiedSelector("load-balance")

	auths := []*Auth{
		{ID: "1", Provider: "test", Weight: 100, Status: StatusActive},
		{ID: "2", Provider: "test", Weight: 200, Status: StatusActive},
	}

	// Run multiple times to ensure both are selected
	selected := make(map[string]bool)
	for i := 0; i < 100; i++ {
		auth, _ := s.pickWeighted(auths)
		selected[auth.ID] = true
	}

	if !selected["1"] || !selected["2"] {
		t.Error("Both auths should be selected at least once")
	}
}

func TestUnifiedSelector_pickSticky(t *testing.T) {
	s := NewUnifiedSelector("sticky")

	auths := []*Auth{
		{ID: "1", Provider: "test", Priority: 1, Status: StatusActive},
		{ID: "2", Provider: "test", Priority: 2, Status: StatusActive},
	}

	ctx := context.Background()

	// First call - should select a1 (highest priority)
	auth1, _ := s.pickSticky(ctx, "test", "model", cliproxyexecutor.Options{}, auths)
	if auth1.ID != "1" {
		t.Errorf("First call expected ID 1, got %s", auth1.ID)
	}

	// Second call with same context - should return a1 again (sticky)
	auth2, _ := s.pickSticky(ctx, "test", "model", cliproxyexecutor.Options{}, auths)
	if auth2.ID != "1" {
		t.Errorf("Second call expected ID 1 (sticky), got %s", auth2.ID)
	}

	// Third call with new context - should still return a1 (no session ID, falls back to priority)
	ctx2 := context.Background()
	auth3, _ := s.pickSticky(ctx2, "test", "model", cliproxyexecutor.Options{}, auths)
	if auth3.ID != "1" {
		t.Errorf("Third call expected ID 1, got %s", auth3.ID)
	}
}

func TestUnifiedSelector_extractSessionID(t *testing.T) {
	s := NewUnifiedSelector("priority")

	// Test with context value
	ctx1 := context.WithValue(context.Background(), "session-id", "test-session")
	id1 := s.extractSessionID(ctx1, cliproxyexecutor.Options{})
	if id1 != "test-session" {
		t.Errorf("extractSessionID() = %v, want test-session", id1)
	}

	// Test with context value (user-id)
	ctx2 := context.WithValue(context.Background(), "user-id", "user123")
	id2 := s.extractSessionID(ctx2, cliproxyexecutor.Options{})
	if id2 != "user123" {
		t.Errorf("extractSessionID() = %v, want user123", id2)
	}

	// Test with empty context
	id3 := s.extractSessionID(context.Background(), cliproxyexecutor.Options{})
	if id3 != "" {
		t.Errorf("extractSessionID() with empty context should return empty, got %v", id3)
	}
}
