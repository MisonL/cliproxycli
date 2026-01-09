// Package config provides configuration management for the CLI Proxy API server.
// It handles loading and parsing YAML configuration files, and provides structured
// access to application settings including server port, authentication directory,
// debug settings, proxy configuration, and API keys.
package config

// SDKConfig represents the application's configuration, loaded from a YAML file.
type SDKConfig struct {
	// ProxyURL is the URL of an optional proxy server to use for outbound requests.
	ProxyURL string `yaml:"proxy-url" json:"proxy-url"`

	// ForceModelPrefix requires explicit model prefixes (e.g., "teamA/gemini-3-pro-preview")
	// to target prefixed credentials. When false, unprefixed model requests may use prefixed
	// credentials as well.
	ForceModelPrefix bool `yaml:"force-model-prefix" json:"force-model-prefix"`

	// RequestLog enables or disables detailed request logging functionality.
	RequestLog bool `yaml:"request-log" json:"request-log"`

	// APIKeys is a list of keys for authenticating clients to this proxy server.
	APIKeys []string `yaml:"api-keys" json:"api-keys"`

	// Access holds request authentication provider configuration.
	Access AccessConfig `yaml:"auth,omitempty" json:"auth,omitempty"`

	// OAuthExcludedModels defines per-provider global model exclusions applied to OAuth/file-backed auth entries.
	OAuthExcludedModels map[string][]string `yaml:"oauth-excluded-models,omitempty" json:"oauth-excluded-models,omitempty"`

	// OAuthModelMappings maps model IDs to specific OAuth providers.
	OAuthModelMappings map[string]map[string]ModelNameMapping `yaml:"oauth-model-mappings" json:"oauth-model-mappings"`

	// GeminiKey defines Gemini API key configurations with optional routing overrides.
	GeminiKey []GeminiKey `yaml:"gemini-api-key" json:"gemini-api-key"`

	// CodexKey defines a list of Codex API key configurations as specified in the YAML configuration file.
	CodexKey []CodexKey `yaml:"codex-api-key" json:"codex-api-key"`

	// ClaudeKey defines a list of Claude API key configurations as specified in the YAML configuration file.
	ClaudeKey []ClaudeKey `yaml:"claude-api-key" json:"claude-api-key"`

	// OpenAICompatibility defines OpenAI API compatibility configurations for external providers.
	OpenAICompatibility []OpenAICompatibility `yaml:"openai-compatibility" json:"openai-compatibility"`

	// VertexCompatAPIKey defines Vertex AI-compatible API key configurations for third-party providers.
	// Used for services that use Vertex AI-style paths but with simple API key authentication.
	VertexCompatAPIKey []VertexCompatKey `yaml:"vertex-api-key" json:"vertex-api-key"`

	// AmpCode contains Amp CLI upstream configuration, management restrictions, and model mappings.
	AmpCode AmpCode `yaml:"ampcode" json:"ampcode"`

	// Payload defines default and override rules for provider payload parameters.
	Payload PayloadConfig `yaml:"payload" json:"payload"`

	// AuthDir is the directory where authentication token files are stored.
	AuthDir string `yaml:"auth-dir" json:"-"`

	// Host is the network host/interface on which the API server will bind.
	Host string `yaml:"host" json:"-"`
	// Port is the network port on which the API server will listen.
	Port int `yaml:"port" json:"-"`

	// Routing controls credential selection behavior.
	Routing RoutingConfig `yaml:"routing" json:"routing"`
}

// AccessConfig groups request authentication providers.
type AccessConfig struct {
	// Providers lists configured authentication providers.
	Providers []AccessProvider `yaml:"providers,omitempty" json:"providers,omitempty"`
}

// AccessProvider describes a request authentication provider entry.
type AccessProvider struct {
	// Name is the instance identifier for the provider.
	Name string `yaml:"name" json:"name"`

	// Type selects the provider implementation registered via the SDK.
	Type string `yaml:"type" json:"type"`

	// SDK optionally names a third-party SDK module providing this provider.
	SDK string `yaml:"sdk,omitempty" json:"sdk,omitempty"`

	// APIKeys lists inline keys for providers that require them.
	APIKeys []string `yaml:"api-keys,omitempty" json:"api-keys,omitempty"`

	// Config passes provider-specific options to the implementation.
	Config map[string]any `yaml:"config,omitempty" json:"config,omitempty"`
}

const (
	// AccessProviderTypeConfigAPIKey is the built-in provider validating inline API keys.
	AccessProviderTypeConfigAPIKey = "config-api-key"

	// DefaultAccessProviderName is applied when no provider name is supplied.
	DefaultAccessProviderName = "config-inline"
)

// ConfigAPIKeyProvider returns the first inline API key provider if present.
func (c *SDKConfig) ConfigAPIKeyProvider() *AccessProvider {
	if c == nil {
		return nil
	}
	for i := range c.Access.Providers {
		if c.Access.Providers[i].Type == AccessProviderTypeConfigAPIKey {
			if c.Access.Providers[i].Name == "" {
				c.Access.Providers[i].Name = DefaultAccessProviderName
			}
			return &c.Access.Providers[i]
		}
	}
	return nil
}

// MakeInlineAPIKeyProvider constructs an inline API key provider configuration.
// It returns nil when no keys are supplied.
func MakeInlineAPIKeyProvider(keys []string) *AccessProvider {
	if len(keys) == 0 {
		return nil
	}
	provider := &AccessProvider{
		Name:    DefaultAccessProviderName,
		Type:    AccessProviderTypeConfigAPIKey,
		APIKeys: append([]string(nil), keys...),
	}
	return provider
}

// ModelNameMapping defines a model ID mapping for a specific channel.
type ModelNameMapping struct {
	Name  string `yaml:"name" json:"name"`
	Alias string `yaml:"alias" json:"alias"`
	Fork  bool   `yaml:"fork,omitempty" json:"fork,omitempty"`
}

// RoutingConfig configures how credentials are selected for requests.
type RoutingConfig struct {
	// Strategy selects the credential selection strategy.
	// Supported values: "round-robin" (default), "fill-first".
	Strategy string `yaml:"strategy,omitempty" json:"strategy,omitempty"`

	// Rules defines routing rules for specific models or providers.
	Rules []RoutingRule `yaml:"rules,omitempty" json:"rules,omitempty"`

	// ClientOverrides allows clients to override routing rules.
	ClientOverrides []ClientOverride `yaml:"client-overrides,omitempty" json:"client-overrides,omitempty"`
}

// ClientOverride allows forcing a provider based on User-Agent.
type ClientOverride struct {
	UserAgent     string `yaml:"user-agent" json:"user-agent"`
	ForceProvider string `yaml:"force-provider" json:"force-provider"`
}

// RoutingRule defines a routing rule.
type RoutingRule struct {
	// Name is the name of the rule.
	Name string `yaml:"name" json:"name"`
	// Model defines the model pattern to match (e.g., "gemini-*" or "gpt-4").
	Model string `yaml:"model" json:"model"`
	// Priority defines the preferred provider order for this rule.
	Priority []string `yaml:"priority" json:"priority"`
}

// ClaudeKey represents the configuration for a Claude API key.
type ClaudeKey struct {
	APIKey         string            `yaml:"api-key" json:"api-key"`
	Prefix         string            `yaml:"prefix,omitempty" json:"prefix,omitempty"`
	BaseURL        string            `yaml:"base-url" json:"base-url"`
	ProxyURL       string            `yaml:"proxy-url" json:"proxy-url"`
	Models         []ClaudeModel     `yaml:"models" json:"models"`
	Headers        map[string]string `yaml:"headers,omitempty" json:"headers,omitempty"`
	ExcludedModels []string          `yaml:"excluded-models,omitempty" json:"excluded-models,omitempty"`
}

type ClaudeModel struct {
	Name  string `yaml:"name" json:"name"`
	Alias string `yaml:"alias" json:"alias"`
}

func (m ClaudeModel) GetName() string  { return m.Name }
func (m ClaudeModel) GetAlias() string { return m.Alias }

// CodexKey represents the configuration for a Codex API key.
type CodexKey struct {
	APIKey         string            `yaml:"api-key" json:"api-key"`
	Prefix         string            `yaml:"prefix,omitempty" json:"prefix,omitempty"`
	BaseURL        string            `yaml:"base-url" json:"base-url"`
	ProxyURL       string            `yaml:"proxy-url" json:"proxy-url"`
	Models         []CodexModel      `yaml:"models" json:"models"`
	Headers        map[string]string `yaml:"headers,omitempty" json:"headers,omitempty"`
	ExcludedModels []string          `yaml:"excluded-models,omitempty" json:"excluded-models,omitempty"`
}

type CodexModel struct {
	Name  string `yaml:"name" json:"name"`
	Alias string `yaml:"alias" json:"alias"`
}

func (m CodexModel) GetName() string  { return m.Name }
func (m CodexModel) GetAlias() string { return m.Alias }

// GeminiKey represents the configuration for a Gemini API key.
type GeminiKey struct {
	APIKey         string            `yaml:"api-key" json:"api-key"`
	Prefix         string            `yaml:"prefix,omitempty" json:"prefix,omitempty"`
	BaseURL        string            `yaml:"base-url,omitempty" json:"base-url,omitempty"`
	ProxyURL       string            `yaml:"proxy-url,omitempty" json:"proxy-url,omitempty"`
	Models         []GeminiModel     `yaml:"models,omitempty" json:"models,omitempty"`
	Headers        map[string]string `yaml:"headers,omitempty" json:"headers,omitempty"`
	ExcludedModels []string          `yaml:"excluded-models,omitempty" json:"excluded-models,omitempty"`
}

type GeminiModel struct {
	Name  string `yaml:"name" json:"name"`
	Alias string `yaml:"alias" json:"alias"`
}

func (m GeminiModel) GetName() string  { return m.Name }
func (m GeminiModel) GetAlias() string { return m.Alias }

// OpenAICompatibility represents the configuration for OpenAI API compatibility.
type OpenAICompatibility struct {
	Name          string                      `yaml:"name" json:"name"`
	Prefix        string                      `yaml:"prefix,omitempty" json:"prefix,omitempty"`
	BaseURL       string                      `yaml:"base-url" json:"base-url"`
	APIKeyEntries []OpenAICompatibilityAPIKey `yaml:"api-key-entries,omitempty" json:"api-key-entries,omitempty"`
	Models        []OpenAICompatibilityModel  `yaml:"models" json:"models"`
	Headers       map[string]string           `yaml:"headers,omitempty" json:"headers,omitempty"`
}

type OpenAICompatibilityAPIKey struct {
	APIKey   string `yaml:"api-key" json:"api-key"`
	ProxyURL string `yaml:"proxy-url,omitempty" json:"proxy-url,omitempty"`
}

type OpenAICompatibilityModel struct {
	Name  string `yaml:"name" json:"name"`
	Alias string `yaml:"alias" json:"alias"`
}

// VertexCompatKey defines Vertex AI-compatible API key configurations.
type VertexCompatKey struct {
	APIKey         string              `yaml:"api-key" json:"api-key"`
	Prefix         string              `yaml:"prefix,omitempty" json:"prefix,omitempty"`
	BaseURL        string              `yaml:"base-url" json:"base-url"`
	ProxyURL       string              `yaml:"proxy-url" json:"proxy-url"`
	Models         []VertexCompatModel `yaml:"models" json:"models"`
	Headers        map[string]string   `yaml:"headers,omitempty" json:"headers,omitempty"`
	ExcludedModels []string            `yaml:"excluded-models,omitempty" json:"excluded-models,omitempty"`
}

type VertexCompatModel struct {
	Name  string `yaml:"name" json:"name"`
	Alias string `yaml:"alias" json:"alias"`
}

func (m VertexCompatModel) GetName() string  { return m.Name }
func (m VertexCompatModel) GetAlias() string { return m.Alias }

// AmpCode groups Amp CLI integration settings.
type AmpCode struct {
	UpstreamURL                   string                   `yaml:"upstream-url" json:"upstream-url"`
	UpstreamAPIKey                string                   `yaml:"upstream-api-key" json:"upstream-api-key"`
	UpstreamAPIKeys               []AmpUpstreamAPIKeyEntry `yaml:"upstream-api-keys,omitempty" json:"upstream-api-keys,omitempty"`
	RestrictManagementToLocalhost bool                     `yaml:"restrict-management-to-localhost" json:"restrict-management-to-localhost"`
	ModelMappings                 []AmpModelMapping        `yaml:"model-mappings" json:"model-mappings"`
	ForceModelMappings            bool                     `yaml:"force-model-mappings" json:"force-model-mappings"`
}

type AmpUpstreamAPIKeyEntry struct {
	UpstreamAPIKey string   `yaml:"upstream-api-key" json:"upstream-api-key"`
	APIKeys        []string `yaml:"api-keys" json:"api-keys"`
}

type AmpModelMapping struct {
	From  string `yaml:"from" json:"from"`
	To    string `yaml:"to" json:"to"`
	Regex bool   `yaml:"regex,omitempty" json:"regex,omitempty"`
}

// PayloadConfig defines default and override parameter rules applied to provider payloads.
type PayloadConfig struct {
	Default  []PayloadRule `yaml:"default" json:"default"`
	Override []PayloadRule `yaml:"override" json:"override"`
}

type PayloadRule struct {
	Models []PayloadModelRule `yaml:"models" json:"models"`
	Params map[string]any     `yaml:"params" json:"params"`
}

type PayloadModelRule struct {
	Name     string `yaml:"name" json:"name"`
	Protocol string `yaml:"protocol" json:"protocol"`
}
