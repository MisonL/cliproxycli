package scheduler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/router-for-me/CLIProxyAPI/v6/internal/scheduler"
)

type Handler struct {
	store  *scheduler.Store
	engine *scheduler.Engine
}

func NewHandler(store *scheduler.Store, engine *scheduler.Engine) *Handler {
	return &Handler{
		store:  store,
		engine: engine,
	}
}

func (h *Handler) ListTasks(c *gin.Context) {
	tasks := h.store.GetTasks()
	c.JSON(http.StatusOK, tasks)
}

func (h *Handler) GetTask(c *gin.Context) {
	id := c.Param("id")
	task, ok := h.store.GetTask(id)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}
	c.JSON(http.StatusOK, task)
}

func (h *Handler) CreateTask(c *gin.Context) {
	var req struct {
		Name       string `json:"name" binding:"required"`
		Type       string `json:"type" binding:"required"` // interval, fixed_time
		Interval   string `json:"interval"`
		FixedTime  string `json:"fixed_time"` // ISO8601 string
		Prompt     string `json:"prompt" binding:"required"`
		Model      string `json:"model" binding:"required"`
		WebhookURL string `json:"webhook_url"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	task := &scheduler.Task{
		ID:         uuid.New().String(),
		Name:       req.Name,
		Type:       scheduler.TaskType(req.Type),
		Prompt:     req.Prompt,
		Model:      req.Model,
		WebhookURL: req.WebhookURL,
		Status:     scheduler.TaskStatusActive, // Default active
		CreatedAt:  time.Now(),
	}

	if task.Type == scheduler.TaskTypeInterval {
		if req.Interval == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "interval is required for interval tasks"})
			return
		}
		task.Interval = req.Interval
	} else if task.Type == scheduler.TaskTypeFixedTime {
		if req.FixedTime == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "fixed_time is required for fixed_time tasks"})
			return
		}
		t, err := time.Parse(time.RFC3339, req.FixedTime)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid fixed_time format (RFC3339 required)"})
			return
		}
		task.FixedTime = &t
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid task type"})
		return
	}

	if err := h.store.AddTask(task); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save task"})
		return
	}

	c.JSON(http.StatusCreated, task)
}

func (h *Handler) UpdateTask(c *gin.Context) {
	id := c.Param("id")
	task, ok := h.store.GetTask(id)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}

	var req struct {
		Name       *string `json:"name"`
		Status     *string `json:"status"`
		Prompt     *string `json:"prompt"`
		Interval   *string `json:"interval"`
		WebhookURL *string `json:"webhook_url"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Name != nil {
		task.Name = *req.Name
	}
	if req.Status != nil {
		task.Status = scheduler.TaskStatus(*req.Status)
	}
	if req.Prompt != nil {
		task.Prompt = *req.Prompt
	}
	if req.WebhookURL != nil {
		task.WebhookURL = *req.WebhookURL
	}
	if req.Interval != nil && task.Type == scheduler.TaskTypeInterval {
		task.Interval = *req.Interval
	}

	// Reset next run calculation if schedule params changed?
	// For simplicity, let the engine handle it on next tick (it updates if NextRunAt is wrong/past).
	// Ideally we set NextRunAt = nil to force recalc.
	task.NextRunAt = nil

	if err := h.store.AddTask(task); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update task"})
		return
	}

	c.JSON(http.StatusOK, task)
}

func (h *Handler) DeleteTask(c *gin.Context) {
	id := c.Param("id")
	if err := h.store.DeleteTask(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete task"})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) GetLogs(c *gin.Context) {
	logs := h.store.GetLogs()
	c.JSON(http.StatusOK, logs)
}
