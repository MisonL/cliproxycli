import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { Button } from '@/components/ui/Button';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import { configApi } from '@/services/api';
import type { Config } from '@/types';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { IconSettings, IconShield, IconActivity, IconCpu, IconSearch, IconScrollText, IconFileText, IconShieldCheck, IconLayoutGrid, IconEye, IconActivity as IconPulse, IconExternalLink, IconTimer } from '@/components/ui/icons';

type PendingKey =
  | 'debug'
  | 'proxy'
  | 'retry'
  | 'switchProject'
  | 'switchPreview'
  | 'usage'
  | 'requestLog'
  | 'loggingToFile'
  | 'wsAuth';

export function SettingsPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);
  const clearCache = useConfigStore((state) => state.clearCache);

  const [loading, setLoading] = useState(true);
  const [proxyValue, setProxyValue] = useState('');
  const [retryValue, setRetryValue] = useState(0);
  const [pending, setPending] = useState<Record<PendingKey, boolean>>({} as Record<PendingKey, boolean>);
  const [error, setError] = useState('');

  const disableControls = connectionStatus !== 'connected';

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const data = (await fetchConfig()) as Config;
        setProxyValue(data?.proxyUrl ?? '');
        setRetryValue(typeof data?.requestRetry === 'number' ? data.requestRetry : 0);
      } catch (err: unknown) {
        setError((err as Error)?.message || t('notification.refresh_failed'));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [fetchConfig, t]);

  useEffect(() => {
    if (config) {
      setProxyValue(config.proxyUrl ?? '');
      if (typeof config.requestRetry === 'number') {
        setRetryValue(config.requestRetry);
      }
    }
  }, [config]);

  const setPendingFlag = (key: PendingKey, value: boolean) => {
    setPending((prev) => ({ ...prev, [key]: value }));
  };

  const toggleSetting = async (
    section: PendingKey,
    rawKey: 'debug' | 'usage-statistics-enabled' | 'request-log' | 'logging-to-file' | 'ws-auth',
    value: boolean,
    updater: (val: boolean) => Promise<unknown>,
    successMessage: string
  ) => {
    const previous = (() => {
      switch (rawKey) {
        case 'debug':
          return config?.debug ?? false;
        case 'usage-statistics-enabled':
          return config?.usageStatisticsEnabled ?? false;
        case 'request-log':
          return config?.requestLog ?? false;
        case 'logging-to-file':
          return config?.loggingToFile ?? false;
        case 'ws-auth':
          return config?.wsAuth ?? false;
        default:
          return false;
      }
    })();

    setPendingFlag(section, true);
    updateConfigValue(rawKey, value);

    try {
      await updater(value);
      clearCache(rawKey);
      showNotification(successMessage, 'success');
    } catch (err: unknown) {
      updateConfigValue(rawKey, previous);
      showNotification(`${t('notification.update_failed')}: ${(err as Error)?.message || ''}`, 'error');
    } finally {
      setPendingFlag(section, false);
    }
  };

  const handleProxyUpdate = async () => {
    const previous = config?.proxyUrl ?? '';
    setPendingFlag('proxy', true);
    updateConfigValue('proxy-url', proxyValue);
    try {
      await configApi.updateProxyUrl(proxyValue.trim());
      clearCache('proxy-url');
      showNotification(t('notification.proxy_updated'), 'success');
    } catch (err: unknown) {
      setProxyValue(previous);
      updateConfigValue('proxy-url', previous);
      showNotification(`${t('notification.update_failed')}: ${(err as Error)?.message || ''}`, 'error');
    } finally {
      setPendingFlag('proxy', false);
    }
  };

  const handleProxyClear = async () => {
    const previous = config?.proxyUrl ?? '';
    setPendingFlag('proxy', true);
    updateConfigValue('proxy-url', '');
    try {
      await configApi.clearProxyUrl();
      clearCache('proxy-url');
      setProxyValue('');
      showNotification(t('notification.proxy_cleared'), 'success');
    } catch (err: unknown) {
      setProxyValue(previous);
      updateConfigValue('proxy-url', previous);
      showNotification(`${t('notification.update_failed')}: ${(err as Error)?.message || ''}`, 'error');
    } finally {
      setPendingFlag('proxy', false);
    }
  };

  const handleRetryUpdate = async () => {
    const previous = config?.requestRetry ?? 0;
    const parsed = Number(retryValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
      showNotification(t('login.error_invalid'), 'error');
      setRetryValue(previous);
      return;
    }
    setPendingFlag('retry', true);
    updateConfigValue('request-retry', parsed);
    try {
      await configApi.updateRequestRetry(parsed);
      clearCache('request-retry');
      showNotification(t('notification.retry_updated'), 'success');
    } catch (err: unknown) {
      setRetryValue(previous);
      updateConfigValue('request-retry', previous);
      showNotification(`${t('notification.update_failed')}: ${(err as Error)?.message || ''}`, 'error');
    } finally {
      setPendingFlag('retry', false);
    }
  };

  const quotaSwitchProject = config?.quotaExceeded?.switchProject ?? false;
  const quotaSwitchPreview = config?.quotaExceeded?.switchPreviewModel ?? false;

  if (loading) return <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}><LoadingSpinner /></div>;

  const SettingItem = ({ icon, title, description, children, complex }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode, complex?: boolean }) => (
    <div className={`setting-item-premium ${complex ? 'has-complex-control' : ''}`}>
      <div className="setting-icon-wrapper">{icon}</div>
      <div className="setting-content">
        <span className="setting-title">{title}</span>
        <span className="setting-description">{description}</span>
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );

  return (
    <div className="flex-column">
      {/* Hero Header Section */}
      <div style={{ padding: '60px 40px 20px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: '1200px' }}>
          <div className="card card-glass" style={{ padding: '48px', background: 'linear-gradient(135deg, var(--bg-glass) 0%, rgba(59, 130, 246, 0.05) 100%)' }}>
            <div className="flex-row items-center gap-md" style={{ marginBottom: '24px' }}>
              <div className="feature-icon">
                <IconSettings size={32} />
              </div>
              <div className="badge badge-success">System Core v1.2</div>
            </div>
            <h1 className="hero-title" style={{ fontSize: '48px', marginBottom: '16px' }}>系统基础配置</h1>
            <p className="hero-subtitle" style={{ maxWidth: '800px', fontSize: '16px', lineHeight: '1.6' }}>
              精细化管理代理调度、重试机制与全局配额策略。所有修改均会实时同步至全网关节点，确保集群运行的一致性与稳定性。
            </p>
          </div>
        </div>
      </div>
      
      {/* Settings Grid Content */}
      <div className="page-container">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '32px' }}>
          
          {/* Box 1: 运行功能控制 */}
          <div className="card card-glass">
            <div className="card-header">
              <div className="flex-row items-center gap-sm">
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(59, 130, 246, 0.05) 100%)', border: '1px solid rgba(59, 130, 246, 0.15)' }}>
                  <IconSettings size={18} style={{ color: 'var(--primary-color)', filter: 'drop-shadow(0 2px 4px rgba(59, 130, 246, 0.3))' }} />
                </div>
                <span className="title" style={{ fontSize: '18px' }}>运行特性</span>
              </div>
            </div>
            <div className="card-body" style={{ padding: '8px' }}>
              {error && <div className="badge badge-error" style={{ margin: '16px', width: 'calc(100% - 32px)' }}>{error}</div>}
              <div className="flex-column">
                <SettingItem
                  icon={<IconSearch size={20} />}
                  title="调试模式 (Debug)"
                  description="在控制台开启深度日志记录，辅助排查异常"
                >
                  <ToggleSwitch
                    checked={config?.debug ?? false}
                    disabled={disableControls || pending.debug || loading}
                    onChange={(value) => toggleSetting('debug', 'debug', value, configApi.updateDebug, t('notification.debug_updated'))}
                  />
                </SettingItem>

                <SettingItem
                  icon={<IconPulse size={20} />}
                  title="使用统计 (Telemetry)"
                  description="匿名汇总节点流量、延时与成功率指标"
                >
                  <ToggleSwitch
                    checked={config?.usageStatisticsEnabled ?? false}
                    disabled={disableControls || pending.usage || loading}
                    onChange={(value) => toggleSetting('usage', 'usage-statistics-enabled', value, configApi.updateUsageStatistics, t('notification.usage_statistics_updated'))}
                  />
                </SettingItem>

                <SettingItem
                  icon={<IconScrollText size={20} />}
                  title="请求审计 (Audit Log)"
                  description="实时记录所有 API 请求的元数据及响应状态"
                >
                  <ToggleSwitch
                    checked={config?.requestLog ?? false}
                    disabled={disableControls || pending.requestLog || loading}
                    onChange={(value) => toggleSetting('requestLog', 'request-log', value, configApi.updateRequestLog, t('notification.request_log_updated'))}
                  />
                </SettingItem>

                <SettingItem
                  icon={<IconFileText size={20} />}
                  title="持久化日志"
                  description="将历史运行轨迹保存至本地，支持后期审计"
                >
                  <ToggleSwitch
                    checked={config?.loggingToFile ?? false}
                    disabled={disableControls || pending.loggingToFile || loading}
                    onChange={(value) => toggleSetting('loggingToFile', 'logging-to-file', value, configApi.updateLoggingToFile, t('notification.logging_to_file_updated'))}
                  />
                </SettingItem>

                <SettingItem
                  icon={<IconShieldCheck size={20} />}
                  title="WS 协议鉴权"
                  description="为 WebSocket 全双工通道强制开启令牌验证"
                >
                  <ToggleSwitch
                    checked={config?.wsAuth ?? false}
                    disabled={disableControls || pending.wsAuth || loading}
                    onChange={(value) => toggleSetting('wsAuth', 'ws-auth', value, configApi.updateWsAuth, t('notification.ws_auth_updated'))}
                  />
                </SettingItem>
              </div>
            </div>
          </div>

          {/* Box 2: 代理网络配置 - 全新设计 */}
          <div className="card card-glass">
            <div className="card-header">
              <div className="flex-row items-center gap-sm">
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.05) 100%)', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
                  <IconActivity size={18} style={{ color: 'var(--success-color)', filter: 'drop-shadow(0 2px 4px rgba(16, 185, 129, 0.3))' }} />
                </div>
                <span className="title" style={{ fontSize: '18px' }}>网络与代理</span>
              </div>
            </div>
            <div className="card-body" style={{ padding: '24px' }}>
              <div className="flex-column gap-xl">
                {/* 代理服务器配置 - 独立模块 */}
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: '16px', padding: '20px', border: '1px solid var(--border-light)' }}>
                  <div className="flex-row items-center gap-md" style={{ marginBottom: '16px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.05) 100%)', border: '1px solid rgba(59, 130, 246, 0.1)' }}>
                      <IconExternalLink size={20} style={{ color: 'var(--primary-color)' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 850, fontSize: '16px', color: 'var(--text-primary)', marginBottom: '2px' }}>上游代理服务器</div>
                      <div style={{ fontSize: '13px', opacity: 0.55 }}>配置所有出站 API 请求的转发网关</div>
                    </div>
                  </div>
                  <div className="flex-row gap-sm items-center">
                    <input
                      className="input-premium"
                      style={{ flex: 1 }}
                      placeholder="http://user:pass@127.0.0.1:7890"
                      value={proxyValue}
                      onChange={(e) => setProxyValue(e.target.value)}
                      disabled={disableControls || loading}
                    />
                    <Button variant="secondary" onClick={handleProxyClear} disabled={disableControls || pending.proxy || loading} size="sm">
                      清空
                    </Button>
                    <Button onClick={handleProxyUpdate} loading={pending.proxy} disabled={disableControls || loading} size="sm">
                      应用
                    </Button>
                  </div>
                </div>

                {/* 重试次数配置 - 独立模块 */}
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: '16px', padding: '20px', border: '1px solid var(--border-light)' }}>
                  <div className="flex-row items-center gap-md" style={{ marginBottom: '16px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(245, 158, 11, 0.05) 100%)', border: '1px solid rgba(245, 158, 11, 0.1)' }}>
                      <IconTimer size={20} style={{ color: 'var(--warning-color)' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 850, fontSize: '16px', color: 'var(--text-primary)', marginBottom: '2px' }}>故障自动重试</div>
                      <div style={{ fontSize: '13px', opacity: 0.55 }}>请求失败后的自愈重试上限（建议 2-3 次）</div>
                    </div>
                    <div className="flex-row gap-sm items-center">
                      <input
                        type="number"
                        className="input-premium"
                        style={{ width: '80px', textAlign: 'center' }}
                        value={retryValue}
                        onChange={(e) => setRetryValue(Number(e.target.value))}
                        disabled={disableControls || loading}
                      />
                      <Button onClick={handleRetryUpdate} loading={pending.retry} disabled={disableControls || loading} size="sm">
                        更新
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Box 3: 配额超额处理 */}
          <div className="card card-glass">
            <div className="card-header">
              <div className="flex-row items-center gap-sm">
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.05) 100%)', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                  <IconShield size={18} style={{ color: 'var(--error-color)', filter: 'drop-shadow(0 2px 4px rgba(239, 68, 68, 0.3))' }} />
                </div>
                <span className="title" style={{ fontSize: '18px' }}>弹性治理策略</span>
              </div>
            </div>
            <div className="card-body" style={{ padding: '8px' }}>
              <div className="flex-column">
                <SettingItem
                  icon={<IconLayoutGrid size={20} />}
                  title="项目自动切分"
                  description="一旦主项目额度枯竭，系统将无感切换至各备选渠道"
                >
                  <ToggleSwitch
                    checked={quotaSwitchProject}
                    disabled={disableControls || pending.switchProject || loading}
                    onChange={(value) =>
                      (async () => {
                        const previous = config?.quotaExceeded?.switchProject ?? false;
                        const nextQuota = { ...(config?.quotaExceeded || {}), switchProject: value };
                        setPendingFlag('switchProject', true);
                        updateConfigValue('quota-exceeded', nextQuota);
                        try {
                          await configApi.updateSwitchProject(value);
                          clearCache('quota-exceeded');
                          showNotification(t('notification.quota_switch_project_updated'), 'success');
                        } catch (err: unknown) {
                          updateConfigValue('quota-exceeded', { ...(config?.quotaExceeded || {}), switchProject: previous });
                          showNotification(`${t('notification.update_failed')}: ${(err as Error)?.message || ''}`, 'error');
                        } finally {
                          setPendingFlag('switchProject', false);
                        }
                      })()
                    }
                  />
                </SettingItem>

                <SettingItem
                  icon={<IconEye size={20} />}
                  title="切换预览模型"
                  description="当核心模型配额暂不可用时，降级使用轻量级免费模型"
                >
                  <ToggleSwitch
                    checked={quotaSwitchPreview}
                    disabled={disableControls || pending.switchPreview || loading}
                    onChange={(value) =>
                      (async () => {
                        const previous = config?.quotaExceeded?.switchPreviewModel ?? false;
                        const nextQuota = { ...(config?.quotaExceeded || {}), switchPreviewModel: value };
                        setPendingFlag('switchPreview', true);
                        updateConfigValue('quota-exceeded', nextQuota);
                        try {
                          await configApi.updateSwitchPreviewModel(value);
                          clearCache('quota-exceeded');
                          showNotification(t('notification.quota_switch_preview_updated'), 'success');
                        } catch (err: unknown) {
                          updateConfigValue('quota-exceeded', { ...(config?.quotaExceeded || {}), switchPreviewModel: previous });
                          showNotification(`${t('notification.update_failed')}: ${(err as Error)?.message || ''}`, 'error');
                        } finally {
                          setPendingFlag('switchPreview', false);
                        }
                      })()
                    }
                  />
                </SettingItem>
              </div>
            </div>
          </div>

          {/* Box 4: 系统摘要信息 */}
          <div className="card card-glass" style={{ background: 'var(--gradient-dark)', border: 'none' }}>
             <div className="card-body flex-column justify-between" style={{ height: '100%', padding: '40px' }}>
                <div className="feature-icon">
                  <IconCpu size={32} />
                </div>
                <div>
                  <h3 style={{ color: '#fff', fontSize: '24px', fontWeight: 900, marginBottom: '8px' }}>集群状态自愈已启用</h3>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', lineHeight: '1.6' }}>
                    当前网关运行在生产级隔离模式。所有配置变更将在 500ms 内同步至活跃连接池。
                    系统正在监控 12 个微服务节点的健康度。
                  </p>
                </div>
             </div>
          </div>

        </div>
      </div>
    </div>
  );
}
