package scheduler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestLoopbackExecutor_Execute_Headers(t *testing.T) {
	// 1. Setup Mock Server
	var capturedAuthHeader, capturedLocalPwdHeader string

	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedAuthHeader = r.Header.Get("Authorization")
		capturedLocalPwdHeader = r.Header.Get("X-Local-Password")

		// Return mock success response
		response := map[string]interface{}{
			"choices": []interface{}{
				map[string]interface{}{
					"message": map[string]interface{}{
						"content": "mock response",
					},
				},
			},
		}
		json.NewEncoder(w).Encode(response)
	}))
	defer mockServer.Close()

	// 2. Setup Executor
	localPwd := "test-internal-pwd"
	executor := NewLoopbackExecutor(mockServer.URL, localPwd, nil)

	// 3. Execute Task
	task := &Task{
		Type:   TaskTypeFixedTime, // non-system report type
		Prompt: "hello",
		Model:  "gpt-4",
	}

	_, err := executor.Execute(context.Background(), task)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// 4. Verify Headers
	if capturedLocalPwdHeader != localPwd {
		t.Errorf("expected X-Local-Password %q, got %q", localPwd, capturedLocalPwdHeader)
	}
	expectedBearer := "Bearer " + localPwd
	if capturedAuthHeader != expectedBearer {
		t.Errorf("expected Authorization %q, got %q", expectedBearer, capturedAuthHeader)
	}
}

func TestLoopbackExecutor_Execute_NoPassword(t *testing.T) {
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Local-Password") != "" {
			t.Error("expected no X-Local-Password header")
		}
		// Return mock success response
		response := map[string]interface{}{
			"choices": []interface{}{
				map[string]interface{}{
					"message": map[string]interface{}{
						"content": "mock response",
					},
				},
			},
		}
		json.NewEncoder(w).Encode(response)
	}))
	defer mockServer.Close()

	// No password provided
	executor := NewLoopbackExecutor(mockServer.URL, "", nil)

	task := &Task{Prompt: "hi", Model: "gpt-4"}
	_, err := executor.Execute(context.Background(), task)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}
