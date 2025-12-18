package usage

import (
	"context"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	coreusage "github.com/router-for-me/CLIProxyAPI/v6/sdk/cliproxy/usage"
)

func TestUsagePersistence(t *testing.T) {
	tmpDir := t.TempDir()
	path := filepath.Join(tmpDir, "usage_test.json")

	// 1. Create and populate initial stats
	s1 := NewRequestStatistics()
	// Reset global state for test safely?
	// RequestStatistics is a singleton in the current implementation, which makes testing hard.
	// We'll trust the Save/Load methods work on the instance we have, but we should be careful.
	// Better approach: Since we added Save/Load to *RequestStatistics, we can create a LOCAL instance if we had a constructor,
	// but the struct fields are private.
	// Ideally we should test the Save/Load logic.
	// The fields `apis`, `requestsByDay` etc are private.
	// Let's rely on RecordRequest to populate data.

	// Since we are mocking, let's just use the current instance, but we need to be careful not to mess up global state if running in parallel.
	// Ideally we would modification logger_plugin.go to allow creating a new instance for testing.
	// But let's assume we can use the global one for this test or modifying the code to allow new instances.
	// Actually, looking at logger_plugin.go, `NewRequestStatistics` is not exported, but we can call `GetRequestStatistics`.

	// Let's modify logger_plugin.go to allow creating a test instance or just export NewRequestStatistics?
	// Or we can just use the struct literal since we are in the same package `usage`.

	// Record some data
	record := coreusage.Record{
		RequestedAt: time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC),
		Provider:    "test-provider",
		APIKey:      "sk-test",
		Model:       "gpt-4",
		Detail: coreusage.Detail{
			InputTokens:  10,
			OutputTokens: 20,
			TotalTokens:  30,
		},
		Failed: false,
	}
	s1.Record(context.Background(), record)

	// 2. Save
	if _, err := s1.Save(path); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	// 3. Load into new instance
	s2 := NewRequestStatistics()
	if err := s2.Load(path); err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	// 4. Verify
	snap1 := s1.Snapshot()
	snap2 := s2.Snapshot()

	if !reflect.DeepEqual(snap1, snap2) {
		t.Errorf("Loaded stats do not match saved stats.\nSaved: %+v\nLoaded: %+v", snap1, snap2)
	}
}

func TestMemoryMode_PersistenceDisabled(t *testing.T) {
	// Logic check: verify Load returns nil error on non-existent file
	s := NewRequestStatistics()
	if err := s.Load("/non/existent/path.json"); err != nil {
		t.Errorf("Load should not error on missing file: %v", err)
	}
}
