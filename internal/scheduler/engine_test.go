package scheduler

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// NoOpExecutor
type NoOpExecutor struct{}

func (e *NoOpExecutor) Execute(ctx context.Context, task *Task) (string, error) {
	return "done", nil
}

func TestEngine_UpdateNextRun_AppliesForcePersist(t *testing.T) {
	// 1. Setup Temp Store
	tmpDir, err := os.MkdirTemp("", "scheduler_test_*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	engine := NewEngine(store, &NoOpExecutor{})

	// 2. Create a FixedTime task that is already "due" or past
	now := time.Now()
	past := now.Add(-1 * time.Hour)
	task := &Task{
		ID:        "test-task-1",
		Type:      TaskTypeFixedTime,
		FixedTime: &past,
		Status:    TaskStatusActive,
		NextRunAt: &past, // Simulate it was scheduled
	}
	// Initial Save
	err = store.AddTask(task)
	assert.NoError(t, err)

	// 3. Update with forcePersist = true
	// Scenario: Task executes, status becomes Finished (logic inside executeTask usually handles this,
	// but here we test updateNextRun's behavior when called directly or if we simulate the state change before it).

	// Let's modify task state in memory to simulate "execution finished"
	task.Lock()
	task.Status = TaskStatusFinished
	task.Unlock()

	// Call updateNextRun with forcePersist = true
	// Note: updateNextRun(..., true) is expected to persist even if NextRunAt is nil'd out.
	engine.updateNextRun(task, now, true)

	// 4. Verify Persistence
	// Re-load store from simple file verification
	// We can create a new store instance to force reload from disk
	store2, err := NewStore(tmpDir)
	assert.NoError(t, err)

	loadedTask, exists := store2.GetTask("test-task-1")
	assert.True(t, exists)
	assert.Equal(t, TaskStatusFinished, loadedTask.Status)
	assert.Nil(t, loadedTask.NextRunAt)
}

func TestEngine_UpdateNextRun_ForcePersist_UpdatesLastRun(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "scheduler_test_2_*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatal(err)
	}
	engine := NewEngine(store, &NoOpExecutor{})

	now := time.Now()
	task := &Task{
		ID:       "test-task-2",
		Type:     TaskTypeInterval,
		Interval: "1h",
		Status:   TaskStatusActive,
	}
	_ = store.AddTask(task)

	// Simulate Modify LastRunAt in memory
	task.Lock()
	lastRun := now.Add(-10 * time.Minute)
	task.LastRunAt = &lastRun
	task.Unlock()

	// Call with forcePersist = true
	engine.updateNextRun(task, now, true)

	// Verify disk
	store2, err := NewStore(tmpDir)
	assert.NoError(t, err)
	loaded, _ := store2.GetTask("test-task-2")

	assert.NotNil(t, loaded.LastRunAt)
	// Time comparison might have small location/monotonic diffs, compare Unix() or String()
	assert.Equal(t, lastRun.Unix(), loaded.LastRunAt.Unix())
}
