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
	store         *Store
}

func NewLoopbackExecutor(baseURL, localPwd string, store *Store) *LoopbackExecutor {
	return &LoopbackExecutor{
		BaseURL:       strings.TrimRight(baseURL, "/"),
		LocalPassword: localPwd,
		store:         store,
	}
}

func (e *LoopbackExecutor) Execute(ctx context.Context, task *Task) (string, error) {
	if task.Type == TaskTypeSystemReport {
		return e.generateSystemReport(task)
	}

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
		req.Header.Set("Authorization", "Bearer "+e.LocalPassword)
	}
	// Add specific User-Agent to identify scheduler traffic
	req.Header.Set("User-Agent", "CLIProxyAPI-Scheduler/1.0")

	client := &http.Client{Timeout: 5 * time.Minute} // Long timeout for AI
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("http request failed: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

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

func (e *LoopbackExecutor) generateSystemReport(task *Task) (string, error) {
	if e.store == nil {
		return "Store not initialized", nil
	}

	tasks := e.store.GetTasks()
	logs := e.store.GetLogs()

	totalTasks := len(tasks)
	activeTasks := 0
	for _, t := range tasks {
		if t.Status == TaskStatusActive {
			activeTasks++
		}
	}

	now := time.Now()
	oneDayAgo := now.Add(-24 * time.Hour)
	recentLogs := 0
	recentFailures := 0

	for _, l := range logs {
		if l.ExecutedAt.After(oneDayAgo) {
			recentLogs++
			if !l.Success {
				recentFailures++
			}
		}
	}

	successRate := 100.0
	if recentLogs > 0 {
		successRate = float64(recentLogs-recentFailures) / float64(recentLogs) * 100
	}

	report := fmt.Sprintf(
		"**System Report**\n\n"+
			"- Total Tasks: %d\n"+
			"- Active Tasks: %d\n"+
			"- Executions (24h): %d\n"+
			"- Failures (24h): %d\n"+
			"- Success Rate (24h): %.1f%%\n"+
			"- Generated At: %s",
		totalTasks, activeTasks, recentLogs, recentFailures, successRate, now.Format(time.RFC3339),
	)

	if task.WebhookURL != "" {
		go e.triggerWebhook(task, report)
	}

	return report, nil
}

func (e *LoopbackExecutor) triggerWebhook(task *Task, content string) {
	var payload interface{}

	// Detect WeCom Webhook
	if strings.Contains(task.WebhookURL, "qyapi.weixin.qq.com") {
		// Use Template Card for WeCom
		// Format: https://developer.work.weixin.qq.com/document/path/91770

		// Truncate content for desc if too long
		desc := content
		if len(desc) > 100 {
			desc = desc[:97] + "..."
		}

		payload = map[string]interface{}{
			"msgtype": "template_card",
			"template_card": map[string]interface{}{
				"card_type": "text_notice",
				"source": map[string]string{
					"icon_url": "https://wework.qpic.cn/wwpic/252813_jOfDHtcISzuay14_1628280241/0",
					"desc":     desc,
				},
				"main_title": map[string]string{
					"title": fmt.Sprintf("Task: %s", task.Name),
					"desc":  "Task Execution Result",
				},
				"emphasis_content": map[string]string{
					"title": "Success",
					"desc":  "Status",
				},
				"sub_title_text": fmt.Sprintf("Executed at: %s", time.Now().Format("2006-01-02 15:04:05")),
				"horizontal_content_list": []map[string]string{
					{
						"keyname": "Task Type",
						"value":   string(task.Type),
					},
					{
						"keyname": "Model",
						"value":   task.Model,
					},
				},
				"card_action": map[string]string{
					"type": "url",
					"url":  "http://localhost:21301/management.html", // Ideally configurable
				},
				// Use quote_area for the main content
				"quote_area": map[string]string{
					"type":       "text",
					"quote_text": content,
				},
			},
		}

		// Adjust for System Report
		if task.Type == TaskTypeSystemReport {
			// Parse simple key-values from markdown report for visual presentation?
			// For now, just put the report in quote_text
			payload.(map[string]interface{})["template_card"].(map[string]interface{})["main_title"].(map[string]string)["title"] = "System Report"
		}

	} else {
		// Default JSON payload
		payload = map[string]interface{}{
			"task_id":     task.ID,
			"task_name":   task.Name,
			"executed_at": time.Now(),
			"content":     content,
		}
	}

	data, _ := json.Marshal(payload)
	resp, err := http.Post(task.WebhookURL, "application/json", bytes.NewBuffer(data))
	if err != nil {
		log.Warnf("Webhook failed for task %s: %v", task.ID, err)
		return
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	// Read response for debugging if needed
	// body, _ := io.ReadAll(resp.Body)
	// log.Infof("Webhook response: %s", string(body))

	log.Infof("Webhook dispatched for task %s, status: %d", task.ID, resp.StatusCode)
}
