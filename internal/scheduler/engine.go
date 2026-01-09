package scheduler

import (
	"context"
	"fmt"
	"sort"
	"strings"
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
	store        *Store
	executor     Executor
	stopChan     chan struct{}
	wg           sync.WaitGroup
	mu           sync.Mutex
	runningTasks sync.Map
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
			if _, loaded := e.runningTasks.LoadOrStore(task.ID, true); loaded {
				log.Debugf("Task %s is already running, skipping", task.ID)
				continue
			}
			// Run asynchronously to not block the ticker
			go e.executeTask(task)
		}
	}
}

func (e *Engine) shouldRun(task *Task, now time.Time) bool {
	task.mu.RLock()
	nextRun := task.NextRunAt
	task.mu.RUnlock()

	// 1. New task (NextRunAt is nil) -> Schedule immediately or calculate next
	if nextRun == nil {
		e.updateNextRun(task, now, false)
		return false // Will run on next tick after update
	}

	// 2. Time has come
	return now.After(*nextRun) || now.Equal(*nextRun)
}

func (e *Engine) updateNextRun(task *Task, baseTime time.Time, forcePersist bool) {
	// Use individual task lock for fields update
	// Calculate updates
	task.Lock()
	var next time.Time
	var shouldPersist = forcePersist // Initialize with forcePersist

	defer func() {
		task.Unlock()
		if shouldPersist {
			// Persist OUTSIDE the lock to avoid deadlock with MarshalJSON (which acquires RLock)
			_ = e.store.AddTask(task)
		}
	}()

	switch task.Type {
	case TaskTypeFixedTime:
		// If task is finished, do not schedule next run
		if task.Status == TaskStatusFinished {
			task.NextRunAt = nil
			// forcePersist (shouldPersist) is already true if passed from executeTask,
			// or if we just changed NextRunAt to nil (though it likely was nil'd in executeTask)
			// But to be safe and consistent with "updateNextRun responsibilities":
			// If we are forcing persist, we rely on the defer.
			return
		}

		if task.FixedTime != nil && task.FixedTime.After(baseTime) {
			next = *task.FixedTime
			// If NextRunAt is not set correctly, update it
			if task.NextRunAt == nil || !task.NextRunAt.Equal(next) {
				task.NextRunAt = &next
				shouldPersist = true
			}
		} else {
			// Fixed time passed or invalid, mark as finished
			task.Status = TaskStatusFinished
			task.NextRunAt = nil
			shouldPersist = true
			return
		}

	case TaskTypeInterval:
		duration, err := time.ParseDuration(task.Interval)
		if err != nil {
			log.Errorf("Invalid interval for task %s: %v", task.ID, err)
			task.Status = TaskStatusPaused // Pause on error
			shouldPersist = true
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
		task.NextRunAt = &next
		shouldPersist = true

	case TaskTypeDaily, TaskTypeSystemReport: // System report uses daily scheduling for now
		dailyTime := task.DailyTime
		if dailyTime == "" {
			log.Errorf("DailyTime is empty for task %s", task.ID)
			task.Status = TaskStatusPaused
			shouldPersist = true
			return
		}

		timePoints := strings.Split(dailyTime, ",")
		var candidates []time.Time

		for _, p := range timePoints {
			p = strings.TrimSpace(p)
			if p == "" {
				continue
			}

			parsedTime, err := time.Parse("15:04", p)
			if err != nil {
				log.Errorf("Invalid time format %s for task %s", p, task.ID)
				continue
			}

			// Create candidate for today
			candidate := time.Date(baseTime.Year(), baseTime.Month(), baseTime.Day(),
				parsedTime.Hour(), parsedTime.Minute(), 0, 0, baseTime.Location())

			// If already passed today, scheduled for tomorrow
			if !candidate.After(baseTime) {
				candidate = candidate.AddDate(0, 0, 1)
			}
			candidates = append(candidates, candidate)
		}

		if len(candidates) == 0 {
			log.Errorf("No valid time points for task %s", task.ID)
			task.Status = TaskStatusPaused
			shouldPersist = true
			return
		}

		// Sort and pick the earliest one
		sort.Slice(candidates, func(i, j int) bool {
			return candidates[i].Before(candidates[j])
		})
		next = candidates[0]
		task.NextRunAt = &next
		shouldPersist = true

	default:
		log.Warnf("Unknown task type %s for task %s, pausing", task.Type, task.ID)
		task.Status = TaskStatusPaused
		task.NextRunAt = nil
		shouldPersist = true
		return
	}
}

func (e *Engine) executeTask(task *Task) {
	defer e.runningTasks.Delete(task.ID)
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
	_ = e.store.AddLog(entry)

	// Update Task State
	task.Lock()
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
	task.Unlock()

	// Persist changes is handled by updateNextRun which saves the full task state (including LastRunAt updates)
	e.updateNextRun(task, now, true) // This will acquire its own lock and persist the next run time
}

// RunTaskNow manually triggers a task execution asynchronously.
func (e *Engine) RunTaskNow(task *Task) error {
	log.Infof("Manual trigger for task: %s", task.Name)
	if _, loaded := e.runningTasks.LoadOrStore(task.ID, true); loaded {
		log.Warnf("Task %s is already running, skipping manual trigger", task.ID)
		return nil
	}
	// Execute in background
	go e.executeTask(task)
	return nil
}
