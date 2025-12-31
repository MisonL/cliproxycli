export interface UnifiedModelConfig {
  include?: string[];
  exclude?: string[];
  alias?: Record<string, string>;
}

export interface UnifiedProvider {
  id: string;
  type: string;
  enabled: boolean;
  priority: number;
  weight: number;
  tags?: string[];
  prefix?: string;
  credentials: Record<string, string>;
  proxyUrl?: string; // Backend JSON tag is 'proxy-url', need to verify mapper
  models?: UnifiedModelConfig;
}

export interface SchedulingConfig {
  strategy: 'priority' | 'load-balance' | 'round-robin' | 'sticky';
  retry?: number;
  fallback?: boolean;
}
