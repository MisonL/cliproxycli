package gemini

import (
	"cliproxy/internal/constant"
	"cliproxy/internal/interfaces"
	"cliproxy/internal/translator/translator"
)

func init() {
	translator.Register(
		constant.Gemini,
		constant.Codex,
		ConvertGeminiRequestToCodex,
		interfaces.TranslateResponse{
			Stream:     ConvertCodexResponseToGemini,
			NonStream:  ConvertCodexResponseToGeminiNonStream,
			TokenCount: GeminiTokenCount,
		},
	)
}
