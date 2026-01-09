import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useNotificationStore } from '@/stores';
import {
  modelPoolApi,
  Channel,
  Pool,
  PoolOverviewStats,
  RotationStrategy,
  ChannelProvider,
} from '@/services/api/modelPool';
import {
  IconPlus,
  IconRefreshCw,
  IconSearch,
  IconSettings,
  IconActivity,
  IconShieldCheck,
  IconPlug,
  IconArrowPath,
  IconChartBar,
  IconTrash2,
} from '@/components/ui/icons';
// 移除旧的 styles 引用

export function ModelPoolPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();

  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [stats, setStats] = useState<PoolOverviewStats | null>(null);

  // 筛选和搜索状态
  const [searchQuery, setSearchQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // 弹窗状态
  const [poolModalOpen, setPoolModalOpen] = useState(false);
  const [editingPool, setEditingPool] = useState<Pool | null>(null);
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [saving, setSaving] = useState(false);
  const [channelSaving, setChannelSaving] = useState(false);

  // 表单状态
  const [poolForm, setPoolForm] = useState({
    name: '',
    description: '',
    maxConcurrency: 10,
    rotationStrategy: 'round_robin' as RotationStrategy,
    selectedChannels: [] as string[],
    selectedModels: [] as { channelId: string; model: string }[],
    healthCheckEnabled: true,
    healthCheckInterval: '5m',
    healthCheckModel: 'gpt-3.5-turbo',
  });

  const [selectionMode, setSelectionMode] = useState<'channel' | 'model'>('channel');
  const [modelSearchQuery, setModelSearchQuery] = useState('');

  const [channelForm, setChannelForm] = useState({
    priority: 50,
    weight: 50,
    maxConcurrency: 5,
    enabled: true,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [channelsData, poolsData, statsData] = await Promise.all([
        modelPoolApi.getChannels(),
        modelPoolApi.getPools(),
        modelPoolApi.getOverviewStats(),
      ]);
      setChannels(channelsData);
      setPools(poolsData);
      setStats(statsData);
    } catch (err: unknown) {
      showNotification(
        `${t('notification.refresh_failed')}: ${(err as Error)?.message || ''}`,
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [showNotification, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 过滤逻辑
  const filteredChannels = channels.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.source.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesProvider = providerFilter === 'all' || c.provider === providerFilter;
    const matchesType = typeFilter === 'all' || c.type === typeFilter;
    return matchesSearch && matchesProvider && matchesType;
  });

  const handleCreatePool = () => {
    setEditingPool(null);
    setPoolForm({
      name: '',
      description: '',
      maxConcurrency: 10,
      rotationStrategy: 'round_robin',
      selectedChannels: [],
      selectedModels: [],
      healthCheckEnabled: true,
      healthCheckInterval: '5m',
      healthCheckModel: 'gpt-3.5-turbo',
    });
    setSelectionMode('channel');
    setModelSearchQuery('');
    setPoolModalOpen(true);
  };

  const handleEditPool = (pool: Pool) => {
    setEditingPool(pool);
    // 判断是否为模型选择模式
    const isModelMode = pool.models && pool.models.length > 0;

    setPoolForm({
      name: pool.name,
      description: pool.description || '',
      maxConcurrency: pool.maxConcurrency,
      rotationStrategy: pool.rotationStrategy,
      selectedChannels: [...pool.channels],
      selectedModels: pool.models ? [...pool.models] : [],
      healthCheckEnabled: pool.healthCheckEnabled,
      healthCheckInterval: pool.healthCheckInterval || '5m',
      healthCheckModel: pool.healthCheckModel || 'gpt-3.5-turbo',
    });
    setSelectionMode(isModelMode ? 'model' : 'channel');
    setModelSearchQuery('');
    setPoolModalOpen(true);
  };

  const handleSavePool = async () => {
    if (!poolForm.name.trim()) {
      showNotification(t('model_pool.error_name_required'), 'error');
      return;
    }

    const isModelMode = selectionMode === 'model';
    
    // 如果是模型模式，自动计算关联的 channels
    const finalChannels = isModelMode 
      ? Array.from(new Set(poolForm.selectedModels.map(m => m.channelId)))
      : poolForm.selectedChannels;

    // 如果是渠道模式，清空 models
    const finalModels = isModelMode ? poolForm.selectedModels : [];

    setSaving(true);
    try {
      if (editingPool) {
        await modelPoolApi.updatePool(editingPool.id, {
          name: poolForm.name,
          description: poolForm.description,
          maxConcurrency: poolForm.maxConcurrency,
          rotationStrategy: poolForm.rotationStrategy,
          channels: finalChannels,
          models: finalModels,
          healthCheckEnabled: poolForm.healthCheckEnabled,
          healthCheckInterval: poolForm.healthCheckInterval,
          healthCheckModel: poolForm.healthCheckModel,
        });
        showNotification(t('notification.pool_updated'), 'success');
      } else {
        await modelPoolApi.createPool({
          name: poolForm.name,
          description: poolForm.description,
          maxConcurrency: poolForm.maxConcurrency,
          rotationStrategy: poolForm.rotationStrategy,
          channels: finalChannels,
          models: finalModels,
          healthCheckEnabled: poolForm.healthCheckEnabled,
          healthCheckInterval: poolForm.healthCheckInterval,
          healthCheckModel: poolForm.healthCheckModel,
          enabled: true,
        });
        showNotification(t('notification.pool_created'), 'success');
      }
      setPoolModalOpen(false);
      loadData();
    } catch (err: unknown) {
      showNotification(`${t('notification.save_failed')}: ${(err as Error)?.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePool = async (id: string) => {
    if (!window.confirm(t('model_pool.confirm_delete_pool'))) return;
    try {
      await modelPoolApi.deletePool(id);
      showNotification(t('notification.pool_deleted'), 'success');
      loadData();
    } catch (err: unknown) {
      showNotification(`${t('notification.delete_failed')}: ${(err as Error)?.message}`, 'error');
    }
  };

  const handleToggleChannel = (channelId: string) => {
    setPoolForm((prev) => {
      const selected = prev.selectedChannels.includes(channelId)
        ? prev.selectedChannels.filter((id) => id !== channelId)
        : [...prev.selectedChannels, channelId];
      return { ...prev, selectedChannels: selected };
    });
  };

  const handleToggleModel = (channelId: string, model: string) => {
    setPoolForm((prev) => {
      const exists = prev.selectedModels.some(m => m.channelId === channelId && m.model === model);
      const newModels = exists
        ? prev.selectedModels.filter(m => !(m.channelId === channelId && m.model === model))
        : [...prev.selectedModels, { channelId, model }];
      return { ...prev, selectedModels: newModels };
    });
  };

  const handleEditChannel = (channel: Channel) => {
    setEditingChannel(channel);
    setChannelForm({
      priority: channel.priority,
      weight: channel.weight,
      maxConcurrency: channel.maxConcurrency,
      enabled: channel.enabled,
    });
    setChannelModalOpen(true);
  };

  const handleSaveChannel = async () => {
    if (!editingChannel) return;
    setChannelSaving(true);
    try {
      await modelPoolApi.updateChannel(editingChannel.id, {
        priority: channelForm.priority,
        weight: channelForm.weight,
        maxConcurrency: channelForm.maxConcurrency,
        enabled: channelForm.enabled,
      });
      showNotification(t('notification.channel_updated'), 'success');
      setChannelModalOpen(false);
      loadData();
    } catch (err: unknown) {
      showNotification(`${t('notification.save_failed')}: ${(err as Error)?.message}`, 'error');
    } finally {
      setChannelSaving(false);
    }
  };

  const handleCheckHealth = async (channelId: string, model: string) => {
    try {
      showNotification(t('model_pool.checking_health'), 'info');
      const result = await modelPoolApi.checkChannelHealth(channelId, model);
      if (result.status === 'healthy') {
        showNotification(t('model_pool.health_ok', { duration: result.durationMs }), 'success');
      } else {
        showNotification(t('model_pool.health_fail', { error: result.error }), 'error');
      }
      loadData();
    } catch (err: unknown) {
      showNotification(`${t('model_pool.health_error')}: ${(err as Error)?.message}`, 'error');
    }
  };

  // 辅助渲染函数
  const getProviderIcon = (provider: ChannelProvider) => {
    switch (provider) {
      case 'gemini':
        return <IconActivity size={16} />;
      case 'claude':
        return <IconShieldCheck size={16} />;
      case 'openai':
        return <IconPlug size={16} />;
      default:
        return <IconChartBar size={16} />;
    }
  };

  return (
    <div className="flex-column">
      <header className="hero-wrapper">
        <div className="hero-content flex-row justify-between items-center">
          <div className="flex-column gap-xs">
            <div className="badge badge-primary" style={{ marginBottom: '8px', width: 'fit-content' }}>
               Distributed Architecture
            </div>
            <h1 className="hero-title">{t('model_pool.page_title')}</h1>
            <p className="hero-subtitle">{t('model_pool.page_description') || '企业级大模型服务网格，支持跨供应商负载均衡、自动扩缩容与多级缓存。'}</p>
          </div>
          <Button onClick={handleCreatePool} className="btn-glass" style={{ height: '52px', padding: '0 28px' }}>
            <IconPlus size={20} /> <span style={{ marginLeft: '8px' }}>{t('model_pool.create_pool_btn')}</span>
          </Button>
        </div>
      </header>

      <div className="page-container">
        <div className="card card-glass">
          <div className="card-body" style={{ padding: '32px' }}>
            <div className="flex-column gap-xl">
        {/* 统计概览 */}
        <div className="grid cols-4" style={{ gap: '24px' }}>
          <div className="stat-card">
            <div className="stat-icon primary">
              <IconPlug size={24} />
            </div>
            <div className="stat-content">
              <span className="stat-label">{t('model_pool.stats_total_channels')}</span>
              <span className="stat-value">{stats?.totalChannels || 0}</span>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon success">
              <IconActivity size={24} />
            </div>
            <div className="stat-content">
              <span className="stat-label">{t('model_pool.stats_healthy')}</span>
              <span className="stat-value success">{stats?.healthyChannels || 0}</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon error">
              <IconShieldCheck size={24} />
            </div>
            <div className="stat-content">
              <span className="stat-label">{t('model_pool.stats_unhealthy')}</span>
              <span className="stat-value error">{stats?.unhealthyChannels || 0}</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon primary">
              <IconChartBar size={24} />
            </div>
            <div className="stat-content">
              <span className="stat-label">{t('model_pool.stats_success_rate')}</span>
              <span className="stat-value primary">{stats?.successRate24h || 100}%</span>
            </div>
          </div>
        </div>

        {/* 工具栏 */}
        <div className="toolbar">
          <div className="flex-row items-center gap-md flex-1">
            <div style={{ position: 'relative', flex: 1, maxWidth: '350px' }}>
              <Input
                className="input-premium"
                style={{ paddingLeft: '44px', width: '100%' }}
                placeholder={t('model_pool.search_placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <IconSearch size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
            </div>
            
            <div className="flex-row items-center gap-sm card-glass" style={{ padding: '0 16px', height: '44px', background: 'rgba(var(--bg-primary-rgb), 0.3)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
              <select
                className="input-premium"
                style={{ border: 'none', background: 'transparent', padding: '0 8px', width: '110px', height: '40px', fontWeight: 600, fontSize: '13px' }}
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="all">{t('model_pool.filter_type_all')}</option>
                <option value="api">{t('model_pool.type_api')}</option>
                <option value="oauth">{t('model_pool.type_oauth')}</option>
              </select>
            </div>

            <div className="flex-row items-center gap-sm card-glass" style={{ padding: '0 16px', height: '44px', background: 'rgba(var(--bg-primary-rgb), 0.3)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
              <select
                className="input-premium"
                style={{ border: 'none', background: 'transparent', padding: '0 8px', width: '120px', height: '40px', fontWeight: 600, fontSize: '13px' }}
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
              >
                <option value="all">{t('model_pool.filter_provider_all')}</option>
                <option value="gemini">Gemini</option>
                <option value="claude">Claude</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>
          </div>
          
          <Button variant="secondary" onClick={loadData} className="btn-glass" style={{ width: '44px', height: '44px', padding: 0 }}>
            <IconRefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>

        {/* 内容区域 */}
        {loading ? (
          <div className="flex-center" style={{ padding: '100px' }}>
            <LoadingSpinner />
          </div>
        ) : pools.length === 0 ? (
          <div className="card-glass" style={{ padding: '80px', borderRadius: '24px' }}>
            <EmptyState
              title={t('model_pool.no_pools_title')}
              description={t('model_pool.no_pools_desc')}
              action={<Button onClick={handleCreatePool} className="btn-glass">{t('model_pool.create_pool_btn')}</Button>}
            />
          </div>
        ) : (
          <div className="flex-column gap-xl">
            {pools.map((pool) => (
              <div key={pool.id} className="card-glass overflow-hidden" style={{ borderRadius: '24px', border: '1px solid var(--border-light)' }}>
                <div className="flex-row justify-between items-center" style={{ padding: '24px 32px', background: 'linear-gradient(to right, rgba(var(--bg-primary-rgb), 0.6), rgba(var(--bg-primary-rgb), 0.2))', borderBottom: '1px solid var(--border-light)' }}>
                  <div className="flex-row items-center gap-lg">
                    <div style={{ width: '12px', height: '24px', background: 'var(--primary-color)', borderRadius: '4px' }} />
                    <div className="flex-column">
                      <div className="flex-row items-center gap-md">
                        <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 900, letterSpacing: '-0.02em' }}>{pool.name}</h3>
                        <span className={`badge ${pool.enabled ? 'badge-success' : 'badge-secondary'}`} style={{ fontSize: '11px' }}>
                          {pool.enabled ? t('common.enabled') : t('common.disabled')}
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-tertiary)', fontWeight: 500 }}>{pool.description || '暂无描述信息'}</p>
                    </div>
                  </div>
                  
                  <div className="flex-row items-center gap-xl">
                    <div className="flex-row items-center gap-lg">
                      <div className="flex-column items-center">
                        <div className="flex-row items-center gap-xs" style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '15px' }}>
                          <IconArrowPath size={14} style={{ opacity: 0.6 }} />
                          {t(`model_pool.strategy_${pool.rotationStrategy}`)}
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase' }}>Strategy</span>
                      </div>
                      <div style={{ width: '1px', height: '28px', background: 'var(--border-light)' }} />
                      <div className="flex-column items-center">
                        <div className="flex-row items-center gap-xs" style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '15px' }}>
                          <IconActivity size={14} style={{ opacity: 0.6 }} />
                          {pool.maxConcurrency}
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase' }}>Concurrency</span>
                      </div>
                    </div>

                    <div className="flex-row gap-sm">
                      <Button variant="secondary" size="sm" onClick={() => handleEditPool(pool)} className="btn-glass" style={{ height: '38px', padding: '0 16px', fontSize: '13px' }}>
                        <IconSettings size={14} /> <span style={{ marginLeft: '4px' }}>{t('common.edit')}</span>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeletePool(pool.id)} className="text-error" style={{ width: '38px', height: '38px', padding: 0 }}>
                        <IconTrash2 size={16} />
                      </Button>
                    </div>
                  </div>
                </div>

                <div style={{ padding: '32px' }}>
                  <div className="grid cols-3" style={{ gap: '20px' }}>
                    {channels
                      .filter((c) => pool.channels.includes(c.id))
                      .map((channel) => (
                        <div
                          key={channel.id}
                          className={`card-glass flex-column card-hover ${!channel.enabled ? 'opacity-60' : ''}`}
                          style={{ padding: '20px', borderRadius: '18px', border: '1px solid var(--border-light)', position: 'relative' }}
                          onClick={() => handleCheckHealth(channel.id, pool.healthCheckModel || 'gpt-3.5-turbo')}
                        >
                          <div className="flex-row justify-between items-start mb-md">
                            <div className="flex-column gap-xs">
                              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 850 }}>{channel.name}</h4>
                              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{channel.sourceDisplay}</span>
                            </div>
                            <div className="flex-row items-center gap-sm">
                              <div 
                                style={{ 
                                  width: '10px', height: '10px', borderRadius: '50%', 
                                  background: channel.healthStatus === 'healthy' ? 'var(--success-color)' : channel.healthStatus === 'degraded' ? 'var(--warning-color)' : 'var(--error-color)',
                                  boxShadow: `0 0 10px ${channel.healthStatus === 'healthy' ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)'}`
                                }} 
                                title={t(`model_pool.health_${channel.healthStatus}`)}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                style={{ width: '28px', height: '28px', padding: 0 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditChannel(channel);
                                }}
                              >
                                <IconSettings size={14} />
                              </Button>
                            </div>
                          </div>

                          <div className="flex-row gap-xs mb-lg">
                            <span className="badge badge-primary-light" style={{ fontSize: '10px', padding: '2px 8px' }}>{t(`model_pool.type_${channel.type}`)}</span>
                            <span className="badge badge-secondary" style={{ fontSize: '10px', padding: '2px 8px' }}>{channel.provider}</span>
                          </div>

                          <div className="flex-row justify-between items-center pt-md" style={{ borderTop: '1px dashed var(--border-light)' }}>
                            <div className="flex-row gap-lg">
                              <div className="flex-column">
                                <span style={{ fontSize: '14px', fontWeight: 900, color: 'var(--success-color)' }}>{channel.stats.success}</span>
                                <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Pass</span>
                              </div>
                              <div className="flex-column">
                                <span style={{ fontSize: '14px', fontWeight: 900, color: 'var(--error-color)' }}>{channel.stats.failure}</span>
                                <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Fail</span>
                              </div>
                            </div>
                            <div className="flex-row gap-md">
                               <div className="flex-column items-end">
                                 <span style={{ fontSize: '13px', fontWeight: 800 }}>{channel.weight}</span>
                                 <span style={{ fontSize: '9px', color: 'var(--text-tertiary)' }}>W</span>
                               </div>
                               <div className="flex-column items-end">
                                 <span style={{ fontSize: '13px', fontWeight: 800 }}>{channel.priority}</span>
                                 <span style={{ fontSize: '9px', color: 'var(--text-tertiary)' }}>P</span>
                               </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 未分配渠道 */}
        <div className="flex-column gap-lg mt-xl">
          <div className="flex-row items-center gap-md">
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, rgba(var(--primary-color-rgb), 0.2) 0%, rgba(var(--primary-color-rgb), 0.05) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IconPlug size={18} style={{ color: 'var(--primary-color)' }} />
            </div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>{t('model_pool.unassigned_channels')}</h2>
          </div>
          
          <div className="grid cols-4" style={{ gap: '16px' }}>
            {filteredChannels
              .filter((c) => !pools.some((p) => p.channels.includes(c.id)))
              .map((channel) => (
                <div
                  key={channel.id}
                  className={`card-glass flex-column card-hover ${!channel.enabled ? 'opacity-60' : ''}`}
                  style={{ padding: '16px', borderRadius: '16px', background: 'rgba(var(--bg-primary-rgb), 0.3)' }}
                >
                  <div className="flex-row justify-between items-center mb-md">
                    <div className="flex-column">
                      <span style={{ fontSize: '14px', fontWeight: 800 }}>{channel.name}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{channel.sourceDisplay}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      style={{ width: '28px', height: '28px', padding: 0 }}
                      onClick={() => handleEditChannel(channel)}
                    >
                      <IconSettings size={14} />
                    </Button>
                  </div>
                  <div className="flex-row items-center gap-sm">
                    {getProviderIcon(channel.provider)}
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>{channel.provider}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
            </div>
          </div>
        </div>
      </div>

      {/* 池编辑弹窗 */}
      <Modal
        open={poolModalOpen}
        onClose={() => setPoolModalOpen(false)}
        title={editingPool ? t('model_pool.edit_pool_title') : t('model_pool.create_pool_title')}
        width={700}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPoolModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSavePool} loading={saving}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="flex-column gap-lg">
          <div className="grid cols-2" style={{ gap: '20px' }}>
            <div className="flex-column gap-xs">
              <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('model_pool.pool_name')}</label>
              <Input
                className="input-premium"
                value={poolForm.name}
                onChange={(e) => setPoolForm({ ...poolForm, name: e.target.value })}
                placeholder={t('model_pool.pool_name_placeholder')}
              />
            </div>
            <div className="flex-column gap-xs">
              <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('model_pool.rotation_strategy')}</label>
              <div className="card-glass" style={{ height: '44px', background: 'rgba(var(--bg-primary-rgb), 0.3)', borderRadius: '12px', border: '1px solid var(--border-light)', padding: '0 12px' }}>
                <select
                  style={{ border: 'none', background: 'transparent', width: '100%', height: '100%', outline: 'none', fontWeight: 600, color: 'var(--text-primary)' }}
                  value={poolForm.rotationStrategy}
                  onChange={(e) =>
                    setPoolForm({
                      ...poolForm,
                      rotationStrategy: e.target.value as RotationStrategy,
                    })
                  }
                >
                  <option value="round_robin">{t('model_pool.strategy_round_robin')}</option>
                  <option value="weighted">{t('model_pool.strategy_weighted')}</option>
                  <option value="priority">{t('model_pool.strategy_priority')}</option>
                  <option value="random">{t('model_pool.strategy_random')}</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid cols-2" style={{ gap: '20px' }}>
            <div className="flex-column gap-xs">
              <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('model_pool.max_concurrency')}</label>
              <Input
                className="input-premium"
                type="number"
                min={1}
                value={poolForm.maxConcurrency}
                onChange={(e) =>
                  setPoolForm({ ...poolForm, maxConcurrency: parseInt(e.target.value) || 1 })
                }
              />
            </div>
            <div className="flex-column gap-xs">
              <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('model_pool.health_check_interval')}</label>
              <div className="card-glass" style={{ height: '44px', background: 'rgba(var(--bg-primary-rgb), 0.3)', borderRadius: '12px', border: '1px solid var(--border-light)', padding: '0 12px' }}>
                <select
                  style={{ border: 'none', background: 'transparent', width: '100%', height: '100%', outline: 'none', fontWeight: 600, color: 'var(--text-primary)' }}
                  value={poolForm.healthCheckInterval}
                  onChange={(e) => setPoolForm({ ...poolForm, healthCheckInterval: e.target.value })}
                >
                  <option value="1m">1 min</option>
                  <option value="5m">5 mins</option>
                  <option value="15m">15 mins</option>
                  <option value="1h">1 hour</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex-column gap-md">
            <div className="flex-row justify-between items-center">
              <label style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('model_pool.select_channels')}</label>
              <div className="flex-row items-center gap-sm">
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 600 }}>{t('model_pool.selection_mode')}:</span>
                <div className="flex-row gap-xs card-glass" style={{ padding: '2px', borderRadius: '8px', background: 'var(--bg-tertiary)' }}>
                  <button
                    type="button"
                    className={`btn-ghost ${selectionMode === 'channel' ? 'active-selection' : ''}`}
                    style={{ 
                      fontSize: '11px', padding: '4px 12px', borderRadius: '6px', 
                      background: selectionMode === 'channel' ? 'var(--primary-color)' : 'transparent',
                      color: selectionMode === 'channel' ? '#fff' : 'var(--text-tertiary)'
                    }}
                    onClick={() => setSelectionMode('channel')}
                  >
                    {t('model_pool.selection_mode_channel')}
                  </button>
                  <button
                    type="button"
                    className={`btn-ghost ${selectionMode === 'model' ? 'active-selection' : ''}`}
                    style={{ 
                      fontSize: '11px', padding: '4px 12px', borderRadius: '6px', 
                      background: selectionMode === 'model' ? 'var(--primary-color)' : 'transparent',
                      color: selectionMode === 'model' ? '#fff' : 'var(--text-tertiary)'
                    }}
                    onClick={() => setSelectionMode('model')}
                  >
                    {t('model_pool.selection_mode_model')}
                  </button>
                </div>
              </div>
            </div>

            {selectionMode === 'model' && (
              <div style={{ position: 'relative' }}>
                <Input
                  className="input-premium"
                  style={{ paddingLeft: '40px' }}
                  placeholder={t('model_pool.search_placeholder')}
                  value={modelSearchQuery}
                  onChange={(e) => setModelSearchQuery(e.target.value)}
                />
                <IconSearch size={14} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
              </div>
            )}

            <div className="card-glass" style={{ maxHeight: '300px', overflowY: 'auto', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
              {selectionMode === 'channel' ? (
                channels.map((channel) => {
                  const isChecked = poolForm.selectedChannels.includes(channel.id);
                  return (
                    <div
                      key={channel.id}
                      className="flex-row items-center gap-md"
                      style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)', cursor: 'pointer', transition: 'background 0.2s' }}
                      onClick={() => handleToggleChannel(channel.id)}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        style={{ width: '18px', height: '18px', accentColor: 'var(--primary-color)' }}
                      />
                      <div className="flex-column">
                        <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>{channel.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                          {channel.provider} · {channel.type}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                channels
                  .flatMap(channel => 
                    (channel.models || []).map(model => ({
                      channelId: channel.id,
                      modelName: model,
                      channelName: channel.name,
                      provider: channel.provider
                    }))
                  )
                  .filter(item => 
                    item.modelName.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
                    item.channelName.toLowerCase().includes(modelSearchQuery.toLowerCase())
                  )
                  .map((item) => {
                    const isSelected = poolForm.selectedModels.some(
                      m => m.channelId === item.channelId && m.model === item.modelName
                    );
                    return (
                      <div
                        key={`${item.channelId}-${item.modelName}`}
                        className="flex-row items-center gap-md"
                        style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)', cursor: 'pointer' }}
                        onClick={() => handleToggleModel(item.channelId, item.modelName)}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          style={{ width: '18px', height: '18px', accentColor: 'var(--primary-color)' }}
                        />
                        <div className="flex-column">
                          <div style={{ fontSize: '14px', fontWeight: 850, color: 'var(--text-primary)' }}>{item.modelName}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                            {t('model_pool.channel_name')}: {item.channelName} ({item.provider})
                          </div>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          <div className="flex-column gap-xs">
            <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('model_pool.health_check_model')}</label>
            <Input
              className="input-premium"
              value={poolForm.healthCheckModel}
              onChange={(e) => setPoolForm({ ...poolForm, healthCheckModel: e.target.value })}
              placeholder="gpt-3.5-turbo"
            />
            <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>{t('model_pool.health_check_hint')}</p>
          </div>
        </div>
      </Modal>

      {/* 渠道配置弹窗 */}
      <Modal
        open={channelModalOpen}
        onClose={() => setChannelModalOpen(false)}
        title={editingChannel ? `${t('common.edit')}: ${editingChannel.name}` : ''}
        width={450}
        footer={
          <>
            <Button variant="secondary" onClick={() => setChannelModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSaveChannel} loading={channelSaving}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="flex-column gap-lg">
          <div className="flex-column gap-xs">
            <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('model_pool.priority')} (1-100)</label>
            <Input
              className="input-premium"
              type="number"
              min={1}
              max={100}
              value={channelForm.priority}
              onChange={(e) =>
                setChannelForm({ ...channelForm, priority: parseInt(e.target.value) || 1 })
              }
              hint="数值越小优先级越高 (仅在优先级策略下生效)"
            />
          </div>
          <div className="flex-column gap-xs">
            <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('model_pool.weight')} (1-100)</label>
            <Input
              className="input-premium"
              type="number"
              min={1}
              max={100}
              value={channelForm.weight}
              onChange={(e) =>
                setChannelForm({ ...channelForm, weight: parseInt(e.target.value) || 1 })
              }
              hint="权重值，越高分配几率越大 (仅在权重策略下生效)"
            />
          </div>
          <div className="flex-column gap-xs">
            <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('model_pool.max_concurrency')}</label>
            <Input
              className="input-premium"
              type="number"
              min={1}
              value={channelForm.maxConcurrency}
              onChange={(e) =>
                setChannelForm({ ...channelForm, maxConcurrency: parseInt(e.target.value) || 1 })
              }
            />
          </div>
          <div className="card-glass flex-row justify-between items-center" style={{ padding: '12px 16px', borderRadius: '12px', background: 'rgba(var(--bg-primary-rgb), 0.3)' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{t('common.enabled')}</span>
            <ToggleSwitch
              checked={channelForm.enabled}
              onChange={(val: boolean) => setChannelForm({ ...channelForm, enabled: val })}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
