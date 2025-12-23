import { apiClient } from '../services/api';
import { tools } from './tools';

export type ToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

export type Message = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

interface ChatCompletionResponse {
  choices: Array<{
    message: Message;
    index: number;
    finish_reason: string;
  }>;
  [key: string]: unknown;
}

export interface AgentConfig {
  model: string;
  temperature?: number;
  max_tokens?: number;
  systemPrompt?: string;
  provider?: string;
}

export class AgentCore {
  private messages: Message[] = [];
  private config: AgentConfig = {
    model: 'gpt-4o',
    temperature: 0.7,
    max_tokens: 2000,
    systemPrompt: '' // Will be set by frontend based on i18n
  };

  constructor() {
    // System prompt will be injected by frontend via setConfig
    this.messages = [];
  }

  public setConfig(config: Partial<AgentConfig>) {
    this.config = { ...this.config, ...config };
    // Update system prompt if it changed and is the first message
    if (config.systemPrompt && this.messages.length > 0 && this.messages[0].role === 'system') {
      this.messages[0].content = config.systemPrompt;
    }
  }

  public getConfig(): AgentConfig {
    return this.config;
  }

  public getHistory(): Message[] {
    return this.messages;
  }

  public async sendMessage(content: string): Promise<Message> {
    this.messages.push({ role: 'user', content });

    try {
      // 1. Call LLM
      const response = await this.callLLM();
      this.messages.push(response);

      // 2. Check for tool calls
      if (response.tool_calls && response.tool_calls.length > 0) {
        // Execute tools
        for (const toolCall of response.tool_calls) {
           const result = await this.executeTool(toolCall);
           this.messages.push({
             role: 'tool',
             tool_call_id: toolCall.id,
             name: toolCall.function.name,
             content: JSON.stringify(result)
           });
        }
        // 3. Call LLM again with tool results
        const followUp = await this.callLLM();
        this.messages.push(followUp);
        return followUp;
      }

      return response;
    } catch (error) {
      console.error('Agent Error:', error);
      const errorMsg: Message = { role: 'assistant', content: 'Sorry, I encountered an error processing your request.' };
      this.messages.push(errorMsg);
      return errorMsg;
    }
  }

  private async callLLM(): Promise<Message> {
    // Convert tools to OpenAI format
    const toolsPayload = tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));

    const payload = {
      model: this.config.model, 
      messages: this.messages,
      tools: toolsPayload,
      tool_choice: 'auto',
      temperature: this.config.temperature,
      max_tokens: this.config.max_tokens,
      // Pass provider specific config if needed, usually via model ID specific format or header
      // For now we rely on the router or the model ID itself if it contains namespace
    };

    // Use the proxy's own chat completion endpoint
    const res = (await apiClient.post('/v1/chat/completions', payload)) as ChatCompletionResponse;
    
    // Extract message
    if (res.choices && res.choices.length > 0) {
      return res.choices[0].message;
    }
    throw new Error('Invalid response from LLM');
  }

  private async executeTool(toolCall: ToolCall): Promise<unknown> {
    const fnName = toolCall.function.name;
    const fnArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
    
    const tool = tools.find(t => t.name === fnName);
    if (!tool) return { error: 'Tool not found' };

    try {
      return await tool.execute(fnArgs);
    } catch (err: unknown) {
      return { error: (err as Error).message };
    }
  }
  
  public clearHistory() {
      this.messages = [{ role: 'system', content: this.config.systemPrompt || '' }];
  }
}

export const agent = new AgentCore();
