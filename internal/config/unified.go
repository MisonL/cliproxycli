package config

import "strings"

// SchedulingConfig defines the global scheduling strategy for unified providers.
type SchedulingConfig struct {
	// Strategy defines how to select a provider when multiple are available.
	// Options: "priority" (default), "load-balance", "round-robin", "sticky".
	Strategy string `yaml:"strategy" json:"strategy"`

	// Retry defines the number of retries for failed requests.
	Retry int `yaml:"retry" json:"retry"`

	// Fallback enables automatic failover to the next available provider.
	Fallback bool `yaml:"fallback" json:"fallback"`
}

// UnifiedProvider defines a standard configuration for any AI provider.
// It unifies API keys, OAuth, and other credentials into a single structure.
type UnifiedProvider struct {
	// ID is a unique identifier for this provider instance.
	// If empty, it will be auto-generated based on type and index.
	ID string `yaml:"id,omitempty" json:"id,omitempty"`

	// Type identifies the provider driver (e.g., "gemini", "claude", "openai").
	Type string `yaml:"type" json:"type"`

	// Enabled controls whether this provider is active. Default true.
	Enabled *bool `yaml:"enabled,omitempty" json:"enabled,omitempty"`

	// Priority determines the order of selection (lower value = higher priority).
	// Used when Strategy is "priority". Default 10.
	Priority int `yaml:"priority,omitempty" json:"priority,omitempty"`

	// Weight determines the traffic distribution (higher value = more traffic).
	// Used when Strategy is "load-balance". Default 100.
	Weight int `yaml:"weight,omitempty" json:"weight,omitempty"`

	// Tags are arbitrary labels used for sticky routing or custom filtering.
	Tags []string `yaml:"tags,omitempty" json:"tags,omitempty"`

	// Prefix is a routing prefix. Requesting "prefix/model" will force use of this provider.
	Prefix string `yaml:"prefix,omitempty" json:"prefix,omitempty"`

	// Credentials holds the authentication details. Content depends on Type.
	Credentials map[string]string `yaml:"credentials" json:"credentials"`

	// ProxyURL overrides the global proxy for this specific provider.
	ProxyURL string `yaml:"proxy-url,omitempty" json:"proxy-url,omitempty"`

	// Models defines which models are supported, included, or excluded.
	Models ProviderModelConfig `yaml:"models,omitempty" json:"models,omitempty"`
}

// ProviderModelConfig controls model visibility and aliasing for a provider.
type ProviderModelConfig struct {
	// Include is a list of glob patterns for models to explicit allow.
	// If empty, all models are allowed (subject to Exclude).
	Include []string `yaml:"include,omitempty" json:"include,omitempty"`

	// Exclude is a list of glob patterns for models to hide.
	Exclude []string `yaml:"exclude,omitempty" json:"exclude,omitempty"`

	// Alias maps client-facing model names to upstream model names.
	// Example: "gpt-4o" -> "deepseek-coder"
	Alias map[string]string `yaml:"alias,omitempty" json:"alias,omitempty"`
}

// SanitizeProviders sets defaults and normalizes provider configurations.
func (cfg *Config) SanitizeProviders() {
	if cfg == nil {
		return
	}

	// Normalize Scheduling defaults
	cfg.Scheduling.Strategy = strings.ToLower(strings.TrimSpace(cfg.Scheduling.Strategy))
	if cfg.Scheduling.Strategy == "" {
		cfg.Scheduling.Strategy = "priority"
	}
	if cfg.Scheduling.Retry < 0 {
		cfg.Scheduling.Retry = 3 // Default retry count
	}

	// Filter and normalize providers
	validProviders := make([]UnifiedProvider, 0, len(cfg.Providers))
	for i := range cfg.Providers {
		p := cfg.Providers[i]

		// Normalize Type
		p.Type = strings.ToLower(strings.TrimSpace(p.Type))
		if p.Type == "" {
			continue // Skip providers with no type
		}

		// Defaults
		if p.Priority == 0 {
			p.Priority = 10
		}
		if p.Weight == 0 {
			p.Weight = 100
		}

		if p.Enabled == nil {
			t := true
			p.Enabled = &t
		}

		p.ID = strings.TrimSpace(p.ID)
		p.Prefix = normalizeModelPrefix(p.Prefix)
		p.ProxyURL = strings.TrimSpace(p.ProxyURL)

		validProviders = append(validProviders, p)
	}
	cfg.Providers = validProviders
}
