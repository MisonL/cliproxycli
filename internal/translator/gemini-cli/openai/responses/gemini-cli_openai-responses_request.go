package responses

import (
	"bytes"

	"cliproxy/internal/translator/gemini-cli/gemini"
	"cliproxy/internal/translator/gemini/openai/responses"
)

func ConvertOpenAIResponsesRequestToGeminiCLI(modelName string, inputRawJSON []byte, stream bool) []byte {
	rawJSON := bytes.Clone(inputRawJSON)
	rawJSON = responses.ConvertOpenAIResponsesRequestToGemini(modelName, rawJSON, stream)
	return gemini.ConvertGeminiRequestToGeminiCLI(modelName, rawJSON, stream)
}
