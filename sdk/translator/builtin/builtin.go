// Package builtin exposes the built-in translator registrations for SDK users.
package builtin

import (
	sdktranslator "cliproxy/sdk/translator"

	_ "cliproxy/internal/translator"
)

// Registry exposes the default registry populated with all built-in translators.
func Registry() *sdktranslator.Registry {
	return sdktranslator.Default()
}

// Pipeline returns a pipeline that already contains the built-in translators.
func Pipeline() *sdktranslator.Pipeline {
	return sdktranslator.NewPipeline(sdktranslator.Default())
}
