/**
 * 模型池管理 API 服务
 * 注意：当前为前端先行设计，后端 API 尚未实现
 * 暂时使用模拟数据和本地存储
 */

import { providersApi } from './providers';
import { authFilesApi } from './authFiles';
import type {
  Channel,
  Pool,
  ChannelType,
  ChannelProvider,
  HealthStatus,
  RotationStrategy,
  PoolOverviewStats,
} from '@/types/modelPool';
import type { GeminiKeyConfig, ProviderKeyConfig, OpenAIProviderConfig } from '@/types';
import type { AuthFileItem } from '@/types';

// 本地存储键
const POOLS_STORAGE_KEY = 'cliproxy_model_pools';
const CHANNEL_CONFIG_STORAGE_KEY = 'cliproxy_channel_config';

// 默认并发配置
const DEFAULT_CONCURRENCY = 5;
const DEFAULT_PRIORITY = 50;
const DEFAULT_WEIGHT = 50;

/**
 * 从本地存储加载池配置
 */
function loadPoolsFromStorage(): Pool[] {
  try {
    const data = localStorage.getItem(POOLS_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * 保存池配置到本地存储
 */
function savePoolsToStorage(pools: Pool[]): void {
  localStorage.setItem(POOLS_STORAGE_KEY, JSON.stringify(pools));
}

/**
 * 加载渠道配置覆盖（优先级、权重、并发等）
 */
function loadChannelConfigOverrides(): Record<string, Partial<Channel>> {
  try {
    const data = localStorage.getItem(CHANNEL_CONFIG_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

/**
 * 保存渠道配置覆盖
 */
function saveChannelConfigOverrides(config: Record<string, Partial<Channel>>): void {
  localStorage.setItem(CHANNEL_CONFIG_STORAGE_KEY, JSON.stringify(config));
}

/**
 * 生成渠道 ID
 */
function generateChannelId(type: ChannelType, provider: ChannelProvider, source: string): string {
  return `${type}-${provider}-${source.substring(0, 8)}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
}

/**
 * 遮蔽 API Key 显示
 */
function maskSource(source: string): string {
  if (source.length <= 12) return source;
  return `${source.substring(0, 6)}...${source.substring(source.length - 4)}`;
}

/**
 * 获取提供商的默认模型列表
 */
function getDefaultModelsByProvider(provider: ChannelProvider): string[] {
  switch (provider) {
    case 'gemini':
      return ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'];
    case 'claude':
      return ['claude-3-5-sonnet-latest', 'claude-3-opus-latest', 'claude-3-haiku-20240307'];
    case 'antigravity':
      return [
        'gemini-2.5-pro',
        'gemini-2.5-flash',
        'gemini-3-pro-preview',
        'gemini-3-flash-preview',
        'gemini-claude-sonnet-4-5-thinking'
      ];
    case 'qwen':
      return ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen3-coder-plus', 'qwen3-coder-flash'];
    case 'iflow':
      return ['iflow-v1', 'deepseek-v3', 'deepseek-r1', 'kimi-k2', 'glm-4.6', 'qwen3-max']; // iflow-v1 kept as fallback/legacy
    case 'openai':
      return ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'];
    default:
      return ['gpt-3.5-turbo'];
  }
}

/**
 * 从 API Key 配置构建渠道
 */
function buildChannelFromApiKey(
  provider: ChannelProvider,
  config: GeminiKeyConfig | ProviderKeyConfig,
  overrides: Record<string, Partial<Channel>>
): Channel {
  const id = generateChannelId('api', provider, config.apiKey);
  const override = overrides[id] || {};

  return {
    id,
    name: `${provider.toUpperCase()} API`,
    type: 'api',
    provider,
    source: config.apiKey,
    sourceDisplay: maskSource(config.apiKey),
    priority: override.priority ?? DEFAULT_PRIORITY,
    weight: override.weight ?? DEFAULT_WEIGHT,
    maxConcurrency: override.maxConcurrency ?? DEFAULT_CONCURRENCY,
    enabled: override.enabled ?? true,
    healthStatus: override.healthStatus ?? 'unknown',
    lastHealthCheck: override.lastHealthCheck,
    stats: override.stats ?? { success: 0, failure: 0 },
    excludedModels: (config as ProviderKeyConfig).excludedModels,
    models: (config as ProviderKeyConfig).models?.map(m => m.name) || getDefaultModelsByProvider(provider),
  };
}

/**
 * 从 OpenAI 兼容提供商构建渠道
 */
function buildChannelFromOpenAI(
  config: OpenAIProviderConfig,
  overrides: Record<string, Partial<Channel>>
): Channel {
  const id = generateChannelId('api', 'openai', config.name);
  const override = overrides[id] || {};

  return {
    id,
    name: config.name,
    type: 'api',
    provider: 'openai',
    source: config.name,
    sourceDisplay: config.name,
    priority: override.priority ?? DEFAULT_PRIORITY,
    weight: override.weight ?? DEFAULT_WEIGHT,
    maxConcurrency: override.maxConcurrency ?? DEFAULT_CONCURRENCY,
    enabled: override.enabled ?? true,
    healthStatus: override.healthStatus ?? 'unknown',
    lastHealthCheck: override.lastHealthCheck,
    stats: override.stats ?? { success: 0, failure: 0 },
    models: config.models?.map(m => m.name) || getDefaultModelsByProvider('openai'),
    metadata: { baseUrl: config.baseUrl, keyCount: config.apiKeyEntries?.length || 0 },
  };
}

/**
 * 从 OAuth 认证文件构建渠道
 */
function buildChannelFromAuthFile(
  file: AuthFileItem,
  overrides: Record<string, Partial<Channel>>
): Channel {
  const provider = (file.type || 'unknown') as ChannelProvider;
  const id = generateChannelId('oauth', provider, file.name);
  const override = overrides[id] || {};

  return {
    id,
    name: file.name,
    type: 'oauth',
    provider,
    source: file.name,
    sourceDisplay: file.name,
    priority: override.priority ?? DEFAULT_PRIORITY,
    weight: override.weight ?? DEFAULT_WEIGHT,
    maxConcurrency: override.maxConcurrency ?? DEFAULT_CONCURRENCY,
    enabled: override.enabled ?? true,
    healthStatus: override.healthStatus ?? 'unknown',
    lastHealthCheck: override.lastHealthCheck,
    stats: override.stats ?? { success: 0, failure: 0 },
    models: getDefaultModelsByProvider(provider),
    metadata: { size: file.size, modtime: file.modtime },
  };
}

export const modelPoolApi = {
  /**
   * 获取所有渠道（聚合 API Key + OAuth 认证）
   */
  async getChannels(): Promise<Channel[]> {
    const overrides = loadChannelConfigOverrides();
    const channels: Channel[] = [];

    try {
      // 获取 Gemini API Keys
      const geminiKeys = await providersApi.getGeminiKeys();
      geminiKeys.forEach(config => {
        channels.push(buildChannelFromApiKey('gemini', config, overrides));
      });

      // 获取 Codex API Keys
      const codexConfigs = await providersApi.getCodexConfigs();
      codexConfigs.forEach(config => {
        channels.push(buildChannelFromApiKey('codex', config, overrides));
      });

      // 获取 Claude API Keys
      const claudeConfigs = await providersApi.getClaudeConfigs();
      claudeConfigs.forEach(config => {
        channels.push(buildChannelFromApiKey('claude', config, overrides));
      });

      // 获取 OpenAI 兼容提供商
      const openaiProviders = await providersApi.getOpenAIProviders();
      openaiProviders.forEach(config => {
        channels.push(buildChannelFromOpenAI(config, overrides));
      });

      // 获取 OAuth 认证文件
      const authFilesData = await authFilesApi.list();
      const authFiles = authFilesData?.files || [];
      authFiles.forEach(file => {
        channels.push(buildChannelFromAuthFile(file, overrides));
      });
    } catch (error) {
      console.error('Failed to load channels:', error);
    }

    return channels;
  },

  /**
   * 更新渠道配置（优先级、权重、并发等）
   */
  async updateChannel(channelId: string, updates: Partial<Channel>): Promise<void> {
    const overrides = loadChannelConfigOverrides();
    overrides[channelId] = { ...overrides[channelId], ...updates };
    saveChannelConfigOverrides(overrides);
  },

  /**
   * 获取所有池
   */
  async getPools(): Promise<Pool[]> {
    return loadPoolsFromStorage();
  },

  /**
   * 创建池
   */
  async createPool(pool: Omit<Pool, 'id' | 'createdAt'>): Promise<Pool> {
    const pools = loadPoolsFromStorage();
    const newPool: Pool = {
      ...pool,
      id: `pool-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    pools.push(newPool);
    savePoolsToStorage(pools);
    return newPool;
  },

  /**
   * 更新池
   */
  async updatePool(poolId: string, updates: Partial<Pool>): Promise<Pool | null> {
    const pools = loadPoolsFromStorage();
    const index = pools.findIndex(p => p.id === poolId);
    if (index === -1) return null;

    pools[index] = { ...pools[index], ...updates, updatedAt: new Date().toISOString() };
    savePoolsToStorage(pools);
    return pools[index];
  },

  /**
   * 删除池
   */
  async deletePool(poolId: string): Promise<boolean> {
    const pools = loadPoolsFromStorage();
    const filtered = pools.filter(p => p.id !== poolId);
    if (filtered.length === pools.length) return false;
    savePoolsToStorage(filtered);
    return true;
  },

  /**
   * 获取总览统计
   */
  async getOverviewStats(): Promise<PoolOverviewStats> {
    const channels = await this.getChannels();
    const pools = await this.getPools();

    const healthyCount = channels.filter(c => c.healthStatus === 'healthy').length;
    const unhealthyCount = channels.filter(c => c.healthStatus === 'unhealthy').length;

    const totalSuccess = channels.reduce((sum, c) => sum + c.stats.success, 0);
    const totalFailure = channels.reduce((sum, c) => sum + c.stats.failure, 0);
    const totalRequests = totalSuccess + totalFailure;

    return {
      totalChannels: channels.length,
      healthyChannels: healthyCount,
      unhealthyChannels: unhealthyCount,
      totalPools: pools.length,
      activePools: pools.filter(p => p.enabled).length,
      healthCheckEnabled: pools.some(p => p.healthCheckEnabled),
      successRate24h: totalRequests > 0 ? Math.round((totalSuccess / totalRequests) * 100) : 100,
    };
  },

  /**
   * 执行健康检测（单个渠道）
   * 使用真实聊天请求进行检测
   */
  async checkChannelHealth(channelId: string, model: string): Promise<{
    status: HealthStatus;
    durationMs: number;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      // 发送真实的聊天请求
      const response = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
          stream: false,
        }),
      });

      const durationMs = Date.now() - startTime;

      if (response.ok) {
        // 更新渠道健康状态及统计
        const overrides = loadChannelConfigOverrides();
        const currentStats = overrides[channelId]?.stats || { success: 0, failure: 0 };
        overrides[channelId] = {
          ...overrides[channelId],
          healthStatus: 'healthy',
          lastHealthCheck: new Date().toISOString(),
          stats: { ...currentStats, success: (currentStats.success || 0) + 1 },
        };
        saveChannelConfigOverrides(overrides);

        return { status: 'healthy', durationMs };
      } else {
        const errorText = await response.text();
        
        // 更新渠道健康状态及统计 (失败)
        const overrides = loadChannelConfigOverrides();
        const currentStats = overrides[channelId]?.stats || { success: 0, failure: 0 };
        overrides[channelId] = {
          ...overrides[channelId],
          healthStatus: 'unhealthy',
          lastHealthCheck: new Date().toISOString(),
          stats: { ...currentStats, failure: (currentStats.failure || 0) + 1 },
        };
        saveChannelConfigOverrides(overrides);

        return { status: 'unhealthy', durationMs, error: errorText };
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      return {
        status: 'unhealthy',
        durationMs,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

export type {
  Channel,
  Pool,
  ChannelType,
  ChannelProvider,
  HealthStatus,
  RotationStrategy,
  PoolOverviewStats,
};
