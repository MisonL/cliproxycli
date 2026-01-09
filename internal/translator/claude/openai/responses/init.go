package responses

import (
	"cliproxy/internal/constant"
	"cliproxy/internal/interfaces"
	"cliproxy/internal/translator/translator"
)

func init() {
	translator.Register(
		constant.OpenaiResponse,
		constant.Claude,
		ConvertOpenAIResponsesRequestToClaude,
		interfaces.TranslateResponse{
			Stream:    ConvertClaudeResponseToOpenAIResponses,
			NonStream: ConvertClaudeResponseToOpenAIResponsesNonStream,
		},
	)
}
