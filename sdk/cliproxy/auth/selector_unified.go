package auth

import (
	"context"
	"math/rand"
	"sort"
	"sync"
	"time"

	cliproxyexecutor "cliproxy/sdk/cliproxy/executor"
)

func init() {
	rand.Seed(time.Now().UnixNano())
}

// UnifiedSelector implements a comprehensive selection strategy supporting
// Priority, Weighted Load Balancing, Round Robin, and Sticky sessions.
type UnifiedSelector struct {
	mu           sync.Mutex
	cursors      map[string]int // For Round Robin
	stickyRoutes map[string]string
	strategy     string // Default strategy
}

// NewUnifiedSelector creates a new selector with the given default strategy.
func NewUnifiedSelector(strategy string) *UnifiedSelector {
	if strategy == "" {
		strategy = "priority"
	}
	return &UnifiedSelector{
		cursors:      make(map[string]int),
		stickyRoutes: make(map[string]string),
		strategy:     strategy,
	}
}

// SetStrategy updates the selection strategy at runtime.
func (s *UnifiedSelector) SetStrategy(strategy string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.strategy = strategy
}

// Pick selects the best available auth based on the configured strategy.
func (s *UnifiedSelector) Pick(ctx context.Context, provider, model string, opts cliproxyexecutor.Options, auths []*Auth) (*Auth, error) {
	if len(auths) == 0 {
		return nil, &Error{Code: "auth_not_found", Message: "no auth candidates"}
	}

	// 1. Filter Blocked Candidates
	available := make([]*Auth, 0, len(auths))
	now := time.Now()
	cooldownCount := 0
	var earliest time.Time

	for _, candidate := range auths {
		blocked, reason, next := isAuthBlockedForModel(candidate, model, now)
		if !blocked {
			available = append(available, candidate)
			continue
		}
		if reason == blockReasonCooldown {
			cooldownCount++
			if !next.IsZero() && (earliest.IsZero() || next.Before(earliest)) {
				earliest = next
			}
		}
	}

	if len(available) == 0 {
		if cooldownCount == len(auths) && !earliest.IsZero() {
			resetIn := earliest.Sub(now)
			return nil, newModelCooldownError(model, provider, resetIn)
		}
		return nil, &Error{Code: "auth_unavailable", Message: "no auth available"}
	}

	// 2. Select Strategy
	// TODO: Allow overriding strategy via opts?
	s.mu.Lock()
	strategy := s.strategy
	s.mu.Unlock()

	switch strategy {
	case "load-balance", "weight":
		return s.pickWeighted(available)
	case "round-robin":
		return s.pickRoundRobin(provider, model, available)
	case "sticky":
		return s.pickSticky(ctx, provider, model, opts, available)
	case "priority":
		fallthrough
	default:
		return s.pickPriority(provider, model, available)
	}
}

// pickPriority selects the candidate with the lowest Priority value.
// If multiple candidates have the same lowest priority, it round-robins between them.
func (s *UnifiedSelector) pickPriority(provider, model string, candidates []*Auth) (*Auth, error) {
	// Sort by Priority ASC
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].Priority != candidates[j].Priority {
			return candidates[i].Priority < candidates[j].Priority
		}
		// Deterministic tie-breaker
		return candidates[i].ID < candidates[j].ID
	})

	bestPriority := candidates[0].Priority

	// Find all candidates with the best priority
	topCandidates := candidates[:0] // Reuse slice
	for _, c := range candidates {
		if c.Priority == bestPriority {
			topCandidates = append(topCandidates, c)
		} else {
			break
		}
	}

	if len(topCandidates) == 1 {
		return topCandidates[0], nil
	}

	// Round-robin among top priority candidates
	return s.pickRoundRobin(provider, model, topCandidates)
}

// pickWeighted selects a candidate based on their Weight.
func (s *UnifiedSelector) pickWeighted(candidates []*Auth) (*Auth, error) {
	totalWeight := 0
	for _, c := range candidates {
		w := c.Weight
		if w <= 0 {
			w = 1 // Min weight
		}
		totalWeight += w
	}

	r := rand.Intn(totalWeight)
	current := 0
	for _, c := range candidates {
		w := c.Weight
		if w <= 0 {
			w = 1
		}
		current += w
		if r < current {
			return c, nil
		}
	}

	// Fallback (should not happen)
	return candidates[0], nil
}

// pickRoundRobin rotates through candidates evenly.
func (s *UnifiedSelector) pickRoundRobin(provider, model string, candidates []*Auth) (*Auth, error) {
	if len(candidates) == 1 {
		return candidates[0], nil
	}

	// Sort for deterministic rotation
	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].ID < candidates[j].ID
	})

	key := provider + ":" + model
	s.mu.Lock()
	defer s.mu.Unlock()

	index := s.cursors[key]
	if index >= 2_147_483_640 {
		index = 0
	}
	s.cursors[key] = index + 1

	return candidates[index%len(candidates)], nil
}

// pickSticky binds a session to a specific auth for consistent routing.
// If a session already has a bound auth and it's still available, use it.
// Otherwise, select a new auth using priority strategy and bind it to the session.
func (s *UnifiedSelector) pickSticky(ctx context.Context, provider, model string, opts cliproxyexecutor.Options, candidates []*Auth) (*Auth, error) {
	if len(candidates) == 1 {
		return candidates[0], nil
	}

	// Extract session identifier from context, metadata, or request headers
	sessionID := s.extractSessionID(ctx, opts)

	// If no session ID, fallback to priority strategy
	if sessionID == "" {
		return s.pickPriority(provider, model, candidates)
	}

	key := provider + ":" + model + ":" + sessionID

	s.mu.Lock()
	defer s.mu.Unlock()

	// Check if session already has a binding
	boundID, exists := s.stickyRoutes[key]
	if exists {
		// Find the bound auth in available candidates
		for _, c := range candidates {
			if c.ID == boundID {
				return c, nil
			}
		}
		// Bound auth is not available anymore, fall through to rebind
	}

	// Select a new auth using priority strategy
	selected, err := s.pickPriority(provider, model, candidates)
	if err != nil {
		return nil, err
	}

	// Bind session to selected auth
	s.stickyRoutes[key] = selected.ID

	return selected, nil
}

// extractSessionID attempts to extract a session identifier from the request context.
// It checks context values, HTTP headers, and metadata fields.
func (s *UnifiedSelector) extractSessionID(ctx context.Context, opts cliproxyexecutor.Options) string {
	// Try to get from context value (if set by middleware)
	if sessionID, ok := ctx.Value("session-id").(string); ok && sessionID != "" {
		return sessionID
	}
	if userID, ok := ctx.Value("user-id").(string); ok && userID != "" {
		return userID
	}
	if clientID, ok := ctx.Value("client-id").(string); ok && clientID != "" {
		return clientID
	}

	// Try to get from metadata in opts
	if opts.Metadata != nil {
		if sessionID, ok := opts.Metadata["session-id"].(string); ok && sessionID != "" {
			return sessionID
		}
		if userID, ok := opts.Metadata["user-id"].(string); ok && userID != "" {
			return userID
		}
		if clientID, ok := opts.Metadata["client-id"].(string); ok && clientID != "" {
			return clientID
		}
	}

	// Try to get from HTTP headers (if available in context)
	if headers, ok := ctx.Value("http-headers").(map[string][]string); ok {
		// Check common session ID headers
		if sessionIDs := headers["X-Session-Id"]; len(sessionIDs) > 0 && sessionIDs[0] != "" {
			return sessionIDs[0]
		}
		if sessionIDs := headers["X-Session-ID"]; len(sessionIDs) > 0 && sessionIDs[0] != "" {
			return sessionIDs[0]
		}
		if userIDs := headers["X-User-Id"]; len(userIDs) > 0 && userIDs[0] != "" {
			return userIDs[0]
		}
		if userIDs := headers["X-User-ID"]; len(userIDs) > 0 && userIDs[0] != "" {
			return userIDs[0]
		}
		// Check Authorization header for unique identification
		if auths := headers["Authorization"]; len(auths) > 0 {
			// Use a hash of the auth token as session ID
			return auths[0]
		}
	}

	return ""
}
