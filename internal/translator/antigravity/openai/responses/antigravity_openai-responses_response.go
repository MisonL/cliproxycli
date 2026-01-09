package responses

import (
	"context"

	openai_responses "cliproxy/internal/translator/gemini/openai/responses"
	"github.com/tidwall/gjson"
)

func ConvertAntigravityResponseToOpenAIResponses(ctx context.Context, modelName string, originalRequestRawJSON, requestRawJSON, rawJSON []byte, param *any) []string {
	responseResult := gjson.GetBytes(rawJSON, "response")
	if responseResult.Exists() {
		rawJSON = []byte(responseResult.Raw)
	}
	return openai_responses.ConvertGeminiResponseToOpenAIResponses(ctx, modelName, originalRequestRawJSON, requestRawJSON, rawJSON, param)
}

func ConvertAntigravityResponseToOpenAIResponsesNonStream(ctx context.Context, modelName string, originalRequestRawJSON, requestRawJSON, rawJSON []byte, param *any) string {
	responseResult := gjson.GetBytes(rawJSON, "response")
	if responseResult.Exists() {
		rawJSON = []byte(responseResult.Raw)
	}

	requestResult := gjson.GetBytes(originalRequestRawJSON, "request")
	if responseResult.Exists() {
		originalRequestRawJSON = []byte(requestResult.Raw)
	}

	requestResult = gjson.GetBytes(requestRawJSON, "request")
	if responseResult.Exists() {
		requestRawJSON = []byte(requestResult.Raw)
	}

	return openai_responses.ConvertGeminiResponseToOpenAIResponsesNonStream(ctx, modelName, originalRequestRawJSON, requestRawJSON, rawJSON, param)
}
