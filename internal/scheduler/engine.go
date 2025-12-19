package scheduler

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	log "github.com/sirupsen/logrus"
)

// Executor defines the interface for running AI tasks.
type Executor interface {
	Execute(ctx context.Context, task *Task) (string, error)
}

// Engine manages the scheduling and execution of tasks.
type Engine struct {
	store    *Store
	executor Executor
	stopChan chan struct{}
	wg       sync.WaitGroup
	mu       sync.Mutex
}

// NewEngine creates a new scheduler engine.
func NewEngine(store *Store, executor Executor) *Engine {
	return &Engine{
		store:    store,
		executor: executor,
		stopChan: make(chan struct{}),
	}
}

// Start begins the scheduling loop.
func (e *Engine) Start() {
	e.wg.Add(1)
	go e.runLoop()
	log.Info("Scheduler engine started")
}

// Stop gracefully shuts down the scheduler.
func (e *Engine) Stop() {
	close(e.stopChan)
	e.wg.Wait()
	log.Info("Scheduler engine stopped")
}

func (e *Engine) runLoop() {
	defer e.wg.Done()
	ticker := time.NewTicker(5 * time.Second) // Check every 5 seconds
	defer ticker.Stop()

	for {
		select {
		case <-e.stopChan:
			return
		case <-ticker.C:
			e.checkAndRunTasks()
		}
	}
}

func (e *Engine) checkAndRunTasks() {
	tasks := e.store.GetTasks()
	now := time.Now()

	for _, task := range tasks {
		if task.Status != TaskStatusActive {
			continue
		}

		if e.shouldRun(task, now) {
			// Run asynchronously to not block the ticker
			go e.executeTask(task)
		}
	}
}

func (e *Engine) shouldRun(task *Task, now time.Time) bool {
	// 1. New task (NextRunAt is nil) -> Schedule immediately or calculate next
	if task.NextRunAt == nil {
		e.updateNextRun(task, now)
		return false // Will run on next tick after update
	}

	// 2. Time has come
	return now.After(*task.NextRunAt) || now.Equal(*task.NextRunAt)
}

func (e *Engine) updateNextRun(task *Task, baseTime time.Time) {
	e.mu.Lock()
	defer e.mu.Unlock()

	var next time.Time

	switch task.Type {
	case TaskTypeFixedTime:
		if task.FixedTime != nil && task.FixedTime.After(baseTime) {
			next = *task.FixedTime
		} else {
			// Fixed time passed or invalid, mark as finished
			task.Status = TaskStatusFinished
			e.store.AddTask(task)
			return
		}
	case TaskTypeInterval:
		duration, err := time.ParseDuration(task.Interval)
		if err != nil {
			log.Errorf("Invalid interval for task %s: %v", task.ID, err)
			task.Status = TaskStatusPaused // Pause on error
			e.store.AddTask(task)
			return
		}
		// If last run is set, add interval to it. Otherwise add to now.
		if task.LastRunAt != nil {
			next = task.LastRunAt.Add(duration)
			// Catch up if we missed many intervals? For now, just schedule from now if way behind.
			if next.Before(baseTime) {
				next = baseTime.Add(duration)
			}
		} else {
			next = baseTime.Add(duration)
		}
	}

	task.NextRunAt = &next
	e.store.AddTask(task)
}

func (e *Engine) executeTask(task *Task) {
	// Double check status inside goroutine?
	// e.mu.Lock()... no, task passed by ref might change, but fine for now.

	log.Infof("Executing task: %s (%s)", task.Name, task.ID)
	start := time.Now()

	// Call Executor
	output, err := e.executor.Execute(context.Background(), task)
	duration := time.Since(start)

	success := err == nil
	outputStr := output
	if err != nil {
		outputStr = fmt.Sprintf("Error: %v", err)
	}

	// Log result
	entry := &ExecutionLog{
		ID:         uuid.New().String(),
		TaskID:     task.ID,
		TaskName:   task.Name,
		ExecutedAt: start,
		DurationMs: duration.Milliseconds(),
		Success:    success,
		Output:     outputStr,
	}
	e.store.AddLog(entry)

	// Update Task State
	e.mu.Lock()
	now := time.Now()
	task.LastRunAt = &now
	if !success {
		task.FailureCount++
	} else {
		task.FailureCount = 0
	}

	// Special handling for FixedTime: finish it
	if task.Type == TaskTypeFixedTime {
		task.Status = TaskStatusFinished
		task.NextRunAt = nil
	}
	e.mu.Unlock() // Unlock before calculating next to avoid deadlock if updateNextRun locks

	if task.Type != TaskTypeFixedTime {
		e.updateNextRun(task, now)
	} else {
		e.store.AddTask(task)
	}
}
