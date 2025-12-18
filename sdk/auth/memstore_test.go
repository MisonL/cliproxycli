package auth

import (
	"context"
	"testing"

	cliproxyauth "github.com/router-for-me/CLIProxyAPI/v6/sdk/cliproxy/auth"
)

func TestMemoryTokenStore(t *testing.T) {
	store := NewMemoryTokenStore()
	ctx := context.Background()

	// 1. Save
	auth1 := &cliproxyauth.Auth{
		ID:       "test-id-1",
		Provider: "provider1",
		Metadata: map[string]any{"key": "value"},
	}
	if _, err := store.Save(ctx, auth1); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	// 2. List
	list, err := store.List(ctx)
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("List want 1 item, got %d", len(list))
	}
	if list[0].ID != auth1.ID {
		t.Errorf("List item mismatch. Want %s, got %s", auth1.ID, list[0].ID)
	}

	// 3. Delete
	if err := store.Delete(ctx, auth1.ID); err != nil {
		t.Fatalf("Delete failed: %v", err)
	}

	// 4. List empty
	list, err = store.List(ctx)
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if len(list) != 0 {
		t.Errorf("List should be empty after delete, got %d items", len(list))
	}
}
