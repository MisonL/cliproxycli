package geminiCLI

import (
	"cliproxy/internal/constant"
	"cliproxy/internal/interfaces"
	"cliproxy/internal/translator/translator"
)

func init() {
	translator.Register(
		constant.GeminiCLI,
		constant.Codex,
		ConvertGeminiCLIRequestToCodex,
		interfaces.TranslateResponse{
			Stream:     ConvertCodexResponseToGeminiCLI,
			NonStream:  ConvertCodexResponseToGeminiCLINonStream,
			TokenCount: GeminiCLITokenCount,
		},
	)
}
