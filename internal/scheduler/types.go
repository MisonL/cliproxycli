package scheduler

import (
	"encoding/json"
	"sync"
	"time"
)

// TaskType defines the scheduling strategy.
type TaskType string

const (
	TaskTypeInterval     TaskType = "interval"
	TaskTypeFixedTime    TaskType = "fixed_time"
	TaskTypeDaily        TaskType = "daily"
	TaskTypeSystemReport TaskType = "system_report"
)

// TaskStatus defines the operational status of a task.
type TaskStatus string

const (
	TaskStatusActive   TaskStatus = "active"
	TaskStatusPaused   TaskStatus = "paused"
	TaskStatusFinished TaskStatus = "finished"
)

// Task represents a scheduled AI job.
type Task struct {
	mu           sync.RWMutex
	ID           string     `json:"id"`
	Name         string     `json:"name"`
	Type         TaskType   `json:"type"`       // "interval" or "fixed_time"
	Interval     string     `json:"interval"`   // e.g. "30m", "1h" (only for TaskTypeInterval)
	FixedTime    *time.Time `json:"fixed_time"` // ISO timestamp (only for TaskTypeFixedTime)
	DailyTime    string     `json:"daily_time"` // e.g. "09:00,18:00" (only for TaskTypeDaily)
	Prompt       string     `json:"prompt"`
	Model        string     `json:"model"`
	WebhookURL   string     `json:"webhook_url"`
	Status       TaskStatus `json:"status"`
	CreatedAt    time.Time  `json:"created_at"`
	LastRunAt    *time.Time `json:"last_run_at"`
	NextRunAt    *time.Time `json:"next_run_at"`
	FailureCount int        `json:"failure_count"`
}

func (t *Task) Lock()    { t.mu.Lock() }
func (t *Task) Unlock()  { t.mu.Unlock() }
func (t *Task) RLock()   { t.mu.RLock() }
func (t *Task) RUnlock() { t.mu.RUnlock() }

// MarshalJSON provides thread-safe JSON serialization.
func (t *Task) MarshalJSON() ([]byte, error) {
	t.mu.RLock()
	defer t.mu.RUnlock()

	type Alias Task
	return json.Marshal(&struct {
		*Alias
	}{
		Alias: (*Alias)(t),
	})
}

// ExecutionLog records the result of a task run.
type ExecutionLog struct {
	ID            string    `json:"id"`
	TaskID        string    `json:"task_id"`
	TaskName      string    `json:"task_name"`
	ExecutedAt    time.Time `json:"executed_at"`
	DurationMs    int64     `json:"duration_ms"`
	Success       bool      `json:"success"`
	Output        string    `json:"output"`         // AI response or error message
	WebhookStatus int       `json:"webhook_status"` // HTTP status code of webhook, 0 if not sent
}
