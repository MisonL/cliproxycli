package auth

import (
	"context"
	"fmt"
	"sort"
	"sync"

	cliproxyauth "github.com/router-for-me/CLIProxyAPI/v6/sdk/cliproxy/auth"
)

// MemoryTokenStore implements coreauth.Store using an in-memory map.
// It is used when persistence is disabled.
type MemoryTokenStore struct {
	mu   sync.RWMutex
	data map[string]*cliproxyauth.Auth
}

// NewMemoryTokenStore creates a new in-memory token store.
func NewMemoryTokenStore() *MemoryTokenStore {
	return &MemoryTokenStore{
		data: make(map[string]*cliproxyauth.Auth),
	}
}

// Save persists the provided auth record in memory.
func (s *MemoryTokenStore) Save(ctx context.Context, auth *cliproxyauth.Auth) (string, error) {
	if auth == nil {
		return "", fmt.Errorf("auth is nil")
	}
	if auth.ID == "" {
		return "", fmt.Errorf("auth id is empty")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Store a copy to prevent external modification affecting the store?
	// For memory store, usually fine to store pointer if we trust caller,
	// but safer to shallow copy struct atleast.
	// Since Auth contains maps (Metadata, Attributes), a deep copy would be ideal but
	// strictly speaking the interface doesn't mandate deep copy behavior for Save.
	// FileStore writes to disk so it effectively snapshots.
	// Let's safe-guard by just storing the pointer for now as typically
	// these objects are replaced entirely on update.
	s.data[auth.ID] = auth
	return "memory:" + auth.ID, nil
}

// Delete removes the auth record identified by id.
func (s *MemoryTokenStore) Delete(ctx context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.data, id)
	return nil
}

// List returns all auth records stored in memory.
func (s *MemoryTokenStore) List(ctx context.Context) ([]*cliproxyauth.Auth, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	list := make([]*cliproxyauth.Auth, 0, len(s.data))
	for _, v := range s.data {
		list = append(list, v)
	}
	// Sort for consistent output? FileStore relies on WalkDir which is usually sorted by name.
	// Let's sort by ID to be deterministic.
	sort.Slice(list, func(i, j int) bool {
		return list[i].ID < list[j].ID
	})
	return list, nil
}
