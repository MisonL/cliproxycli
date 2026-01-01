import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { IconGithub, IconBookOpen, IconCode } from '@/components/ui/icons';
import { useAuthStore, useConfigStore, useNotificationStore, useModelsStore } from '@/stores';
import { apiKeysApi } from '@/services/api/apiKeys';
import { classifyModels } from '@/utils/models';

export function SystemPage() {
  const { t, i18n } = useTranslation();
  const { showNotification } = useNotificationStore();
  const auth = useAuthStore();
  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);

  const models = useModelsStore((state) => state.models);
  const modelsLoading = useModelsStore((state) => state.loading);
  const fetchModelsFromStore = useModelsStore((state) => state.fetchModels);

  const apiKeysCache = useRef<string[]>([]);

  const otherLabel = useMemo(
    () => (i18n.language?.toLowerCase().startsWith('zh') ? '其他' : 'Other'),
    [i18n.language]
  );
  const groupedModels = useMemo(() => classifyModels(models, { otherLabel }), [models, otherLabel]);

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

      <div style={{ padding: '0 40px 80px', marginTop: '-40px' }} className="flex-column gap-xl">
        {/* 系统核心指标 */}
        <section className="flex-column gap-lg">
          <div className="flex-row items-center gap-md">
            <div style={{ width: '8px', height: '20px', borderRadius: '4px', background: 'var(--primary-color)' }} />
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>{t('system_info.connection_status_title')}</h2>
          </div>
          
          <div className="grid cols-4" style={{ gap: '20px' }}>
            <div className="card-glass flex-column gap-xs" style={{ padding: '24px', borderRadius: '24px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{t('connection.server_address')}</span>
              <span style={{ fontSize: '18px', fontWeight: 850, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{auth.apiBase || '-'}</span>
            </div>
            <div className="card-glass flex-column gap-xs" style={{ padding: '24px', borderRadius: '24px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{t('footer.api_version')}</span>
              <span style={{ fontSize: '18px', fontWeight: 850, color: 'var(--text-primary)' }}>{auth.serverVersion || t('system_info.version_unknown')}</span>
            </div>
            <div className="card-glass flex-column gap-xs" style={{ padding: '24px', borderRadius: '24px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{t('footer.build_date')}</span>
              <span style={{ fontSize: '18px', fontWeight: 850, color: 'var(--text-primary)' }}>
                {auth.serverBuildDate ? new Date(auth.serverBuildDate).toLocaleDateString() : t('system_info.version_unknown')}
              </span>
            </div>
            <div className="card-glass flex-column gap-xs" style={{ padding: '24px', borderRadius: '24px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{t('connection.status')}</span>
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

        {/* 快捷导航 */}
        <section className="flex-column gap-lg">
          <div className="flex-row items-center gap-md">
            <div style={{ width: '8px', height: '20px', borderRadius: '4px', background: 'var(--primary-color)' }} />
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>{t('system_info.quick_links_title')}</h2>
          </div>
          
          <div className="grid cols-3" style={{ gap: '20px' }}>
            <a href="https://github.com/router-for-me/CLIProxyAPI" target="_blank" rel="noopener noreferrer" className="card-glass flex-row items-center gap-lg card-hover" style={{ padding: '24px', borderRadius: '24px', textDecoration: 'none' }}>
              <div className="flex-center" style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'rgba(51, 65, 85, 0.1)', color: '#334155' }}>
                <IconGithub size={28} />
              </div>
              <div className="flex-column gap-xs">
                <span style={{ fontSize: '16px', fontWeight: 850, color: 'var(--text-primary)' }}>{t('system_info.link_main_repo')}</span>
                <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{t('system_info.link_main_repo_desc')}</span>
              </div>
            </a>

            <a href="https://github.com/router-for-me/Cli-Proxy-API-Management-Center" target="_blank" rel="noopener noreferrer" className="card-glass flex-row items-center gap-lg card-hover" style={{ padding: '24px', borderRadius: '24px', textDecoration: 'none' }}>
              <div className="flex-center" style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary-color)' }}>
                <IconCode size={28} />
              </div>
              <div className="flex-column gap-xs">
                <span style={{ fontSize: '16px', fontWeight: 850, color: 'var(--text-primary)' }}>{t('system_info.link_webui_repo')}</span>
                <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{t('system_info.link_webui_repo_desc')}</span>
              </div>
            </a>

            <a href="https://help.router-for.me/" target="_blank" rel="noopener noreferrer" className="card-glass flex-row items-center gap-lg card-hover" style={{ padding: '24px', borderRadius: '24px', textDecoration: 'none' }}>
              <div className="flex-center" style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success-color)' }}>
                <IconBookOpen size={28} />
              </div>
              <div className="flex-column gap-xs">
                <span style={{ fontSize: '16px', fontWeight: 850, color: 'var(--text-primary)' }}>{t('system_info.link_docs')}</span>
                <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{t('system_info.link_docs_desc')}</span>
              </div>
            </a>
          </div>
        </section>

        {/* 模型兼容性概览 */}
        <section className="flex-column gap-lg">
          <div className="flex-row justify-between items-center">
            <div className="flex-row items-center gap-md">
              <div style={{ width: '8px', height: '20px', borderRadius: '4px', background: 'var(--primary-color)' }} />
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>{t('system_info.models_title')}</h2>
            </div>
            <Button variant="secondary" onClick={() => fetchModels({ forceRefresh: true })} loading={modelsLoading} className="btn-glass">
              <span style={{ fontSize: '13px' }}>{t('common.refresh')}</span>
            </Button>
          </div>

          <div className="card-glass" style={{ padding: '0', borderRadius: '28px', overflow: 'hidden' }}>
            <div style={{ padding: '24px 32px', background: 'rgba(var(--bg-primary-rgb), 0.3)', borderBottom: '1px solid var(--border-light)' }}>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>{t('system_info.models_desc')}</p>
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
                      <div className="flex-row flex-wrap gap-sm">
                        {group.items.map((model) => (
                          <div key={`${model.name}-${model.alias ?? 'default'}`} className="flex-column p-sm card-glass card-hover" style={{ minWidth: '120px', borderRadius: '12px', background: 'rgba(var(--bg-primary-rgb), 0.4)' }} title={model.description || ''}>
                             <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{model.name}</span>
                             {model.alias && <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{model.alias}</span>}
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
  );
}
