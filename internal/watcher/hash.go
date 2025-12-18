package watcher

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
)

// semanticAuthHash computes a hash of the JSON data while ignoring volatile fields
// like "timestamp" and "expired". This prevents unnecessary reload loops when
// only non-essential metadata changes.
func semanticAuthHash(data []byte) (string, error) {
	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		// If it's not valid JSON, fallback to raw hash
		sum := sha256.Sum256(data)
		return hex.EncodeToString(sum[:]), nil
	}

	// Remove volatile fields from comparison
	delete(m, "timestamp")
	delete(m, "expired")

	// To ensure stable hash, we marshal it back.
	// encoding/json Marshals maps in a deterministic order (sorted by key).
	cleaned, err := json.Marshal(m)
	if err != nil {
		return "", err
	}

	sum := sha256.Sum256(cleaned)
	return hex.EncodeToString(sum[:]), nil
}

// stableJSON produces a deterministic byte slice for a map to use as a hash source.
// Not strictly needed as json.Marshal is already stable for maps, but good to be explicit.
func stableJSON(m map[string]any) ([]byte, error) {
	return json.Marshal(m)
}
