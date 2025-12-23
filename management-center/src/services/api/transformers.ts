import type {
  ApiKeyEntry,
  GeminiKeyConfig,
  ModelAlias,
  OpenAIProviderConfig,
  ProviderKeyConfig,
  AmpcodeConfig,
  AmpcodeModelMapping
} from '@/types';
import type { Config } from '@/types/config';
import { buildHeaderObject } from '@/utils/headers';

const normalizeBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(trimmed)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(trimmed)) return false;
  }
  return Boolean(value);
};

const normalizeModelAliases = (models: unknown): ModelAlias[] => {
  if (!Array.isArray(models)) return [];
  return models
    .map((item: unknown) => {
      if (!item || typeof item !== 'object') return null;
      const obj = item as Record<string, unknown>;
      const name = obj.name || obj.id || obj.model;
      if (!name) return null;
      const alias = obj.alias || obj.display_name || obj.displayName;
      const priority = obj.priority ?? obj['priority'];
      const testModel = obj['test-model'] ?? obj.testModel;
      const entry: ModelAlias = { name: String(name) };
      if (alias && alias !== name) {
        entry.alias = String(alias);
      }
      if (priority !== undefined) {
        entry.priority = Number(priority);
      }
      if (testModel) {
        entry.testModel = String(testModel);
      }
      return entry;
    })
    .filter(Boolean) as ModelAlias[];
};

const normalizeHeaders = (headers: unknown) => {
  if (!headers || typeof headers !== 'object') return undefined;
  const normalized = buildHeaderObject(headers as Record<string, string>);
  return Object.keys(normalized).length ? normalized : undefined;
};

const normalizeExcludedModels = (input: unknown): string[] => {
  const rawList = Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[\n,]/) : [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  rawList.forEach((item) => {
    const trimmed = String(item ?? '').trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(trimmed);
  });

  return normalized;
};

const normalizeApiKeyEntry = (entry: unknown): ApiKeyEntry | null => {
  if (!entry) return null;
  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    return trimmed ? { apiKey: trimmed } : null;
  }
  if (typeof entry !== 'object') return null;

  const obj = entry as Record<string, unknown>;
  const apiKey = obj['api-key'] ?? obj.apiKey ?? obj.key;
  const trimmed = String(apiKey || '').trim();
  if (!trimmed) return null;

  const proxyUrl = obj['proxy-url'] ?? obj.proxyUrl;
  const headers = normalizeHeaders(obj.headers);

  return {
    apiKey: trimmed,
    proxyUrl: proxyUrl ? String(proxyUrl) : undefined,
    headers
  };
};

const normalizeProviderKeyConfig = (item: unknown): ProviderKeyConfig | null => {
  if (!item) return null;
  if (typeof item === 'string') {
    const trimmed = item.trim();
    return trimmed ? { apiKey: trimmed } : null;
  }
  if (typeof item !== 'object') return null;

  const obj = item as Record<string, unknown>;
  const apiKey = obj['api-key'] ?? obj.apiKey;
  const trimmed = String(apiKey || '').trim();
  if (!trimmed) return null;

  const config: ProviderKeyConfig = { apiKey: trimmed };
  const baseUrl = obj['base-url'] ?? obj.baseUrl;
  const proxyUrl = obj['proxy-url'] ?? obj.proxyUrl;
  if (baseUrl) config.baseUrl = String(baseUrl);
  if (proxyUrl) config.proxyUrl = String(proxyUrl);
  const headers = normalizeHeaders(obj.headers);
  if (headers) config.headers = headers;
  const models = normalizeModelAliases(obj.models);
  if (models.length) config.models = models;
  const excludedModels = normalizeExcludedModels(
    obj['excluded-models'] ?? obj.excludedModels ?? obj['excluded_models'] ?? obj.excluded_models
  );
  if (excludedModels.length) config.excludedModels = excludedModels;
  return config;
};

const normalizeGeminiKeyConfig = (item: unknown): GeminiKeyConfig | null => {
  if (!item) return null;
  if (typeof item === 'string') {
    const trimmed = item.trim();
    return trimmed ? { apiKey: trimmed } : null;
  }
  if (typeof item !== 'object') return null;

  const obj = item as Record<string, unknown>;
  const apiKey = obj['api-key'] ?? obj.apiKey;
  const trimmed = String(apiKey || '').trim();
  if (!trimmed) return null;

  const config: GeminiKeyConfig = { apiKey: trimmed };
  const baseUrl = obj['base-url'] ?? obj.baseUrl ?? obj['base_url'];
  if (baseUrl) config.baseUrl = String(baseUrl);
  const headers = normalizeHeaders(obj.headers);
  if (headers) config.headers = headers;
  const excludedModels = normalizeExcludedModels(obj['excluded-models'] ?? obj.excludedModels);
  if (excludedModels.length) config.excludedModels = excludedModels;
  return config;
};

const normalizeOpenAIProvider = (provider: unknown): OpenAIProviderConfig | null => {
  if (!provider || typeof provider !== 'object') return null;
  const obj = provider as Record<string, unknown>;
  const name = obj.name || obj.id;
  const baseUrl = obj['base-url'] ?? obj.baseUrl;
  if (!name || !baseUrl) return null;

  let apiKeyEntries: ApiKeyEntry[] = [];
  const rawEntries = obj['api-key-entries'];
  const rawKeys = obj['api-keys'];

  if (Array.isArray(rawEntries)) {
    apiKeyEntries = rawEntries
      .map((entry: unknown) => normalizeApiKeyEntry(entry))
      .filter(Boolean) as ApiKeyEntry[];
  } else if (Array.isArray(rawKeys)) {
    apiKeyEntries = rawKeys
      .map((key: unknown) => normalizeApiKeyEntry({ 'api-key': key }))
      .filter(Boolean) as ApiKeyEntry[];
  }

  const headers = normalizeHeaders(obj.headers);
  const models = normalizeModelAliases(obj.models);
  const priority = obj.priority ?? obj['priority'];
  const testModel = obj['test-model'] ?? obj.testModel;

  const result: OpenAIProviderConfig = {
    name: String(name),
    baseUrl: String(baseUrl),
    apiKeyEntries
  };

  if (headers) result.headers = headers;
  if (models.length) result.models = models;
  if (priority !== undefined) result.priority = Number(priority);
  if (testModel) result.testModel = String(testModel);
  return result;
};

const normalizeOauthExcluded = (payload: unknown): Record<string, string[]> | undefined => {
  if (!payload || typeof payload !== 'object') return undefined;
  const obj = payload as Record<string, unknown>;
  const source = obj['oauth-excluded-models'] ?? obj.items ?? obj;
  if (!source || typeof source !== 'object') return undefined;
  const map: Record<string, string[]> = {};
  Object.entries(source as Record<string, unknown>).forEach(([provider, models]) => {
    const key = String(provider || '').trim();
    if (!key) return;
    const normalized = normalizeExcludedModels(models);
    map[key.toLowerCase()] = normalized;
  });
  return map;
};

const normalizeAmpcodeModelMappings = (input: unknown): AmpcodeModelMapping[] => {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const mappings: AmpcodeModelMapping[] = [];

  input.forEach((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return;
    const obj = entry as Record<string, unknown>;
    const from = String(obj.from ?? obj['from'] ?? '').trim();
    const to = String(obj.to ?? obj['to'] ?? '').trim();
    if (!from || !to) return;
    const key = from.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    mappings.push({ from, to });
  });

  return mappings;
};

const normalizeAmpcodeConfig = (payload: unknown): AmpcodeConfig | undefined => {
  if (!payload || typeof payload !== 'object') return undefined;
  const obj = payload as Record<string, unknown>;
  const source = (obj?.ampcode ?? obj) as Record<string, unknown>;
  if (!source || typeof source !== 'object') return undefined;

  const config: AmpcodeConfig = {};
  const upstreamUrl = source['upstream-url'] ?? source.upstreamUrl ?? source['upstream_url'];
  if (upstreamUrl) config.upstreamUrl = String(upstreamUrl);
  const upstreamApiKey = source['upstream-api-key'] ?? source.upstreamApiKey ?? source['upstream_api_key'];
  if (upstreamApiKey) config.upstreamApiKey = String(upstreamApiKey);

  const restrictManagementToLocalhost = normalizeBoolean(
    source['restrict-management-to-localhost'] ??
      source.restrictManagementToLocalhost ??
      source['restrict_management_to_localhost']
  );
  if (restrictManagementToLocalhost !== undefined) {
    config.restrictManagementToLocalhost = restrictManagementToLocalhost;
  }

  const forceModelMappings = normalizeBoolean(
    source['force-model-mappings'] ?? source.forceModelMappings ?? source['force_model_mappings']
  );
  if (forceModelMappings !== undefined) {
    config.forceModelMappings = forceModelMappings;
  }

  const modelMappings = normalizeAmpcodeModelMappings(
    source['model-mappings'] ?? source.modelMappings ?? source['model_mappings']
  );
  if (modelMappings.length) {
    config.modelMappings = modelMappings;
  }

  return config;
};

/**
 * 规范化 /config 返回值
 */
export const normalizeConfigResponse = (raw: unknown): Config => {
  if (!raw || typeof raw !== 'object') {
    return { raw: (raw || {}) as Record<string, unknown> };
  }
  const obj = raw as Record<string, unknown>;
  const config: Config = { raw: obj };

  config.debug = obj.debug as boolean | undefined;
  config.proxyUrl = (obj['proxy-url'] ?? obj.proxyUrl) as string | undefined;
  config.requestRetry = (obj['request-retry'] ?? obj.requestRetry) as number | undefined;

  const quota = obj['quota-exceeded'] ?? obj.quotaExceeded;
  if (quota && typeof quota === 'object') {
    const qObj = quota as Record<string, unknown>;
    config.quotaExceeded = {
      switchProject: (qObj['switch-project'] ?? qObj.switchProject) as boolean | undefined,
      switchPreviewModel: (qObj['switch-preview-model'] ?? qObj.switchPreviewModel) as boolean | undefined
    };
  }

  config.usageStatisticsEnabled = (obj['usage-statistics-enabled'] ??
    obj.usageStatisticsEnabled) as boolean | undefined;
  config.requestLog = (obj['request-log'] ?? obj.requestLog) as boolean | undefined;
  config.loggingToFile = (obj['logging-to-file'] ?? obj.loggingToFile) as boolean | undefined;
  config.wsAuth = (obj['ws-auth'] ?? obj.wsAuth) as boolean | undefined;
  config.apiKeys = Array.isArray(obj['api-keys'])
    ? (obj['api-keys'].slice() as string[])
    : (obj.apiKeys as string[] | undefined);

  const geminiList = obj['gemini-api-key'] ?? obj.geminiApiKey ?? obj.geminiApiKeys;
  if (Array.isArray(geminiList)) {
    config.geminiApiKeys = geminiList
      .map((item: unknown) => normalizeGeminiKeyConfig(item))
      .filter(Boolean) as GeminiKeyConfig[];
  }

  const codexList = obj['codex-api-key'] ?? obj.codexApiKey ?? obj.codexApiKeys;
  if (Array.isArray(codexList)) {
    config.codexApiKeys = codexList
      .map((item: unknown) => normalizeProviderKeyConfig(item))
      .filter(Boolean) as ProviderKeyConfig[];
  }

  const claudeList = obj['claude-api-key'] ?? obj.claudeApiKey ?? obj.claudeApiKeys;
  if (Array.isArray(claudeList)) {
    config.claudeApiKeys = claudeList
      .map((item: unknown) => normalizeProviderKeyConfig(item))
      .filter(Boolean) as ProviderKeyConfig[];
  }

  const openaiList = obj['openai-compatibility'] ?? obj.openaiCompatibility ?? obj.openAICompatibility;
  if (Array.isArray(openaiList)) {
    config.openaiCompatibility = openaiList
      .map((item: unknown) => normalizeOpenAIProvider(item))
      .filter(Boolean) as OpenAIProviderConfig[];
  }

  const ampcode = normalizeAmpcodeConfig(obj.ampcode);
  if (ampcode) {
    config.ampcode = ampcode;
  }

  const oauthExcluded = normalizeOauthExcluded(obj['oauth-excluded-models'] ?? obj.oauthExcludedModels);
  if (oauthExcluded) {
    config.oauthExcludedModels = oauthExcluded;
  }

  return config;
};

export {
  normalizeApiKeyEntry,
  normalizeGeminiKeyConfig,
  normalizeModelAliases,
  normalizeOpenAIProvider,
  normalizeProviderKeyConfig,
  normalizeHeaders,
  normalizeExcludedModels,
  normalizeAmpcodeConfig,
  normalizeAmpcodeModelMappings
};
