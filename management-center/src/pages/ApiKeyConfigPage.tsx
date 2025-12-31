import { Fragment, useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import { ampcodeApi, providersApi, usageApi } from '@/services/api';
import { AmpcodeConfigModal } from '@/components/auth-config/AmpcodeConfigModal';
import { GeminiConfigModal } from '@/components/auth-config/GeminiConfigModal';
import { OpenAIConfigModal } from '@/components/auth-config/OpenAIConfigModal';
import { CodexConfigModal } from '@/components/auth-config/CodexConfigModal';
import { ClaudeConfigModal } from '@/components/auth-config/ClaudeConfigModal';
import {
  IconCheck,
  IconX,
} from '@/components/ui/icons';
import {
  hasDisableAllModelsRule,
  withDisableAllModelsRule,
  withoutDisableAllModelsRule,
} from '@/utils/auth-config';
import type {
  ProviderModalType,
} from '@/components/auth-config/types';
import type {
  GeminiKeyConfig,
  ProviderKeyConfig,
  OpenAIProviderConfig,
  ApiKeyEntry,
  Config,
} from '@/types';
import type { KeyStats, KeyStatBucket } from '@/utils/usage';
import { maskApiKey } from '@/utils/format';
import styles from './ApiKeyConfigPage.module.scss';



// 根据 source (apiKey) 获取统计数据 - 与旧版逻辑一致
const getStatsBySource = (
  apiKey: string,
  keyStats: KeyStats,
  maskFn: (key: string) => string
): KeyStatBucket => {
  const bySource = keyStats.bySource ?? {};
  const masked = maskFn(apiKey);
  return bySource[apiKey] || bySource[masked] || { success: 0, failure: 0 };
};

// 对于 OpenAI 提供商，汇总所有 apiKeyEntries 的统计 - 与旧版逻辑一致
const getOpenAIProviderStats = (
  apiKeyEntries: ApiKeyEntry[] | undefined,
  keyStats: KeyStats,
  maskFn: (key: string) => string
): KeyStatBucket => {
  const bySource = keyStats.bySource ?? {};
  let totalSuccess = 0;
  let totalFailure = 0;

  (apiKeyEntries || []).forEach((entry) => {
    const key = entry?.apiKey || '';
    if (!key) return;
    const masked = maskFn(key);
    const stats = bySource[key] || bySource[masked] || { success: 0, failure: 0 };
    totalSuccess += stats.success;
    totalFailure += stats.failure;
  });

  return { success: totalSuccess, failure: totalFailure };
};


export function ApiKeyConfigPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);

  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);
  const clearCache = useConfigStore((state) => state.clearCache);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [geminiKeys, setGeminiKeys] = useState<GeminiKeyConfig[]>([]);
  const [codexConfigs, setCodexConfigs] = useState<ProviderKeyConfig[]>([]);
  const [claudeConfigs, setClaudeConfigs] = useState<ProviderKeyConfig[]>([]);
  const [openaiProviders, setOpenaiProviders] = useState<OpenAIProviderConfig[]>([]);
  const [keyStats, setKeyStats] = useState<KeyStats>({ bySource: {}, byAuthIndex: {} });

  const [modal, setModal] = useState<ProviderModalType | null>(null);
  const [configSwitchingKey, setConfigSwitchingKey] = useState<string | null>(null);

  const disableControls = connectionStatus !== 'connected';

  const openAmpcodeModal = () => {
    setModal({ type: 'ampcode', index: null });
  };


  // 加载 key 统计
  const loadKeyStats = useCallback(async () => {
    try {
      const stats = await usageApi.getKeyStats();
      setKeyStats(stats);
    } catch {
      // 静默失败
    }
  }, []);

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = (await fetchConfig()) as Config;
      if (data) {
        setGeminiKeys(data.geminiApiKeys || []);
        setCodexConfigs(data.codexApiKeys || []);
        setClaudeConfigs(data.claudeApiKeys || []);
        setOpenaiProviders(data.openaiCompatibility || []);
      }
      try {
        const ampcode = await ampcodeApi.getAmpcode();
        updateConfigValue('ampcode', ampcode);
        clearCache('ampcode');
      } catch {
        // ignore
      }
    } catch (err: unknown) {
      setError((err as Error)?.message || t('notification.refresh_failed'));
    } finally {
      setLoading(false);
    }
  }, [clearCache, fetchConfig, t, updateConfigValue]);

  useEffect(() => {
    loadConfigs();
    loadKeyStats();
  }, [loadConfigs, loadKeyStats]);

  useEffect(() => {
    if (config?.geminiApiKeys) setGeminiKeys(config.geminiApiKeys);
    if (config?.codexApiKeys) setCodexConfigs(config.codexApiKeys);
    if (config?.claudeApiKeys) setClaudeConfigs(config.claudeApiKeys);
    if (config?.openaiCompatibility) setOpenaiProviders(config.openaiCompatibility);
  }, [
    config?.geminiApiKeys,
    config?.codexApiKeys,
    config?.claudeApiKeys,
    config?.openaiCompatibility,
  ]);

  const closeModal = () => {
    setModal(null);
  };

  const openGeminiModal = (index: number | null) => {
    setModal({ type: 'gemini', index });
  };

  const openProviderModal = (type: 'codex' | 'claude', index: number | null) => {
    setModal({ type, index });
  };


  const openOpenaiModal = (index: number | null) => {
    setModal({ type: 'openai', index });
  };



  const deleteGemini = async (apiKey: string) => {
    if (!window.confirm(t('ai_providers.gemini_delete_confirm'))) return;
    try {
      await providersApi.deleteGeminiKey(apiKey);
      const next = geminiKeys.filter((item) => item.apiKey !== apiKey);
      setGeminiKeys(next);
      updateConfigValue('gemini-api-key', next);
      clearCache('gemini-api-key');
      showNotification(t('notification.gemini_key_deleted'), 'success');
    } catch (err: unknown) {
      showNotification(`${t('notification.delete_failed')}: ${(err as Error)?.message || ''}`, 'error');
    }
  };

  const setConfigEnabled = async (
    provider: 'gemini' | 'codex' | 'claude',
    index: number,
    enabled: boolean
  ) => {
    if (provider === 'gemini') {
      const current = geminiKeys[index];
      if (!current) return;

      const switchingKey = `${provider}:${current.apiKey}`;
      setConfigSwitchingKey(switchingKey);

      const previousList = geminiKeys;
      const nextExcluded = enabled
        ? withoutDisableAllModelsRule(current.excludedModels)
        : withDisableAllModelsRule(current.excludedModels);
      const nextItem: GeminiKeyConfig = { ...current, excludedModels: nextExcluded };
      const nextList = previousList.map((item, idx) => (idx === index ? nextItem : item));

      setGeminiKeys(nextList);
      updateConfigValue('gemini-api-key', nextList);
      clearCache('gemini-api-key');

      try {
        await providersApi.saveGeminiKeys(nextList);
        showNotification(
          enabled ? t('notification.config_enabled') : t('notification.config_disabled'),
          'success'
        );
      } catch (err: unknown) {
        setGeminiKeys(previousList);
        updateConfigValue('gemini-api-key', previousList);
        clearCache('gemini-api-key');
        showNotification(`${t('notification.update_failed')}: ${(err as Error)?.message || ''}`, 'error');
      } finally {
        setConfigSwitchingKey(null);
      }
      return;
    }

    const source = provider === 'codex' ? codexConfigs : claudeConfigs;
    const current = source[index];
    if (!current) return;

    const switchingKey = `${provider}:${current.apiKey}`;
    setConfigSwitchingKey(switchingKey);

    const previousList = source;
    const nextExcluded = enabled
      ? withoutDisableAllModelsRule(current.excludedModels)
      : withDisableAllModelsRule(current.excludedModels);
    const nextItem: ProviderKeyConfig = { ...current, excludedModels: nextExcluded };
    const nextList = previousList.map((item, idx) => (idx === index ? nextItem : item));

    if (provider === 'codex') {
      setCodexConfigs(nextList);
      updateConfigValue('codex-api-key', nextList);
      clearCache('codex-api-key');
    } else {
      setClaudeConfigs(nextList);
      updateConfigValue('claude-api-key', nextList);
      clearCache('claude-api-key');
    }

    try {
      if (provider === 'codex') {
        await providersApi.saveCodexConfigs(nextList);
      } else {
        await providersApi.saveClaudeConfigs(nextList);
      }
      showNotification(
        enabled ? t('notification.config_enabled') : t('notification.config_disabled'),
        'success'
      );
    } catch (err: unknown) {
      if (provider === 'codex') {
        setCodexConfigs(previousList);
        updateConfigValue('codex-api-key', previousList);
        clearCache('codex-api-key');
      } else {
        setClaudeConfigs(previousList);
        updateConfigValue('claude-api-key', previousList);
        clearCache('claude-api-key');
      }
      showNotification(`${t('notification.update_failed')}: ${(err as Error)?.message || ''}`, 'error');
    } finally {
      setConfigSwitchingKey(null);
    }
  };


  const deleteProviderEntry = async (type: 'codex' | 'claude', apiKey: string) => {
    const confirmKey = type === 'codex' ? 'ai_providers.codex_delete_confirm' : 'ai_providers.claude_delete_confirm';
    if (!window.confirm(t(confirmKey))) return;
    try {
      if (type === 'codex') {
        await providersApi.deleteCodexConfig(apiKey);
        const next = codexConfigs.filter((item) => item.apiKey !== apiKey);
        setCodexConfigs(next);
        updateConfigValue('codex-api-key', next);
        clearCache('codex-api-key');
        showNotification(t('notification.codex_config_deleted'), 'success');
      } else {
        await providersApi.deleteClaudeConfig(apiKey);
        const next = claudeConfigs.filter((item) => item.apiKey !== apiKey);
        setClaudeConfigs(next);
        updateConfigValue('claude-api-key', next);
        clearCache('claude-api-key');
        showNotification(t('notification.claude_config_deleted'), 'success');
      }
    } catch (err: unknown) {
      showNotification(`${t('notification.delete_failed')}: ${(err as Error)?.message || ''}`, 'error');
    }
  };


  const deleteOpenai = async (name: string) => {
    if (!window.confirm(t('ai_providers.openai_delete_confirm'))) return;
    try {
      await providersApi.deleteOpenAIProvider(name);
      const next = openaiProviders.filter((item) => item.name !== name);
      setOpenaiProviders(next);
      updateConfigValue('openai-compatibility', next);
      clearCache('openai-compatibility');
      showNotification(t('notification.openai_provider_deleted'), 'success');
    } catch (err: unknown) {
      showNotification(`${t('notification.delete_failed')}: ${(err as Error)?.message || ''}`, 'error');
    }
  };


  const renderList = <T,>(
    items: T[],
    keyField: (item: T) => string,
    renderContent: (item: T, index: number) => ReactNode,
    onEdit: (index: number) => void,
    onDelete: (item: T) => void,
    addLabel: string,
    deleteLabel?: string,
    options?: {
      getRowDisabled?: (item: T, index: number) => boolean;
      renderExtraActions?: (item: T, index: number) => ReactNode;
    }
  ) => {
    if (loading) {
      return <div className="hint">{t('common.loading')}</div>;
    }

    if (!items.length) {
      return (
        <EmptyState
          title={t('common.info')}
          description={t('ai_providers.gemini_empty_desc')}
          action={
            <Button onClick={() => onEdit(-1)} disabled={disableControls}>
              {addLabel}
            </Button>
          }
        />
      );
    }

    return (
      <div className="item-list">
        {items.map((item, index) => {
          const rowDisabled = options?.getRowDisabled ? options.getRowDisabled(item, index) : false;
          return (
            <div
              key={keyField(item)}
              className="item-row"
              style={rowDisabled ? { opacity: 0.6 } : undefined}
            >
              <div className="item-meta">{renderContent(item, index)}</div>
              <div className="item-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onEdit(index)}
                  disabled={disableControls || Boolean(configSwitchingKey)}
                >
                  {t('common.edit')}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => onDelete(item)}
                  disabled={disableControls || Boolean(configSwitchingKey)}
                >
                  {deleteLabel || t('common.delete')}
                </Button>
                {options?.renderExtraActions ? options.renderExtraActions(item, index) : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>{t('ai_providers.title')}</h1>
      <div className={styles.content}>
        {error && <div className="error-box">{error}</div>}

        <Card
          title={t('ai_providers.gemini_title')}
          extra={
            <Button
              size="sm"
              onClick={() => openGeminiModal(null)}
              disabled={disableControls || Boolean(configSwitchingKey)}
            >
              {t('ai_providers.gemini_add_button')}
            </Button>
          }
        >
          {renderList<GeminiKeyConfig>(
            geminiKeys,
            (item) => item.apiKey,
            (item, index) => {
              const stats = getStatsBySource(item.apiKey, keyStats, maskApiKey);
              const headerEntries = Object.entries(item.headers || {});
              const configDisabled = hasDisableAllModelsRule(item.excludedModels);
              const excludedModels = item.excludedModels ?? [];
              return (
                <Fragment>
                  <div className="item-title">
                    {t('ai_providers.gemini_item_title')} #{index + 1}
                  </div>
                  {/* API Key 行 */}
                  <div className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>{t('common.api_key')}:</span>
                    <span className={styles.fieldValue}>{maskApiKey(item.apiKey)}</span>
                  </div>
                  {/* Base URL 行 */}
                  {item.baseUrl && (
                    <div className={styles.fieldRow}>
                      <span className={styles.fieldLabel}>{t('common.base_url')}:</span>
                      <span className={styles.fieldValue}>{item.baseUrl}</span>
                    </div>
                  )}
                  {/* 自定义请求头徽章 */}
                  {headerEntries.length > 0 && (
                    <div className={styles.headerBadgeList}>
                      {headerEntries.map(([key, value]) => (
                        <span key={key} className={styles.headerBadge}>
                          <strong>{key}:</strong> {value}
                        </span>
                      ))}
                    </div>
                  )}
                  {configDisabled && (
                    <div className="status-badge warning" style={{ marginTop: 8, marginBottom: 0 }}>
                      {t('ai_providers.config_disabled_badge')}
                    </div>
                  )}
                  {/* 排除模型徽章 */}
                  {excludedModels.length ? (
                    <div className={styles.excludedModelsSection}>
                      <div className={styles.excludedModelsLabel}>
                        {t('ai_providers.excluded_models_count', { count: excludedModels.length })}
                      </div>
                      <div className={styles.modelTagList}>
                        {excludedModels.map((model) => (
                          <span
                            key={model}
                            className={`${styles.modelTag} ${styles.excludedModelTag}`}
                          >
                            <span className={styles.modelName}>{model}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {/* 成功/失败统计 */}
                  <div className={styles.cardStats}>
                    <span className={`${styles.statPill} ${styles.statSuccess}`}>
                      {t('stats.success')}: {stats.success}
                    </span>
                    <span className={`${styles.statPill} ${styles.statFailure}`}>
                      {t('stats.failure')}: {stats.failure}
                    </span>
                  </div>
                </Fragment>
              );
            },
            (index) => openGeminiModal(index),
            (item) => deleteGemini(item.apiKey),
            t('ai_providers.gemini_add_button'),
            undefined,
            {
              getRowDisabled: (item) => hasDisableAllModelsRule(item.excludedModels),
              renderExtraActions: (item, index) => (
                <ToggleSwitch
                  label={t('ai_providers.config_toggle_label')}
                  checked={!hasDisableAllModelsRule(item.excludedModels)}
                  disabled={disableControls || loading || Boolean(configSwitchingKey)}
                  onChange={(value) => void setConfigEnabled('gemini', index, value)}
                />
              ),
            }
          )}
        </Card>

        <Card
          title={t('ai_providers.codex_title')}
          extra={
            <Button
              size="sm"
              onClick={() => openProviderModal('codex', null)}
              disabled={disableControls || Boolean(configSwitchingKey)}
            >
              {t('ai_providers.codex_add_button')}
            </Button>
          }
        >
          {renderList<ProviderKeyConfig>(
            codexConfigs,
            (item) => item.apiKey,
            (item, _index) => {
              const stats = getStatsBySource(item.apiKey, keyStats, maskApiKey);
              const headerEntries = Object.entries(item.headers || {});
              const configDisabled = hasDisableAllModelsRule(item.excludedModels);
              const excludedModels = item.excludedModels ?? [];
              return (
                <Fragment>
                  <div className="item-title">{t('ai_providers.codex_item_title')}</div>
                  {/* API Key 行 */}
                  <div className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>{t('common.api_key')}:</span>
                    <span className={styles.fieldValue}>{maskApiKey(item.apiKey)}</span>
                  </div>
                  {/* Base URL 行 */}
                  {item.baseUrl && (
                    <div className={styles.fieldRow}>
                      <span className={styles.fieldLabel}>{t('common.base_url')}:</span>
                      <span className={styles.fieldValue}>{item.baseUrl}</span>
                    </div>
                  )}
                  {/* Proxy URL 行 */}
                  {item.proxyUrl && (
                    <div className={styles.fieldRow}>
                      <span className={styles.fieldLabel}>{t('common.proxy_url')}:</span>
                      <span className={styles.fieldValue}>{item.proxyUrl}</span>
                    </div>
                  )}
                  {/* 自定义请求头徽章 */}
                  {headerEntries.length > 0 && (
                    <div className={styles.headerBadgeList}>
                      {headerEntries.map(([key, value]) => (
                        <span key={key} className={styles.headerBadge}>
                          <strong>{key}:</strong> {value}
                        </span>
                      ))}
                    </div>
                  )}
                  {configDisabled && (
                    <div className="status-badge warning" style={{ marginTop: 8, marginBottom: 0 }}>
                      {t('ai_providers.config_disabled_badge')}
                    </div>
                  )}
                  {/* 排除模型徽章 */}
                  {excludedModels.length ? (
                    <div className={styles.excludedModelsSection}>
                      <div className={styles.excludedModelsLabel}>
                        {t('ai_providers.excluded_models_count', { count: excludedModels.length })}
                      </div>
                      <div className={styles.modelTagList}>
                        {excludedModels.map((model) => (
                          <span
                            key={model}
                            className={`${styles.modelTag} ${styles.excludedModelTag}`}
                          >
                            <span className={styles.modelName}>{model}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {/* 成功/失败统计 */}
                  <div className={styles.cardStats}>
                    <span className={`${styles.statPill} ${styles.statSuccess}`}>
                      {t('stats.success')}: {stats.success}
                    </span>
                    <span className={`${styles.statPill} ${styles.statFailure}`}>
                      {t('stats.failure')}: {stats.failure}
                    </span>
                  </div>
                </Fragment>
              );
            },
            (index) => openProviderModal('codex', index),
            (item) => deleteProviderEntry('codex', item.apiKey),
            t('ai_providers.codex_add_button'),
            undefined,
            {
              getRowDisabled: (item) => hasDisableAllModelsRule(item.excludedModels),
              renderExtraActions: (item, index) => (
                <ToggleSwitch
                  label={t('ai_providers.config_toggle_label')}
                  checked={!hasDisableAllModelsRule(item.excludedModels)}
                  disabled={disableControls || loading || Boolean(configSwitchingKey)}
                  onChange={(value) => void setConfigEnabled('codex', index, value)}
                />
              ),
            }
          )}
        </Card>

        <Card
          title={t('ai_providers.claude_title')}
          extra={
            <Button
              size="sm"
              onClick={() => openProviderModal('claude', null)}
              disabled={disableControls || Boolean(configSwitchingKey)}
            >
              {t('ai_providers.claude_add_button')}
            </Button>
          }
        >
          {renderList<ProviderKeyConfig>(
            claudeConfigs,
            (item) => item.apiKey,
            (item, _index) => {
              const stats = getStatsBySource(item.apiKey, keyStats, maskApiKey);
              const headerEntries = Object.entries(item.headers || {});
              const configDisabled = hasDisableAllModelsRule(item.excludedModels);
              const excludedModels = item.excludedModels ?? [];
              return (
                <Fragment>
                  <div className="item-title">{t('ai_providers.claude_item_title')}</div>
                  {/* API Key 行 */}
                  <div className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>{t('common.api_key')}:</span>
                    <span className={styles.fieldValue}>{maskApiKey(item.apiKey)}</span>
                  </div>
                  {/* Base URL 行 */}
                  {item.baseUrl && (
                    <div className={styles.fieldRow}>
                      <span className={styles.fieldLabel}>{t('common.base_url')}:</span>
                      <span className={styles.fieldValue}>{item.baseUrl}</span>
                    </div>
                  )}
                  {/* Proxy URL 行 */}
                  {item.proxyUrl && (
                    <div className={styles.fieldRow}>
                      <span className={styles.fieldLabel}>{t('common.proxy_url')}:</span>
                      <span className={styles.fieldValue}>{item.proxyUrl}</span>
                    </div>
                  )}
                  {/* 自定义请求头徽章 */}
                  {headerEntries.length > 0 && (
                    <div className={styles.headerBadgeList}>
                      {headerEntries.map(([key, value]) => (
                        <span key={key} className={styles.headerBadge}>
                          <strong>{key}:</strong> {value}
                        </span>
                      ))}
                    </div>
                  )}
                  {configDisabled && (
                    <div className="status-badge warning" style={{ marginTop: 8, marginBottom: 0 }}>
                      {t('ai_providers.config_disabled_badge')}
                    </div>
                  )}
                  {/* 模型列表 */}
                  {item.models?.length ? (
                    <div className={styles.modelTagList}>
                      <span className={styles.modelCountLabel}>
                        {t('ai_providers.claude_models_count')}: {item.models.length}
                      </span>
                      {item.models.map((model) => (
                        <span key={model.name} className={styles.modelTag}>
                          <span className={styles.modelName}>{model.name}</span>
                          {model.alias && model.alias !== model.name && (
                            <span className={styles.modelAlias}>{model.alias}</span>
                          )}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {/* 排除模型徽章 */}
                  {excludedModels.length ? (
                    <div className={styles.excludedModelsSection}>
                      <div className={styles.excludedModelsLabel}>
                        {t('ai_providers.excluded_models_count', { count: excludedModels.length })}
                      </div>
                      <div className={styles.modelTagList}>
                        {excludedModels.map((model) => (
                          <span
                            key={model}
                            className={`${styles.modelTag} ${styles.excludedModelTag}`}
                          >
                            <span className={styles.modelName}>{model}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {/* 成功/失败统计 */}
                  <div className={styles.cardStats}>
                    <span className={`${styles.statPill} ${styles.statSuccess}`}>
                      {t('stats.success')}: {stats.success}
                    </span>
                    <span className={`${styles.statPill} ${styles.statFailure}`}>
                      {t('stats.failure')}: {stats.failure}
                    </span>
                  </div>
                </Fragment>
              );
            },
            (index) => openProviderModal('claude', index),
            (item) => deleteProviderEntry('claude', item.apiKey),
            t('ai_providers.claude_add_button'),
            undefined,
            {
              getRowDisabled: (item) => hasDisableAllModelsRule(item.excludedModels),
              renderExtraActions: (item, index) => (
                <ToggleSwitch
                  label={t('ai_providers.config_toggle_label')}
                  checked={!hasDisableAllModelsRule(item.excludedModels)}
                  disabled={disableControls || loading || Boolean(configSwitchingKey)}
                  onChange={(value) => void setConfigEnabled('claude', index, value)}
                />
              ),
            }
          )}
        </Card>

        <Card
          title={t('ai_providers.ampcode_title')}
          extra={
            <Button
              size="sm"
              onClick={openAmpcodeModal}
              disabled={disableControls || Boolean(configSwitchingKey)}
            >
              {t('common.edit')}
            </Button>
          }
        >
          {loading ? (
            <div className="hint">{t('common.loading')}</div>
          ) : (
            <>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>
                  {t('ai_providers.ampcode_upstream_url_label')}:
                </span>
                <span className={styles.fieldValue}>
                  {config?.ampcode?.upstreamUrl || t('common.not_set')}
                </span>
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>
                  {t('ai_providers.ampcode_upstream_api_key_label')}:
                </span>
                <span className={styles.fieldValue}>
                  {config?.ampcode?.upstreamApiKey
                    ? maskApiKey(config.ampcode.upstreamApiKey)
                    : t('common.not_set')}
                </span>
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>
                  {t('ai_providers.ampcode_restrict_management_label')}:
                </span>
                <span className={styles.fieldValue}>
                  {(config?.ampcode?.restrictManagementToLocalhost ?? true)
                    ? t('common.yes')
                    : t('common.no')}
                </span>
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>
                  {t('ai_providers.ampcode_force_model_mappings_label')}:
                </span>
                <span className={styles.fieldValue}>
                  {(config?.ampcode?.forceModelMappings ?? false)
                    ? t('common.yes')
                    : t('common.no')}
                </span>
              </div>
              <div className={styles.fieldRow} style={{ marginTop: 8 }}>
                <span className={styles.fieldLabel}>
                  {t('ai_providers.ampcode_model_mappings_count')}:
                </span>
                <span className={styles.fieldValue}>
                  {config?.ampcode?.modelMappings?.length || 0}
                </span>
              </div>
              {config?.ampcode?.modelMappings?.length ? (
                <div className={styles.modelTagList}>
                  {config.ampcode.modelMappings.slice(0, 5).map((mapping) => (
                    <span key={`${mapping.from}→${mapping.to}`} className={styles.modelTag}>
                      <span className={styles.modelName}>{mapping.from}</span>
                      <span className={styles.modelAlias}>{mapping.to}</span>
                    </span>
                  ))}
                  {config.ampcode.modelMappings.length > 5 && (
                    <span className={styles.modelTag}>
                      <span className={styles.modelName}>
                        +{config.ampcode.modelMappings.length - 5}
                      </span>
                    </span>
                  )}
                </div>
              ) : null}
            </>
          )}
        </Card>

        <Card
          title={t('ai_providers.openai_title')}
          extra={
            <Button
              size="sm"
              onClick={() => openOpenaiModal(null)}
              disabled={disableControls || Boolean(configSwitchingKey)}
            >
              {t('ai_providers.openai_add_button')}
            </Button>
          }
        >
          {renderList<OpenAIProviderConfig>(
            openaiProviders,
            (item) => item.name,
            (item, _index) => {
              const stats = getOpenAIProviderStats(item.apiKeyEntries, keyStats, maskApiKey);
              const headerEntries = Object.entries(item.headers || {});
              const apiKeyEntries = item.apiKeyEntries || [];
              return (
                <Fragment>
                  <div className="item-title">{item.name}</div>
                  {/* Base URL 行 */}
                  <div className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>{t('common.base_url')}:</span>
                    <span className={styles.fieldValue}>{item.baseUrl}</span>
                  </div>
                  {/* 自定义请求头徽章 */}
                  {headerEntries.length > 0 && (
                    <div className={styles.headerBadgeList}>
                      {headerEntries.map(([key, value]) => (
                        <span key={key} className={styles.headerBadge}>
                          <strong>{key}:</strong> {value}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* API密钥条目二级卡片 */}
                  {apiKeyEntries.length > 0 && (
                    <div className={styles.apiKeyEntriesSection}>
                      <div className={styles.apiKeyEntriesLabel}>
                        {t('ai_providers.openai_keys_count')}: {apiKeyEntries.length}
                      </div>
                      <div className={styles.apiKeyEntryList}>
                        {apiKeyEntries.map((entry, entryIndex) => {
                          const entryStats = getStatsBySource(entry.apiKey, keyStats, maskApiKey);
                          return (
                            <div key={entryIndex} className={styles.apiKeyEntryCard}>
                              <span className={styles.apiKeyEntryIndex}>{entryIndex + 1}</span>
                              <span className={styles.apiKeyEntryKey}>
                                {maskApiKey(entry.apiKey)}
                              </span>
                              {entry.proxyUrl && (
                                <span className={styles.apiKeyEntryProxy}>{entry.proxyUrl}</span>
                              )}
                              <div className={styles.apiKeyEntryStats}>
                                <span
                                  className={`${styles.apiKeyEntryStat} ${styles.apiKeyEntryStatSuccess}`}
                                >
                                  <IconCheck size={12} /> {entryStats.success}
                                </span>
                                <span
                                  className={`${styles.apiKeyEntryStat} ${styles.apiKeyEntryStatFailure}`}
                                >
                                  <IconX size={12} /> {entryStats.failure}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* 模型数量标签 */}
                  <div className={styles.fieldRow} style={{ marginTop: '8px' }}>
                    <span className={styles.fieldLabel}>
                      {t('ai_providers.openai_models_count')}:
                    </span>
                    <span className={styles.fieldValue}>{item.models?.length || 0}</span>
                  </div>
                  {/* 模型列表徽章 */}
                  {item.models?.length ? (
                    <div className={styles.modelTagList}>
                      {item.models.map((model) => (
                        <span key={model.name} className={styles.modelTag}>
                          <span className={styles.modelName}>{model.name}</span>
                          {model.alias && model.alias !== model.name && (
                            <span className={styles.modelAlias}>{model.alias}</span>
                          )}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {/* 测试模型 */}
                  {item.testModel && (
                    <div className={styles.fieldRow}>
                      <span className={styles.fieldLabel}>Test Model:</span>
                      <span className={styles.fieldValue}>{item.testModel}</span>
                    </div>
                  )}
                  {/* 成功/失败统计（汇总） */}
                  <div className={styles.cardStats}>
                    <span className={`${styles.statPill} ${styles.statSuccess}`}>
                      {t('stats.success')}: {stats.success}
                    </span>
                    <span className={`${styles.statPill} ${styles.statFailure}`}>
                      {t('stats.failure')}: {stats.failure}
                    </span>
                  </div>
                </Fragment>
              );
            },
            (index) => openOpenaiModal(index),
            (item) => deleteOpenai(item.name),
            t('ai_providers.openai_add_button')
          )}
        </Card>

        {/* Ampcode Modal */}
        {/* Ampcode Modal */}
        <AmpcodeConfigModal
          open={modal?.type === 'ampcode'}
          onClose={closeModal}
          config={config?.ampcode}
        />

        {/* Gemini Modal */}
        {/* Gemini Modal */}
        <GeminiConfigModal
          open={modal?.type === 'gemini'}
          onClose={closeModal}
          index={modal?.index ?? null}
          initialData={
            modal?.type === 'gemini' && modal?.index !== null
              ? geminiKeys[modal.index]
              : undefined
          }
          existingKeys={geminiKeys}
        />

        {/* Codex Config Modal */}
        <CodexConfigModal
          open={modal?.type === 'codex'}
          onClose={closeModal}
          initialData={
            modal?.type === 'codex' && modal?.index !== null
              ? codexConfigs[modal.index]
              : undefined
          }
          index={modal?.index ?? null}
          existingConfigs={codexConfigs}
        />

        {/* Claude Config Modal */}
        <ClaudeConfigModal
          open={modal?.type === 'claude'}
          onClose={closeModal}
          initialData={
            modal?.type === 'claude' && modal?.index !== null
              ? claudeConfigs[modal.index]
              : undefined
          }
          index={modal?.index ?? null}
          existingConfigs={claudeConfigs}
        />

        {/* OpenAI Modal */}
        <OpenAIConfigModal
          open={modal?.type === 'openai'}
          onClose={closeModal}
          initialData={
            modal?.type === 'openai' && modal?.index !== null
              ? openaiProviders[modal.index]
              : undefined
          }
          index={modal?.index ?? null}
          existingProviders={openaiProviders}
        />
      </div>
    </div>
  );
}
