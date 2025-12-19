package scheduler

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	log "github.com/sirupsen/logrus"
)

// Store handles persistence of scheduled tasks and execution logs.
type Store struct {
	mu        sync.RWMutex
	tasksPath string
	logsPath  string
	Tasks     map[string]*Task
	Logs      []*ExecutionLog
	maxLogs   int
}

// NewStore initializes a new Store instance and loads data from disk.
func NewStore(dataDir string) (*Store, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	s := &Store{
		tasksPath: filepath.Join(dataDir, "scheduler_tasks.json"),
		logsPath:  filepath.Join(dataDir, "scheduler_logs.json"),
		Tasks:     make(map[string]*Task),
		Logs:      make([]*ExecutionLog, 0),
		maxLogs:   1000, // Limit log retention
	}

	if err := s.load(); err != nil {
		return nil, err
	}

	return s, nil
}

func (s *Store) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Load Tasks
	if data, err := os.ReadFile(s.tasksPath); err == nil {
		if err := json.Unmarshal(data, &s.Tasks); err != nil {
			log.Warnf("failed to unmarshal scheduler tasks: %v", err)
		}
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("failed to read tasks file: %w", err)
	}

	// Load Logs
	if data, err := os.ReadFile(s.logsPath); err == nil {
		if err := json.Unmarshal(data, &s.Logs); err != nil {
			log.Warnf("failed to unmarshal scheduler logs: %v", err)
		}
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("failed to read logs file: %w", err)
	}

	return nil
}

// Save persists the current state to disk.
func (s *Store) Save() error {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Save Tasks
	data, err := json.MarshalIndent(s.Tasks, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal tasks: %w", err)
	}
	if err := os.WriteFile(s.tasksPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write tasks file: %w", err)
	}

	// Save Logs
	data, err = json.MarshalIndent(s.Logs, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal logs: %w", err)
	}
	if err := os.WriteFile(s.logsPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write logs file: %w", err)
	}

	return nil
}

// AddTask adds or updates a task and saves the store.
func (s *Store) AddTask(task *Task) error {
	s.mu.Lock()
	s.Tasks[task.ID] = task
	s.mu.Unlock()
	return s.Save()
}

// DeleteTask removes a task and saves the store.
func (s *Store) DeleteTask(id string) error {
	s.mu.Lock()
	delete(s.Tasks, id)
	s.mu.Unlock()
	return s.Save()
}

// AddLog appends a new execution log, enforcing the max limit, and saves.
func (s *Store) AddLog(entry *ExecutionLog) error {
	s.mu.Lock()
	// Prepend for newer-first order logic, or append and sort?
	// Let's prepend to keep list sorted by time descending implicitly if used that way.
	// Actually, appending is faster, we can reverse on read.
	s.Logs = append(s.Logs, entry)

	// Trim if needed
	if len(s.Logs) > s.maxLogs {
		// Remove oldest (from start)
		s.Logs = s.Logs[len(s.Logs)-s.maxLogs:]
	}
	s.mu.Unlock()

	// Debounce save? For simplicity, save immediately for now.
	return s.Save()
}

// GetTasks returns a list of all tasks.
func (s *Store) GetTasks() []*Task {
	s.mu.RLock()
	defer s.mu.RUnlock()
	list := make([]*Task, 0, len(s.Tasks))
	for _, t := range s.Tasks {
		list = append(list, t)
	}
	return list
}

// GetTask retrieves a single task by ID.
func (s *Store) GetTask(id string) (*Task, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	t, ok := s.Tasks[id]
	return t, ok
}

// GetLogs returns all logs (optionally filtered could be added later).
func (s *Store) GetLogs() []*ExecutionLog {
	s.mu.RLock()
	defer s.mu.RUnlock()
	// Return copy
	logs := make([]*ExecutionLog, len(s.Logs))
	copy(logs, s.Logs)
	// Reverse to show newest first
	for i, j := 0, len(logs)-1; i < j; i, j = i+1, j-1 {
		logs[i], logs[j] = logs[j], logs[i]
	}
	return logs
}
