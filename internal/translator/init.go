package translator

import (
	_ "cliproxy/internal/translator/claude/gemini"
	_ "cliproxy/internal/translator/claude/gemini-cli"
	_ "cliproxy/internal/translator/claude/openai/chat-completions"
	_ "cliproxy/internal/translator/claude/openai/responses"

	_ "cliproxy/internal/translator/codex/claude"
	_ "cliproxy/internal/translator/codex/gemini"
	_ "cliproxy/internal/translator/codex/gemini-cli"
	_ "cliproxy/internal/translator/codex/openai/chat-completions"
	_ "cliproxy/internal/translator/codex/openai/responses"

	_ "cliproxy/internal/translator/gemini-cli/claude"
	_ "cliproxy/internal/translator/gemini-cli/gemini"
	_ "cliproxy/internal/translator/gemini-cli/openai/chat-completions"
	_ "cliproxy/internal/translator/gemini-cli/openai/responses"

	_ "cliproxy/internal/translator/gemini/claude"
	_ "cliproxy/internal/translator/gemini/gemini"
	_ "cliproxy/internal/translator/gemini/gemini-cli"
	_ "cliproxy/internal/translator/gemini/openai/chat-completions"
	_ "cliproxy/internal/translator/gemini/openai/responses"

	_ "cliproxy/internal/translator/openai/claude"
	_ "cliproxy/internal/translator/openai/gemini"
	_ "cliproxy/internal/translator/openai/gemini-cli"
	_ "cliproxy/internal/translator/openai/openai/chat-completions"
	_ "cliproxy/internal/translator/openai/openai/responses"

	_ "cliproxy/internal/translator/antigravity/claude"
	_ "cliproxy/internal/translator/antigravity/gemini"
	_ "cliproxy/internal/translator/antigravity/openai/chat-completions"
	_ "cliproxy/internal/translator/antigravity/openai/responses"
)
