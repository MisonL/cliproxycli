package responses

import (
	"bytes"

	antigravity_gemini "github.com/router-for-me/CLIProxyAPI/v6/internal/translator/antigravity/gemini"
	openai_responses "github.com/router-for-me/CLIProxyAPI/v6/internal/translator/gemini/openai/responses"
)

func ConvertOpenAIResponsesRequestToAntigravity(modelName string, inputRawJSON []byte, stream bool) []byte {
	rawJSON := bytes.Clone(inputRawJSON)
	rawJSON = openai_responses.ConvertOpenAIResponsesRequestToGemini(modelName, rawJSON, stream)
	return antigravity_gemini.ConvertGeminiRequestToAntigravity(modelName, rawJSON, stream)
}
