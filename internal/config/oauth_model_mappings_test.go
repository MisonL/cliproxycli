package config

import (
	"testing"

	sdkconfig "cliproxy/sdk/config"
)

func TestSanitizeOAuthModelMappings_PreservesForkFlag(t *testing.T) {
	cfg := &Config{
		SDKConfig: sdkconfig.SDKConfig{
			OAuthModelMappings: map[string]map[string]sdkconfig.ModelNameMapping{
				" CoDeX ": {
					" g5 ": {Name: " gpt-5 ", Alias: " g5 ", Fork: true},
					"g6":   {Name: "gpt-6", Alias: "g6"},
				},
			},
		},
	}

	cfg.SanitizeOAuthModelMappings()

	mappings := cfg.OAuthModelMappings["codex"]
	if len(mappings) != 2 {
		t.Fatalf("expected 2 sanitized mappings, got %d", len(mappings))
	}
	m1 := mappings["g5"]
	if m1.Name != "gpt-5" || m1.Alias != "g5" || !m1.Fork {
		t.Fatalf("expected g5 mapping to be gpt-5->g5 fork=true, got name=%q alias=%q fork=%v", m1.Name, m1.Alias, m1.Fork)
	}
	m2 := mappings["g6"]
	if m2.Name != "gpt-6" || m2.Alias != "g6" || m2.Fork {
		t.Fatalf("expected g6 mapping to be gpt-6->g6 fork=false, got name=%q alias=%q fork=%v", m2.Name, m2.Alias, m2.Fork)
	}
}
