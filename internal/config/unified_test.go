package config

import (
	"testing"
)

func TestSanitizeProviders(t *testing.T) {
	tests := []struct {
		name     string
		input    *Config
		expected *Config
	}{
		{
			name: "empty config",
			input: &Config{},
			expected: &Config{
				Scheduling: SchedulingConfig{
					Strategy: "priority",
					Retry:    0,
				},
				Providers: []UnifiedProvider{},
			},
		},
		{
			name: "normalize strategy",
			input: &Config{
				Scheduling: SchedulingConfig{
					Strategy: "  PRIORITY  ",
					Retry:    5,
				},
			},
			expected: &Config{
				Scheduling: SchedulingConfig{
					Strategy: "priority",
					Retry:    5,
				},
				Providers: []UnifiedProvider{},
			},
		},
		{
			name: "default strategy",
			input: &Config{
				Scheduling: SchedulingConfig{},
			},
			expected: &Config{
				Scheduling: SchedulingConfig{
					Strategy: "priority",
					Retry:    0,
				},
				Providers: []UnifiedProvider{},
			},
		},
		{
			name: "normalize providers",
			input: &Config{
				Providers: []UnifiedProvider{
					{
						Type:      "  GEMINI  ",
						ID:        "  test-id  ",
						Priority:  0,
						Weight:    0,
						Enabled:   nil,
						Prefix:    "  test/  ",
						ProxyURL:  "  http://proxy.com  ",
						Credentials: map[string]string{
							"api_key": "  key123  ",
						},
					},
				},
			},
			expected: &Config{
				Scheduling: SchedulingConfig{
					Strategy: "priority",
					Retry:    0,
				},
				Providers: []UnifiedProvider{
					{
						Type:      "gemini",
						ID:        "test-id",
						Priority:  10,
						Weight:    100,
						Enabled:   boolPtr(true),
						Prefix:    "test",
						ProxyURL:  "http://proxy.com",
						Credentials: map[string]string{
							"api_key": "  key123  ",
						},
					},
				},
			},
		},
		{
			name: "skip provider with empty type",
			input: &Config{
				Providers: []UnifiedProvider{
					{
						Type: "   ",
						ID:   "test",
					},
				},
			},
			expected: &Config{
				Scheduling: SchedulingConfig{
					Strategy: "priority",
					Retry:    0,
				},
				Providers: []UnifiedProvider{},
			},
		},
		{
			name: "negative retry",
			input: &Config{
				Scheduling: SchedulingConfig{
					Retry: -1,
				},
			},
			expected: &Config{
				Scheduling: SchedulingConfig{
					Strategy: "priority",
					Retry:    3,
				},
				Providers: []UnifiedProvider{},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.input.SanitizeProviders()

			if tt.input.Scheduling.Strategy != tt.expected.Scheduling.Strategy {
				t.Errorf("Strategy = %v, want %v", tt.input.Scheduling.Strategy, tt.expected.Scheduling.Strategy)
			}
			if tt.input.Scheduling.Retry != tt.expected.Scheduling.Retry {
				t.Errorf("Retry = %v, want %v", tt.input.Scheduling.Retry, tt.expected.Scheduling.Retry)
			}
			if len(tt.input.Providers) != len(tt.expected.Providers) {
				t.Errorf("Providers count = %v, want %v", len(tt.input.Providers), len(tt.expected.Providers))
			}
			if len(tt.input.Providers) > 0 {
				p := tt.input.Providers[0]
				ep := tt.expected.Providers[0]
				if p.Type != ep.Type {
					t.Errorf("Provider Type = %v, want %v", p.Type, ep.Type)
				}
				if p.ID != ep.ID {
					t.Errorf("Provider ID = %v, want %v", p.ID, ep.ID)
				}
				if p.Priority != ep.Priority {
					t.Errorf("Provider Priority = %v, want %v", p.Priority, ep.Priority)
				}
				if p.Weight != ep.Weight {
					t.Errorf("Provider Weight = %v, want %v", p.Weight, ep.Weight)
				}
				if p.Enabled == nil || ep.Enabled == nil {
					t.Errorf("Provider Enabled should not be nil")
				} else if *p.Enabled != *ep.Enabled {
					t.Errorf("Provider Enabled = %v, want %v", *p.Enabled, *ep.Enabled)
				}
				if p.Prefix != ep.Prefix {
					t.Errorf("Provider Prefix = %v, want %v", p.Prefix, ep.Prefix)
				}
				if p.ProxyURL != ep.ProxyURL {
					t.Errorf("Provider ProxyURL = %v, want %v", p.ProxyURL, ep.ProxyURL)
				}
			}
		})
	}
}

func boolPtr(b bool) *bool {
	return &b
}