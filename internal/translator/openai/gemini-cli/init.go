package geminiCLI

import (
	"cliproxy/internal/constant"
	"cliproxy/internal/interfaces"
	"cliproxy/internal/translator/translator"
)

func init() {
	translator.Register(
		constant.GeminiCLI,
		constant.OpenAI,
		ConvertGeminiCLIRequestToOpenAI,
		interfaces.TranslateResponse{
			Stream:     ConvertOpenAIResponseToGeminiCLI,
			NonStream:  ConvertOpenAIResponseToGeminiCLINonStream,
			TokenCount: GeminiCLITokenCount,
		},
	)
}
