import type { ApiKeyEntry, AmpcodeConfig, AmpcodeModelMapping } from '@/types';
import type { ModelEntry, AmpcodeFormState } from '@/components/auth-config/types';

export const DISABLE_ALL_MODELS_RULE = '*';

export const hasDisableAllModelsRule = (models?: string[]) =>
  Array.isArray(models) &&
  models.some((model) => String(model ?? '').trim() === DISABLE_ALL_MODELS_RULE);

export const stripDisableAllModelsRule = (models?: string[]) =>
  Array.isArray(models)
    ? models.filter((model) => String(model ?? '').trim() !== DISABLE_ALL_MODELS_RULE)
    : [];

export const withDisableAllModelsRule = (models?: string[]) => {
  const base = stripDisableAllModelsRule(models);
  return [...base, DISABLE_ALL_MODELS_RULE];
};

export const withoutDisableAllModelsRule = (models?: string[]) => {
  const base = stripDisableAllModelsRule(models);
  return base;
};

export const parseExcludedModels = (text: string): string[] =>
  text
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

export const excludedModelsToText = (models?: string[]) =>
  Array.isArray(models) ? models.join('\n') : '';

export const buildOpenAIModelsEndpoint = (baseUrl: string): string => {
  const trimmed = String(baseUrl || '')
    .trim()
    .replace(/\/+$/g, '');
  if (!trimmed) return '';
  return trimmed.endsWith('/v1') ? `${trimmed}/models` : `${trimmed}/v1/models`;
};

export const buildOpenAIChatCompletionsEndpoint = (baseUrl: string): string => {
  const trimmed = String(baseUrl || '')
    .trim()
    .replace(/\/+$/g, '');
  if (!trimmed) return '';
  return trimmed.endsWith('/v1') ? `${trimmed}/chat/completions` : `${trimmed}/v1/chat/completions`;
};

export const buildApiKeyEntry = (input?: Partial<ApiKeyEntry>): ApiKeyEntry => ({
  apiKey: input?.apiKey ?? '',
  proxyUrl: input?.proxyUrl ?? '',
  headers: input?.headers ?? {},
});

export const ampcodeMappingsToEntries = (mappings?: AmpcodeModelMapping[]): ModelEntry[] => {
  if (!Array.isArray(mappings) || mappings.length === 0) {
    return [{ name: '', alias: '' }];
  }
  return mappings.map((mapping) => ({
    name: mapping.from ?? '',
    alias: mapping.to ?? '',
  }));
};

export const entriesToAmpcodeMappings = (entries: ModelEntry[]): AmpcodeModelMapping[] => {
  const seen = new Set<string>();
  const mappings: AmpcodeModelMapping[] = [];

  entries.forEach((entry) => {
    const from = entry.name.trim();
    const to = entry.alias.trim();
    if (!from || !to) return;
    const key = from.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    mappings.push({ from, to });
  });

  return mappings;
};

export const buildAmpcodeFormState = (ampcode?: AmpcodeConfig | null): AmpcodeFormState => ({
  upstreamUrl: ampcode?.upstreamUrl ?? '',
  upstreamApiKey: '',
  restrictManagementToLocalhost: ampcode?.restrictManagementToLocalhost ?? true,
  forceModelMappings: ampcode?.forceModelMappings ?? false,
  mappingEntries: ampcodeMappingsToEntries(ampcode?.modelMappings),
});
