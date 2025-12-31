package management

import (
	"sync"
	"testing"
)

func TestOAuthStatusConcurrency(t *testing.T) {
	// Reset map for test
	oauthStatusMu.Lock()
	oauthStatus = make(map[string]string)
	oauthStatusMu.Unlock()

	const numGoroutines = 100
	const statePrefix = "state-"

	var wg sync.WaitGroup
	wg.Add(numGoroutines * 3) // Writers, Readers, Deleters

	// Writers
	for i := 0; i < numGoroutines; i++ {
		go func(i int) {
			defer wg.Done()
			state := statePrefix + string(rune(i))
			setOAuthStatus(state, "pending")
		}(i)
	}

	// Readers
	for i := 0; i < numGoroutines; i++ {
		go func(i int) {
			defer wg.Done()
			state := statePrefix + string(rune(i))
			_ = getOAuthStatus(state)
		}(i)
	}

	// Deleters
	for i := 0; i < numGoroutines; i++ {
		go func(i int) {
			defer wg.Done()
			state := statePrefix + string(rune(i))
			deleteOAuthStatus(state)
		}(i)
	}

	wg.Wait()

	// Verify no panic occurred (implicit) and map is in valid state (not corrupted)
	oauthStatusMu.RLock()
	defer oauthStatusMu.RUnlock()
	// Length might be 0 or some items left depending on execution order, but shouldn't panic
	t.Logf("Final map size: %d", len(oauthStatus))
}

func TestOAuthStatusLogic(t *testing.T) {
	// Reset map for test
	oauthStatusMu.Lock()
	oauthStatus = make(map[string]string)
	oauthStatusMu.Unlock()

	state := "test-state"
	val := "processing"

	setOAuthStatus(state, val)
	if got := getOAuthStatus(state); got != val {
		t.Errorf("getOAuthStatus() = %v, want %v", got, val)
	}

	deleteOAuthStatus(state)
	if got := getOAuthStatus(state); got != "" {
		t.Errorf("getOAuthStatus() after delete = %v, want empty", got)
	}
}
