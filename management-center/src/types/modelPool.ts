/**
 * 模型池管理相关类型定义
 * 四大核心概念：渠道、池、并发控制、轮转控制
 */

// 渠道类型：API接入 或 OAuth认证接入
export type ChannelType = 'api' | 'oauth';

// 渠道提供商
export type ChannelProvider =
  | 'gemini'
  | 'claude'
  | 'codex'
  | 'openai'
  | 'antigravity'
  | 'qwen'
  | 'iflow'
  | 'vertex';

// 轮转策略
export type RotationStrategy =
  | 'round_robin'  // 轮询
  | 'weighted'     // 权重
  | 'priority'     // 优先级
  | 'random';      // 随机

// 健康状态
export type HealthStatus =
  | 'healthy'      // 健康
  | 'degraded'     // 降级
  | 'unhealthy'    // 不健康
  | 'unknown';     // 未知

// 渠道统计
export interface ChannelStats {
  success: number;
  failure: number;
  avgResponseMs?: number;
  lastUsedAt?: string;
}

// 渠道定义
export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  provider: ChannelProvider;
  source: string;                  // API Key 标识或认证文件名
  sourceDisplay?: string;          // 显示用的遮蔽后标识
  priority: number;                // 优先级 (1-100, 越高越优先)
  weight: number;                  // 权重 (1-100)
  maxConcurrency: number;          // 每渠道最大并发
  currentConcurrency?: number;     // 当前并发数
  enabled: boolean;
  healthStatus: HealthStatus;
  lastHealthCheck?: string;
  lastHealthCheckDurationMs?: number;
  stats: ChannelStats;
  models?: string[];               // 支持的模型列表
  excludedModels?: string[];       // 排除的模型
  metadata?: Record<string, unknown>;
}

// 模型选择项
export interface PoolModelSelection {
  channelId: string;
  model: string;
}

// Pool definition update
export interface Pool {
  id: string;
  name: string;
  description?: string;
  channels: string[];              // 渠道 ID 列表
  models?: PoolModelSelection[];   // 精确模型选择 (Model-level)
  maxConcurrency: number;          // 池级别最大并发
  currentConcurrency?: number;     // 当前并发数
  rotationStrategy: RotationStrategy;
  enabled: boolean;
  healthCheckEnabled: boolean;
  healthCheckInterval?: string;    // 检测间隔，如 "5m"
  healthCheckTaskId?: string;      // 关联的定时任务 ID
  healthCheckModel?: string;       // 健康检测使用的模型
  createdAt: string;
  updatedAt?: string;
}

// 健康检测配置
export interface HealthCheckConfig {
  enabled: boolean;
  interval: string;                // 如 "5m", "1h"
  model: string;                   // 用于检测的模型
  prompt: string;                  // 检测用的 prompt
  maxDurationMs: number;           // 超时时间
}

// 池表单状态
export interface PoolFormState {
  name: string;
  description: string;
  maxConcurrency: number;
  rotationStrategy: RotationStrategy;
  selectedChannels: string[];
  selectedModels: PoolModelSelection[]; // New field
  healthCheckEnabled: boolean;
  healthCheckInterval: string;
  healthCheckModel: string;
}

// 渠道表单状态
export interface ChannelFormState {
  priority: number;
  weight: number;
  maxConcurrency: number;
  enabled: boolean;
}

// 模型池总览统计
export interface PoolOverviewStats {
  totalChannels: number;
  healthyChannels: number;
  unhealthyChannels: number;
  totalPools: number;
  activePools: number;
  healthCheckEnabled: boolean;
  successRate24h: number;
}
