package scheduler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	log "github.com/sirupsen/logrus"
)

type LoopbackExecutor struct {
	BaseURL       string
	AuthToken     string // Optional: Bearer token if needed
	LocalPassword string // Optional: X-Local-Password
}

func NewLoopbackExecutor(baseURL, localPwd string) *LoopbackExecutor {
	return &LoopbackExecutor{
		BaseURL:       strings.TrimRight(baseURL, "/"),
		LocalPassword: localPwd,
	}
}

func (e *LoopbackExecutor) Execute(ctx context.Context, task *Task) (string, error) {
	// Construct generic chat completion request
	// Assuming OpenAI compatible format for simplicity as it covers most
	requestBody := map[string]interface{}{
		"model": task.Model,
		"messages": []map[string]string{
			{"role": "user", "content": task.Prompt},
		},
	}

	bodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	url := fmt.Sprintf("%s/v1/chat/completions", e.BaseURL)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if e.LocalPassword != "" {
		req.Header.Set("X-Local-Password", e.LocalPassword)
	}
	// Add specific User-Agent to identify scheduler traffic
	req.Header.Set("User-Agent", "CLIProxyAPI-Scheduler/1.0")

	client := &http.Client{Timeout: 5 * time.Minute} // Long timeout for AI
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("http request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode >= 400 {
		return string(respBody), fmt.Errorf("api returned error status: %d", resp.StatusCode)
	}

	// Parse response to extract just the content
	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return string(respBody), nil // Return raw body if parse fails
	}

	// Try to extract content from standard OpenAI format
	if choices, ok := result["choices"].([]interface{}); ok && len(choices) > 0 {
		if choice, ok := choices[0].(map[string]interface{}); ok {
			if message, ok := choice["message"].(map[string]interface{}); ok {
				if content, ok := message["content"].(string); ok {
					// Trigger Webhook if configured
					if task.WebhookURL != "" {
						go e.triggerWebhook(task, content)
					}
					return content, nil
				}
			}
		}
	}

	return string(respBody), nil
}

func (e *LoopbackExecutor) triggerWebhook(task *Task, content string) {
	payload := map[string]interface{}{
		"task_id":     task.ID,
		"task_name":   task.Name,
		"executed_at": time.Now(),
		"content":     content,
	}

	data, _ := json.Marshal(payload)
	resp, err := http.Post(task.WebhookURL, "application/json", bytes.NewBuffer(data))
	if err != nil {
		log.Warnf("Webhook failed for task %s: %v", task.ID, err)
		return
	}
	defer resp.Body.Close()
	log.Infof("Webhook dispatched for task %s, status: %d", task.ID, resp.StatusCode)
}
