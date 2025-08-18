// Package openai provides request translation functionality for OpenAI API.
// It handles the conversion of OpenAI-compatible request formats to the internal
// format expected by the backend client, including parsing messages, roles,
// content types (text, image, file), and tool calls.
package openai

import (
	"encoding/json"
	"strings"

	"github.com/luispater/CLIProxyAPI/internal/client"
	"github.com/luispater/CLIProxyAPI/internal/misc"
	log "github.com/sirupsen/logrus"
	"github.com/tidwall/gjson"
)

// ConvertOpenAIChatRequestToCli translates a raw JSON request from an OpenAI-compatible format
// to the internal format expected by the backend client. It parses messages,
// roles, content types (text, image, file), and tool calls.
//
// This function handles the complex task of converting between the OpenAI message
// format and the internal format used by the Gemini client. It processes different
// message types (system, user, assistant, tool) and content types (text, images, files).
//
// Parameters:
//   - rawJSON: The raw JSON bytes of the OpenAI-compatible request
//
// Returns:
//   - string: The model name to use
//   - *client.Content: System instruction content (if any)
//   - []client.Content: The conversation contents in internal format
//   - []client.ToolDeclaration: Tool declarations from the request
func ConvertOpenAIChatRequestToCli(rawJSON []byte) (string, *client.Content, []client.Content, []client.ToolDeclaration) {
	// Extract the model name from the request, defaulting to "gemini-2.5-pro".
	modelName := "gemini-2.5-pro"
	modelResult := gjson.GetBytes(rawJSON, "model")
	if modelResult.Type == gjson.String {
		modelName = modelResult.String()
	}

	// Initialize data structures for processing conversation messages
	// contents: stores the processed conversation history
	// systemInstruction: stores system-level instructions separate from conversation
	contents := make([]client.Content, 0)
	var systemInstruction *client.Content
	messagesResult := gjson.GetBytes(rawJSON, "messages")

	// Pre-process tool responses to create a lookup map
	// This first pass collects all tool responses so they can be matched with their corresponding calls
	toolItems := make(map[string]*client.FunctionResponse)
	if messagesResult.IsArray() {
		messagesResults := messagesResult.Array()
		for i := 0; i < len(messagesResults); i++ {
			messageResult := messagesResults[i]
			roleResult := messageResult.Get("role")
			if roleResult.Type != gjson.String {
				continue
			}
			contentResult := messageResult.Get("content")

			// Extract tool responses for later matching with function calls
			if roleResult.String() == "tool" {
				toolCallID := messageResult.Get("tool_call_id").String()
				if toolCallID != "" {
					var responseData string
					// Handle both string and object-based tool response formats
					if contentResult.Type == gjson.String {
						responseData = contentResult.String()
					} else if contentResult.IsObject() && contentResult.Get("type").String() == "text" {
						responseData = contentResult.Get("text").String()
					}

					// Clean up tool call ID by removing timestamp suffix
					// This normalizes IDs for consistent matching between calls and responses
					toolCallIDs := strings.Split(toolCallID, "-")
					strings.Join(toolCallIDs, "-")
					newToolCallID := strings.Join(toolCallIDs[:len(toolCallIDs)-1], "-")

					// Create function response object with normalized ID and response data
					functionResponse := client.FunctionResponse{Name: newToolCallID, Response: map[string]interface{}{"result": responseData}}
					toolItems[toolCallID] = &functionResponse
				}
			}
		}
	}

	if messagesResult.IsArray() {
		messagesResults := messagesResult.Array()
		for i := 0; i < len(messagesResults); i++ {
			messageResult := messagesResults[i]
			roleResult := messageResult.Get("role")
			contentResult := messageResult.Get("content")
			if roleResult.Type != gjson.String {
				continue
			}

			role := roleResult.String()

			if role == "system" && len(messagesResults) > 1 {
				// System messages are converted to a user message followed by a model's acknowledgment.
				if contentResult.Type == gjson.String {
					systemInstruction = &client.Content{Role: "user", Parts: []client.Part{{Text: contentResult.String()}}}
				} else if contentResult.IsObject() {
					// Handle object-based system messages.
					if contentResult.Get("type").String() == "text" {
						systemInstruction = &client.Content{Role: "user", Parts: []client.Part{{Text: contentResult.Get("text").String()}}}
					}
				}
			} else if role == "user" || (role == "system" && len(messagesResults) == 1) { // If there's only a system message, treat it as a user message.
				// User messages can contain simple text or a multi-part body.
				if contentResult.Type == gjson.String {
					contents = append(contents, client.Content{Role: "user", Parts: []client.Part{{Text: contentResult.String()}}})
				} else if contentResult.IsArray() {
					// Handle multi-part user messages (text, images, files).
					contentItemResults := contentResult.Array()
					parts := make([]client.Part, 0)
					for j := 0; j < len(contentItemResults); j++ {
						contentItemResult := contentItemResults[j]
						contentTypeResult := contentItemResult.Get("type")
						switch contentTypeResult.String() {
						case "text":
							parts = append(parts, client.Part{Text: contentItemResult.Get("text").String()})
						case "image_url":
							// Parse data URI for images.
							imageURL := contentItemResult.Get("image_url.url").String()
							if len(imageURL) > 5 {
								imageURLs := strings.SplitN(imageURL[5:], ";", 2)
								if len(imageURLs) == 2 && len(imageURLs[1]) > 7 {
									parts = append(parts, client.Part{InlineData: &client.InlineData{
										MimeType: imageURLs[0],
										Data:     imageURLs[1][7:],
									}})
								}
							}
						case "file":
							// Handle file attachments by determining MIME type from extension.
							filename := contentItemResult.Get("file.filename").String()
							fileData := contentItemResult.Get("file.file_data").String()
							ext := ""
							if split := strings.Split(filename, "."); len(split) > 1 {
								ext = split[len(split)-1]
							}
							if mimeType, ok := misc.MimeTypes[ext]; ok {
								parts = append(parts, client.Part{InlineData: &client.InlineData{
									MimeType: mimeType,
									Data:     fileData,
								}})
							} else {
								log.Warnf("Unknown file name extension '%s' at index %d, skipping file", ext, j)
							}
						}
					}
					contents = append(contents, client.Content{Role: "user", Parts: parts})
				}
			} else if role == "assistant" {
				// Assistant messages can contain text responses or tool calls
				// In the internal format, assistant messages are converted to "model" role

				if contentResult.Type == gjson.String {
					// Simple text response from the assistant
					contents = append(contents, client.Content{Role: "model", Parts: []client.Part{{Text: contentResult.String()}}})
				} else if !contentResult.Exists() || contentResult.Type == gjson.Null {
					// Handle complex tool calls made by the assistant
					// This processes function calls and matches them with their responses
					functionIDs := make([]string, 0)
					toolCallsResult := messageResult.Get("tool_calls")
					if toolCallsResult.IsArray() {
						parts := make([]client.Part, 0)
						tcsResult := toolCallsResult.Array()

						// Process each tool call in the assistant's message
						for j := 0; j < len(tcsResult); j++ {
							tcResult := tcsResult[j]

							// Extract function call details
							functionID := tcResult.Get("id").String()
							functionIDs = append(functionIDs, functionID)

							functionName := tcResult.Get("function.name").String()
							functionArgs := tcResult.Get("function.arguments").String()

							// Parse function arguments from JSON string to map
							var args map[string]any
							if err := json.Unmarshal([]byte(functionArgs), &args); err == nil {
								parts = append(parts, client.Part{
									FunctionCall: &client.FunctionCall{
										Name: functionName,
										Args: args,
									},
								})
							}
						}

						// Add the model's function calls to the conversation
						if len(parts) > 0 {
							contents = append(contents, client.Content{
								Role: "model", Parts: parts,
							})

							// Create a separate tool response message with the collected responses
							// This matches function calls with their corresponding responses
							toolParts := make([]client.Part, 0)
							for _, functionID := range functionIDs {
								if functionResponse, ok := toolItems[functionID]; ok {
									toolParts = append(toolParts, client.Part{FunctionResponse: functionResponse})
								}
							}
							// Add the tool responses as a separate message in the conversation
							contents = append(contents, client.Content{Role: "tool", Parts: toolParts})
						}
					}
				}
			}
		}
	}

	// Translate the tool declarations from the request.
	var tools []client.ToolDeclaration
	toolsResult := gjson.GetBytes(rawJSON, "tools")
	if toolsResult.IsArray() {
		tools = make([]client.ToolDeclaration, 1)
		tools[0].FunctionDeclarations = make([]any, 0)
		toolsResults := toolsResult.Array()
		for i := 0; i < len(toolsResults); i++ {
			toolResult := toolsResults[i]
			if toolResult.Get("type").String() == "function" {
				functionTypeResult := toolResult.Get("function")
				if functionTypeResult.Exists() && functionTypeResult.IsObject() {
					var functionDeclaration any
					if err := json.Unmarshal([]byte(functionTypeResult.Raw), &functionDeclaration); err == nil {
						tools[0].FunctionDeclarations = append(tools[0].FunctionDeclarations, functionDeclaration)
					}
				}
			}
		}
	} else {
		tools = make([]client.ToolDeclaration, 0)
	}

	return modelName, systemInstruction, contents, tools
}
