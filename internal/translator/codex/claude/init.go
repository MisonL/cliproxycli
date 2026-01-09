package claude

import (
	"cliproxy/internal/constant"
	"cliproxy/internal/interfaces"
	"cliproxy/internal/translator/translator"
)

func init() {
	translator.Register(
		constant.Claude,
		constant.Codex,
		ConvertClaudeRequestToCodex,
		interfaces.TranslateResponse{
			Stream:    ConvertCodexResponseToClaude,
			NonStream: ConvertCodexResponseToClaudeNonStream,
		},
	)
}
