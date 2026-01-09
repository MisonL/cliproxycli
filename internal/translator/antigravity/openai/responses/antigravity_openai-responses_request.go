package responses

import (
	"bytes"

	antigravity_gemini "cliproxy/internal/translator/antigravity/gemini"
	openai_responses "cliproxy/internal/translator/gemini/openai/responses"
)

func ConvertOpenAIResponsesRequestToAntigravity(modelName string, inputRawJSON []byte, stream bool) []byte {
	rawJSON := bytes.Clone(inputRawJSON)
	rawJSON = openai_responses.ConvertOpenAIResponsesRequestToGemini(modelName, rawJSON, stream)
	return antigravity_gemini.ConvertGeminiRequestToAntigravity(modelName, rawJSON, stream)
}
