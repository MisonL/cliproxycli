// Package openai provides response translation functionality for Gemini CLI to OpenAI API compatibility.
// This package handles the conversion of Gemini CLI API responses into OpenAI Chat Completions-compatible
// JSON format, transforming streaming events and non-streaming responses into the format
// expected by OpenAI API clients. It supports both streaming and non-streaming modes,
// handling text content, tool calls, reasoning content, and usage metadata appropriately.
package chat_completions

import (
	"context"

	chat_completions "cliproxy/internal/translator/gemini/openai/chat-completions"
	"github.com/tidwall/gjson"
)

func ConvertAntigravityResponseToOpenAI(ctx context.Context, modelName string, originalRequestRawJSON, requestRawJSON, rawJSON []byte, param *any) []string {
	return chat_completions.ConvertGeminiResponseToOpenAI(ctx, modelName, originalRequestRawJSON, requestRawJSON, rawJSON, param)
}

// ConvertAntigravityResponseToOpenAINonStream converts a non-streaming Gemini CLI response to a non-streaming OpenAI response.
// This function processes the complete Gemini CLI response and transforms it into a single OpenAI-compatible
// JSON response. It handles message content, tool calls, reasoning content, and usage metadata, combining all
// the information into a single response that matches the OpenAI API format.
//
// Parameters:
//   - ctx: The context for the request, used for cancellation and timeout handling
//   - modelName: The name of the model being used for the response
//   - rawJSON: The raw JSON response from the Gemini CLI API
//   - param: A pointer to a parameter object for the conversion
//
// Returns:
//   - string: An OpenAI-compatible JSON response containing all message content and metadata
func ConvertAntigravityResponseToOpenAINonStream(ctx context.Context, modelName string, originalRequestRawJSON, requestRawJSON, rawJSON []byte, param *any) string {
	responseResult := gjson.GetBytes(rawJSON, "response")
	if responseResult.Exists() {
		return chat_completions.ConvertGeminiResponseToOpenAINonStream(ctx, modelName, originalRequestRawJSON, requestRawJSON, []byte(responseResult.Raw), param)
	}
	return ""
}
