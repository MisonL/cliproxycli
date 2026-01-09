package chat_completions

import (
	"cliproxy/internal/constant"
	"cliproxy/internal/interfaces"
	"cliproxy/internal/translator/translator"
)

func init() {
	translator.Register(
		constant.OpenAI,
		constant.Gemini,
		ConvertOpenAIRequestToGemini,
		interfaces.TranslateResponse{
			Stream:    ConvertGeminiResponseToOpenAI,
			NonStream: ConvertGeminiResponseToOpenAINonStream,
		},
	)
}
