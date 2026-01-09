package management

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"cliproxy/internal/config"
)

// GetSchedulingConfig returns the current scheduling strategy configuration.
func (h *Handler) GetSchedulingConfig(c *gin.Context) {
	if h.cfg == nil {
		c.JSON(http.StatusOK, config.SchedulingConfig{})
		return
	}
	c.JSON(http.StatusOK, h.cfg.Scheduling)
}

// PutSchedulingConfig updates the scheduling strategy configuration.
func (h *Handler) PutSchedulingConfig(c *gin.Context) {
	var body config.SchedulingConfig
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body", "details": err.Error()})
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	h.cfg.Scheduling = body
	h.persist(c)
}

// GetUnifiedProviders returns the list of unified providers.
func (h *Handler) GetUnifiedProviders(c *gin.Context) {
	if h.cfg == nil {
		c.JSON(http.StatusOK, []config.UnifiedProvider{})
		return
	}
	c.JSON(http.StatusOK, h.cfg.Providers)
}

// PutUnifiedProviders updates the list of unified providers.
func (h *Handler) PutUnifiedProviders(c *gin.Context) {
	var body []config.UnifiedProvider
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body, expected array of providers", "details": err.Error()})
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	h.cfg.Providers = body
	h.cfg.SanitizeProviders() // Ensure validation logic runs
	h.persist(c)
}
