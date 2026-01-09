import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { IconCode, IconActivity } from '@/components/ui/icons';
import { useAuthStore, useConfigStore, useNotificationStore, useModelsStore } from '@/stores';
import { apiKeysApi } from '@/services/api/apiKeys';
import { modelPoolApi } from '@/services/api/modelPool';
import { classifyModels, ModelInfo } from '@/utils/models';
import type { Channel } from '@/types/modelPool';

export function SystemPage() {
  const { t, i18n } = useTranslation();
  const { showNotification } = useNotificationStore();
  const auth = useAuthStore();
  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);

  const models = useModelsStore((state) => state.models);
  const modelsLoading = useModelsStore((state) => state.loading);
  const fetchModelsFromStore = useModelsStore((state) => state.fetchModels);

  const [channels, setChannels] = useState<Channel[]>([]);
  const apiKeysCache = useRef<string[]>([]);

  // Fetch channels to boost model prefix accuracy
  useEffect(() => {
    const loadChannels = async () => {
      try {
        const list = await modelPoolApi.getChannels();
        setChannels(list || []);
      } catch (err) {
        console.warn('Failed to load channels for model mapping:', err);
      }
    };
    loadChannels();
  }, []);

  const otherLabel = useMemo(
    () => (i18n.language?.toLowerCase().startsWith('zh') ? '其他' : 'Other'),
    [i18n.language]
  );

  // Enhance models with channel info
  const enhancedModels = useMemo(() => {
    if (!models || !models.length) return [];
    
    // Create a map of modelName -> providerPrefix
    const modelPrefixMap = new Map<string, string>();
    channels.forEach(channel => {
      if (channel.models && Array.isArray(channel.models)) {
        channel.models.forEach((m: string) => {
           // Channel provider is usually the prefix we want (e.g. 'openai', 'anthropic')
           // We prioritize explicit channels
           if (!modelPrefixMap.has(m)) {
             modelPrefixMap.set(m, channel.provider);
           }
        });
      }
    });

    return models.map(model => {
       const mappedPrefix = modelPrefixMap.get(model.name);
       if (mappedPrefix && !model.name.includes(':')) {
         return {
           ...model,
           // Injecting prefix effectively for classifyModels
           name: `${mappedPrefix}:${model.name}`,
           originalName: model.name // Keep track if needed
         } as ModelInfo;
       }
       return model;
    });
  }, [models, channels]);

  const groupedModels = useMemo(() => classifyModels(enhancedModels, { otherLabel }), [enhancedModels, otherLabel]);

  const normalizeApiKeyList = (input: unknown): string[] => {
    if (!Array.isArray(input)) return [];
    const seen = new Set<string>();
    const keys: string[] = [];

    input.forEach((item: unknown) => {
      const itemObj = item as Record<string, unknown>;
      const value = typeof item === 'string' ? item : itemObj?.['api-key'] ?? itemObj?.apiKey ?? '';
      const trimmed = String(value || '').trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      keys.push(trimmed);
    });

    return keys;
  };

  const resolveApiKeysForModels = useCallback(async () => {
    if (apiKeysCache.current.length) {
      return apiKeysCache.current;
    }

    const configKeys = normalizeApiKeyList(config?.apiKeys);
    if (configKeys.length) {
      apiKeysCache.current = configKeys;
      return configKeys;
    }

    try {
      const list = await apiKeysApi.list();
      const normalized = normalizeApiKeyList(list);
      if (normalized.length) {
        apiKeysCache.current = normalized;
      }
      return normalized;
    } catch (err) {
      console.warn('Auto loading API keys for models failed:', err);
      return [];
    }
  }, [config?.apiKeys]);

  const fetchModels = async ({ forceRefresh = false }: { forceRefresh?: boolean } = {}) => {
    if (auth.connectionStatus !== 'connected') {
      return;
    }

    if (!auth.apiBase) {
      showNotification(t('notification.connection_required'), 'warning');
      return;
    }

    if (forceRefresh) {
      apiKeysCache.current = [];
    }

    try {
      const apiKeys = await resolveApiKeysForModels();
      const primaryKey = apiKeys[0];
      await fetchModelsFromStore(auth.apiBase, primaryKey, forceRefresh);
    } catch (err: unknown) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchConfig().catch(() => {
      // ignore
    });
  }, [fetchConfig]);

  useEffect(() => {
    fetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.connectionStatus, auth.apiBase]);

  return (
    <div className="flex-column">
      <header className="hero-wrapper">
        <div className="hero-content">
          <div className="flex-column gap-xs">
            <div className="badge badge-primary" style={{ marginBottom: '8px', width: 'fit-content' }}>
               System Core
            </div>
            <h1 className="hero-title">{t('system_info.title')}</h1>
            <p className="hero-subtitle">{t('system_info.description') || '系统底层运行状态、API 版本信息与官方技术文档索引。'}</p>
          </div>
        </div>
      </header>

      <div className="page-container">
        <div className="card card-glass">
          <div className="card-body" style={{ padding: '32px' }}>
            <div className="flex-column gap-xl">
              {/* 系统核心指标 */}
              <section className="flex-column gap-lg">
                <div className="flex-row items-center justify-between">
                  <div className="flex-column gap-xs">
                    <h2 className="title" style={{ fontSize: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, rgba(var(--primary-color-rgb), 0.2) 0%, rgba(var(--primary-color-rgb), 0.05) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <IconActivity size={18} style={{ color: 'var(--primary-color)' }} />
                      </div>
                      {t('system_info.connection_status_title')}
                    </h2>
                    <p className="text-tertiary" style={{ fontSize: '14px', fontWeight: 500, paddingLeft: '42px' }}>
                      实时监控系统连接状态、API 版本一致性与构建元数据。
                    </p>
                  </div>
                </div>
                
                <div className="grid cols-4" style={{ gap: '20px' }}>
                  <div className="card-glass flex-column gap-sm card-hover" style={{ padding: '24px', borderRadius: '20px', background: 'rgba(var(--bg-primary-rgb), 0.4)' }}>
                    <div className="flex-row items-center gap-sm">
                       <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--primary-color)' }}></div>
                       <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{t('connection.server_address')}</span>
                    </div>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                      {auth.apiBase || '-'}
                    </span>
                  </div>

                  <div className="card-glass flex-column gap-sm card-hover" style={{ padding: '24px', borderRadius: '20px', background: 'rgba(var(--bg-primary-rgb), 0.4)' }}>
                     <div className="flex-row items-center gap-sm">
                       <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--warning-color)' }}></div>
                       <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{t('footer.api_version')}</span>
                    </div>
                    <span style={{ fontSize: '18px', fontWeight: 850, color: 'var(--text-primary)' }}>{auth.serverVersion || t('system_info.version_unknown')}</span>
                  </div>

                  <div className="card-glass flex-column gap-sm card-hover" style={{ padding: '24px', borderRadius: '20px', background: 'rgba(var(--bg-primary-rgb), 0.4)' }}>
                    <div className="flex-row items-center gap-sm">
                       <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--info-color)' }}></div>
                       <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{t('footer.build_date')}</span>
                    </div>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {auth.serverBuildDate ? new Date(auth.serverBuildDate).toLocaleDateString() : t('system_info.version_unknown')}
                    </span>
                  </div>

                  <div className="card-glass flex-column gap-sm card-hover" style={{ padding: '24px', borderRadius: '20px', background: 'rgba(var(--bg-primary-rgb), 0.4)' }}>
                    <div className="flex-row items-center gap-sm">
                       <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success-color)' }}></div>
                       <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{t('connection.status')}</span>
                    </div>
                    <div className="flex-row items-center gap-sm">
                      <div className="record-dot" style={{ 
                        width: '8px', height: '8px', 
                        background: auth.connectionStatus === 'connected' ? 'var(--success-color)' : 'var(--error-color)',
                        boxShadow: `0 0 10px ${auth.connectionStatus === 'connected' ? 'var(--success-color)' : 'var(--error-color)'}`
                      }} />
                      <span style={{ fontSize: '18px', fontWeight: 850, color: auth.connectionStatus === 'connected' ? 'var(--success-color)' : 'var(--error-color)' }}>
                        {t(`common.${auth.connectionStatus}_status` as 'common.connected_status')}
                      </span>
                    </div>
                  </div>
                </div>
              </section>


              {/* 模型兼容性概览 */}
              <section className="flex-column gap-lg">
                <div className="flex-row justify-between items-center">
                  <div className="flex-column gap-xs">
                    <h2 className="title" style={{ fontSize: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.05) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <IconCode size={18} style={{ color: 'var(--error-color)' }} />
                      </div>
                      {t('system_info.models_title')}
                    </h2>
                    <p className="text-tertiary" style={{ fontSize: '14px', fontWeight: 500, paddingLeft: '42px' }}>
                      系统支持的 CLI 模型清单、别名映射与功能描述。
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => fetchModels({ forceRefresh: true })} loading={modelsLoading} className="btn-glass">
                    <span style={{ fontSize: '13px' }}>{t('common.refresh')}</span>
                  </Button>
                </div>

                <div className="card-glass" style={{ padding: '0', borderRadius: '28px', overflow: 'hidden' }}>
                  <div style={{ padding: '24px 32px', background: 'rgba(var(--bg-primary-rgb), 0.3)', borderBottom: '1px solid var(--border-light)' }}>
                    <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {t('system_info.models_desc')} (Displaying actual API Model IDs)
                    </p>
                  </div>

                  <div className="flex-column" style={{ padding: '16px' }}>
                    {modelsLoading ? (
                      <div className="flex-center" style={{ height: '200px' }}><LoadingSpinner /></div>
                    ) : models.length === 0 ? (
                      <div className="flex-center" style={{ height: '200px', color: 'var(--text-tertiary)' }}>{t('system_info.models_empty')}</div>
                    ) : (
                      <div className="flex-column gap-md">
                         {groupedModels.map((group) => (
                          <div key={group.id} className="card-glass" style={{ padding: '20px 24px', borderRadius: '20px', background: 'rgba(var(--bg-primary-rgb), 0.2)', border: '1px solid var(--border-light)' }}>
                            <div className="flex-row justify-between items-center mb-md">
                              <span style={{ fontSize: '16px', fontWeight: 850, color: 'var(--text-primary)' }}>{group.label}</span>
                              <span className="badge badge-secondary">{group.items.length} Models</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                              {group.items.map((model) => (
                                <div 
                                  key={model.fullId || model.name} 
                                  className="flex-row items-center p-md card-glass card-hover" 
                                  style={{ 
                                    borderRadius: '16px', 
                                    background: 'rgba(var(--bg-primary-rgb), 0.4)', 
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    cursor: 'pointer'
                                  }}
                                  onClick={() => navigator.clipboard.writeText(model.fullId || model.name)}
                                  title={`${t('common.copy')}: ${model.fullId || model.name}\n${model.description || ''}`}
                                >
                                   {/* Color Accent Bar */}
                                   <div style={{ 
                                      position: 'absolute', 
                                      left: 0, 
                                      top: 0, 
                                      bottom: 0, 
                                      width: '4px', 
                                      background: model.categoryColor || 'var(--primary-color)',
                                      opacity: 0.8
                                   }} />

                                   <div className="flex-column gap-xs" style={{ paddingLeft: '12px', width: '100%' }}>
                                      <div className="flex-row justify-between items-center">
                                        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                                          {model.fullId || model.name}
                                        </span>
                                        {model.providerPrefix && (
                                          <span style={{ 
                                            fontSize: '10px', 
                                            padding: '2px 6px', 
                                            borderRadius: '4px', 
                                            background: `${model.categoryColor}20`, 
                                            color: model.categoryColor,
                                            textTransform: 'uppercase',
                                            fontWeight: 600
                                          }}>
                                            {model.providerPrefix}
                                          </span>
                                        )}
                                      </div>
                                      {/* Show alias or description if available */}
                                      {(model.alias || model.description) && (
                                        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {model.alias ? `Alias: ${model.alias}` : model.description}
                                        </span>
                                      )}
                                   </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
