package router

import (
	"context"
	"strings"

	"github.com/router-for-me/CLIProxyAPI/v6/internal/config"
	"github.com/router-for-me/CLIProxyAPI/v6/internal/registry"
)

// Router handles model ID parsing and client selection logic.
type Router struct {
	registry *registry.ModelRegistry
	cfg      *config.RoutingConfig
}

// NewRouter creates a new router instance.
func NewRouter(r *registry.ModelRegistry, cfg *config.RoutingConfig) *Router {
	return &Router{
		registry: r,
		cfg:      cfg,
	}
}

// ParsedModel represents the components of a requested model ID.
type ParsedModel struct {
	OriginalID     string
	CleanID        string
	ProviderFilter string // e.g., "antigravity", "geminicli"
	IsDirect       bool
}

// ParseModelID splits an input model ID into its components.
// Supports formats:
// - "gemini-1.5-flash" (Pooled)
// - "ant:gemini-1.5-flash" (Direct to Antigravity)
// - "gcli:gemini-1.5-flash" (Direct to GeminiCLI)
func (r *Router) ParseModelID(modelID string) *ParsedModel {
	p := &ParsedModel{
		OriginalID: modelID,
		CleanID:    modelID,
	}

	parts := strings.SplitN(modelID, ":", 2)
	if len(parts) == 2 {
		prefix := strings.ToLower(parts[0])
		p.CleanID = parts[1]
		p.IsDirect = true

		switch prefix {
		case "ant":
			p.ProviderFilter = "antigravity"
		case "gcli":
			p.ProviderFilter = "gemini-cli"
		case "vtx":
			p.ProviderFilter = "vertex"
		case "if":
			p.ProviderFilter = "iflow"
		case "as":
			p.ProviderFilter = "aistudio"
		default:
			// If prefix isn't recognized, treat the whole thing as the ID
			p.CleanID = modelID
			p.IsDirect = false
		}
	}

	return p
}

// RouteResult contains the chosen providers and the true model ID.
type RouteResult struct {
	Providers []string
	ModelID   string // The ID recognized by the provider
}

// Resolve identifies the target providers and normalized model ID for a request.
func (r *Router) Resolve(ctx context.Context, modelID string, userAgent string) (*RouteResult, error) {
	// 1. Check for client overrides (Contextual Routing)
	if r.cfg != nil {
		for _, override := range r.cfg.ClientOverrides {
			if strings.Contains(strings.ToLower(userAgent), strings.ToLower(override.UserAgent)) {
				if override.ForceProvider != "" {
					return &RouteResult{
						Providers: []string{override.ForceProvider},
						ModelID:   modelID,
					}, nil
				}
			}
		}
	}

	// 2. Parse for namespaces (Direct Binding)
	parsed := r.ParseModelID(modelID)
	if parsed.IsDirect {
		return &RouteResult{
			Providers: []string{parsed.ProviderFilter},
			ModelID:   parsed.CleanID,
		}, nil
	}

	// 3. Fallback to standard registry lookup (Pooled)
	providers := r.registry.GetModelProviders(parsed.CleanID)

	// 4. Apply priority rules if configured
	if r.cfg != nil {
		for _, rule := range r.cfg.Rules {
			match := false
			if strings.Contains(rule.Model, "*") {
				pattern := strings.TrimSuffix(rule.Model, "*")
				if strings.HasPrefix(parsed.CleanID, pattern) {
					match = true
				}
			} else if rule.Model == parsed.CleanID {
				match = true
			}

			if match && len(rule.Priority) > 0 {
				// Reorder providers based on priority
				providers = mungeProviders(providers, rule.Priority)
			}
		}
	}

	return &RouteResult{
		Providers: providers,
		ModelID:   parsed.CleanID,
	}, nil
}

// mungeProviders reorders the slice based on preference.
func mungeProviders(available []string, priority []string) []string {
	if len(priority) == 0 {
		return available
	}

	result := make([]string, 0, len(available))
	seen := make(map[string]struct{})

	// Add prioritized ones first if available
	for _, p := range priority {
		for _, a := range available {
			if p == a {
				result = append(result, a)
				seen[a] = struct{}{}
				break
			}
		}
	}

	// Add remaining
	for _, a := range available {
		if _, ok := seen[a]; !ok {
			result = append(result, a)
		}
	}

	return result
}
