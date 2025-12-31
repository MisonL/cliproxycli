import type { HeaderEntry } from '@/utils/headers';
import type { ApiKeyEntry } from '@/types';

export type ProviderModalType =
  | { type: 'gemini'; index: number | null }
  | { type: 'codex'; index: number | null }
  | { type: 'claude'; index: number | null }
  | { type: 'ampcode'; index: null }
  | { type: 'openai'; index: number | null };

export interface ModelEntry {
  name: string;
  alias: string;
}

export interface OpenAIFormState {
  name: string;
  baseUrl: string;
  headers: HeaderEntry[];
  testModel?: string;
  modelEntries: ModelEntry[];
  apiKeyEntries: ApiKeyEntry[];
}

export interface AmpcodeFormState {
  upstreamUrl: string;
  upstreamApiKey: string;
  restrictManagementToLocalhost: boolean;
  forceModelMappings: boolean;
  mappingEntries: ModelEntry[];
}

export interface GeminiFormState {
  apiKey: string;
  baseUrl: string;
  headers: Record<string, string>;
  excludedText: string;
}
