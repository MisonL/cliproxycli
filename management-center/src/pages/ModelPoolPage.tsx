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
import styles from './ModelPoolPage.module.scss';

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
    <div className={styles.container}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('model_pool.page_title')}</h1>
        <p className={styles.pageDescription}>{t('model_pool.page_description')}</p>
      </header>

      {/* 统计概览 */}
      <section className={styles.statsBar}>
        <div className={`${styles.statCard} ${styles.info}`}>
          <span className={styles.statLabel}>{t('model_pool.stats_total_channels')}</span>
          <span className={styles.statValue}>{stats?.totalChannels || 0}</span>
        </div>
        <div className={`${styles.statCard} ${styles.healthy}`}>
          <span className={styles.statLabel}>{t('model_pool.stats_healthy')}</span>
          <span className={styles.statValue}>{stats?.healthyChannels || 0}</span>
        </div>
        <div className={`${styles.statCard} ${styles.danger}`}>
          <span className={styles.statLabel}>{t('model_pool.stats_unhealthy')}</span>
          <span className={styles.statValue}>{stats?.unhealthyChannels || 0}</span>
        </div>
        <div className={`${styles.statCard} ${styles.info}`}>
          <span className={styles.statLabel}>{t('model_pool.stats_success_rate')}</span>
          <span className={styles.statValue}>{stats?.successRate24h || 100}%</span>
        </div>
      </section>

      {/* 工具栏 */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Input
            className={styles.searchInput}
            placeholder={t('model_pool.search_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            rightElement={<IconSearch size={16} />}
          />
          <select
            className={styles.filterSelect}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">{t('model_pool.filter_type_all')}</option>
            <option value="api">{t('model_pool.type_api')}</option>
            <option value="oauth">{t('model_pool.type_oauth')}</option>
          </select>
          <select
            className={styles.filterSelect}
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
          >
            <option value="all">{t('model_pool.filter_provider_all')}</option>
            <option value="gemini">Gemini</option>
            <option value="claude">Claude</option>
            <option value="openai">OpenAI</option>
          </select>
        </div>
        <div className={styles.toolbarActions}>
          <Button variant="secondary" onClick={loadData}>
            <IconRefreshCw size={16} />
          </Button>
          <Button onClick={handleCreatePool}>
            <IconPlus size={16} /> {t('model_pool.create_pool_btn')}
          </Button>
        </div>
      </div>

      {/* 内容区域 */}
      {loading ? (
        <div className={styles.loadingContainer}>
          <LoadingSpinner />
        </div>
      ) : pools.length === 0 ? (
        <EmptyState
          title={t('model_pool.no_pools_title')}
          description={t('model_pool.no_pools_desc')}
          action={<Button onClick={handleCreatePool}>{t('model_pool.create_pool_btn')}</Button>}
        />
      ) : (
        <div className={styles.poolSection}>
          {pools.map((pool) => (
            <div key={pool.id} className={styles.poolCard}>
              <div className={styles.poolHeader}>
                <div className={styles.poolTitle}>
                  <h3 className={styles.poolName}>{pool.name}</h3>
                  <span
                    className={`${styles.poolBadge} ${pool.enabled ? styles.active : styles.disabled}`}
                  >
                    {pool.enabled ? t('common.enabled') : t('common.disabled')}
                  </span>
                </div>
                <div className={styles.poolMeta}>
                  <div className={styles.poolMetaItem}>
                    <IconArrowPath size={14} />
                    <span>{t(`model_pool.strategy_${pool.rotationStrategy}`)}</span>
                  </div>
                  <div className={styles.poolMetaItem}>
                    <IconActivity size={14} />
                    <span>
                      {t('model_pool.concurrency')}: {pool.maxConcurrency}
                    </span>
                  </div>
                  <div className={styles.poolActions}>
                    <Button variant="secondary" size="sm" onClick={() => handleEditPool(pool)}>
                      <IconSettings size={14} /> {t('common.edit')}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => handleDeletePool(pool.id)}>
                      <IconTrash2 size={14} />
                    </Button>
                  </div>
                </div>
              </div>
              <div className={styles.poolBody}>
                <div className={styles.channelGrid}>
                  {channels
                    .filter((c) => pool.channels.includes(c.id))
                    .map((channel) => (
                      <div
                        key={channel.id}
                        className={`${styles.channelCard} ${!channel.enabled ? styles.disabled : ''}`}
                        onClick={() =>
                          handleCheckHealth(channel.id, pool.healthCheckModel || 'gpt-3.5-turbo')
                        }
                      >
                        <div className={styles.channelHeader}>
                          <div className={styles.channelInfo}>
                            <h4 className={styles.channelName}>{channel.name}</h4>
                            <span className={styles.channelSource}>{channel.sourceDisplay}</span>
                          </div>
                          <div
                            className={`${styles.channelStatus} ${styles[channel.healthStatus]}`}
                            title={t(`model_pool.health_${channel.healthStatus}`)}
                          />
                          <button
                            className={styles.channelEditBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditChannel(channel);
                            }}
                            title={t('common.edit')}
                          >
                            <IconSettings size={14} />
                          </button>
                        </div>
                        <div className={styles.channelMeta}>
                          <span className={`${styles.channelBadge} ${styles.type}`}>
                            {t(`model_pool.type_${channel.type}`)}
                          </span>
                          <span className={`${styles.channelBadge} ${styles.provider}`}>
                            {channel.provider}
                          </span>
                        </div>
                        <div className={styles.channelStats}>
                          <span className={styles.statSuccess}>
                            {t('stats.success')}: {channel.stats.success}
                          </span>
                          <span className={styles.statFailure}>
                            {t('stats.failure')}: {channel.stats.failure}
                          </span>
                        </div>
                        <div className={styles.channelConfig}>
                          <div className={styles.configItem}>
                            <span>
                              {t('model_pool.weight')}: {channel.weight}
                            </span>
                          </div>
                          <div className={styles.configItem}>
                            <span>
                              {t('model_pool.priority')}: {channel.priority}
                            </span>
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
      <section className={styles.unassignedSection}>
        <h2 className={styles.sectionTitle}>
          <IconPlug size={20} /> {t('model_pool.unassigned_channels')}
        </h2>
        <div className={styles.channelGrid}>
          {filteredChannels
            .filter((c) => !pools.some((p) => p.channels.includes(c.id)))
            .map((channel) => (
              <div
                key={channel.id}
                className={`${styles.channelCard} ${!channel.enabled ? styles.disabled : ''}`}
                title={t('model_pool.click_to_view_details')}
              >
                <div className={styles.channelHeader}>
                  <div className={styles.channelInfo}>
                    <h4 className={styles.channelName}>{channel.name}</h4>
                    <span className={styles.channelSource}>{channel.sourceDisplay}</span>
                  </div>
                  <div
                    className={`${styles.channelStatus} ${styles[channel.healthStatus]}`}
                    title={t(`model_pool.health_${channel.healthStatus}`)}
                  />
                  <button
                    className={styles.channelEditBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditChannel(channel);
                    }}
                    title={t('common.edit')}
                  >
                    <IconSettings size={14} />
                  </button>
                </div>
                <div className={styles.channelMeta}>
                  <div className={styles.channelBadge}>
                    {getProviderIcon(channel.provider)} {channel.provider}
                  </div>
                </div>
              </div>
            ))}
        </div>
      </section>

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
        <div className={styles.formGrid}>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>{t('model_pool.pool_name')}</label>
              <Input
                value={poolForm.name}
                onChange={(e) => setPoolForm({ ...poolForm, name: e.target.value })}
                placeholder={t('model_pool.pool_name_placeholder')}
              />
            </div>
            <div className={styles.formGroup}>
              <label>{t('model_pool.rotation_strategy')}</label>
              <select
                className={styles.filterSelect}
                style={{ width: '100%' }}
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

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>{t('model_pool.max_concurrency')}</label>
              <Input
                type="number"
                min={1}
                value={poolForm.maxConcurrency}
                onChange={(e) =>
                  setPoolForm({ ...poolForm, maxConcurrency: parseInt(e.target.value) || 1 })
                }
              />
            </div>
            <div className={styles.formGroup}>
              <label>{t('model_pool.health_check_interval')}</label>
              <select
                className={styles.filterSelect}
                style={{ width: '100%' }}
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

          <div className={styles.formGroup}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ marginBottom: 0 }}>{t('model_pool.select_channels')}</label>
              <div className={styles.selectionModeToggle}>
                <span className={styles.toggleLabel}>{t('model_pool.selection_mode')}:</span>
                <div className={styles.toggleButtons}>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${selectionMode === 'channel' ? styles.active : ''}`}
                    onClick={() => setSelectionMode('channel')}
                  >
                    {t('model_pool.selection_mode_channel')}
                  </button>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${selectionMode === 'model' ? styles.active : ''}`}
                    onClick={() => setSelectionMode('model')}
                  >
                    {t('model_pool.selection_mode_model')}
                  </button>
                </div>
              </div>
            </div>

            {selectionMode === 'model' && (
              <div style={{ marginBottom: '10px' }}>
                <Input
                  placeholder={t('model_pool.search_placeholder')}
                  value={modelSearchQuery}
                  onChange={(e) => setModelSearchQuery(e.target.value)}
                />
              </div>
            )}

            <div className={styles.channelSelectList}>
              {selectionMode === 'channel' ? (
                // Channel Mode List
                channels.map((channel) => (
                  <div
                    key={channel.id}
                    className={styles.channelSelectItem}
                    onClick={() => handleToggleChannel(channel.id)}
                  >
                    <input
                      type="checkbox"
                      checked={poolForm.selectedChannels.includes(channel.id)}
                      onChange={() => {}}
                    />
                    <div className={styles.channelSelectInfo}>
                      <div className={styles.channelSelectName}>{channel.name}</div>
                      <div className={styles.channelSelectMeta}>
                        {channel.provider} | {channel.type}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                // Model Mode List
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
                        className={styles.channelSelectItem}
                        onClick={() => handleToggleModel(item.channelId, item.modelName)}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                        />
                        <div className={styles.channelSelectInfo}>
                          <div className={styles.channelSelectName} style={{ fontWeight: 600 }}>
                            {item.modelName}
                          </div>
                          <div className={styles.channelSelectMeta}>
                            {t('model_pool.channel_name')}: {item.channelName} ({item.provider})
                          </div>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>{t('model_pool.health_check_model')}</label>
            <Input
              value={poolForm.healthCheckModel}
              onChange={(e) => setPoolForm({ ...poolForm, healthCheckModel: e.target.value })}
              placeholder="gpt-3.5-turbo"
            />
            <p className={styles.formHint}>{t('model_pool.health_check_hint')}</p>
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
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label>{t('model_pool.priority')} (1-100)</label>
            <Input
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
          <div className={styles.formGroup}>
            <label>{t('model_pool.weight')} (1-100)</label>
            <Input
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
          <div className={styles.formGroup}>
            <label>{t('model_pool.max_concurrency')}</label>
            <Input
              type="number"
              min={1}
              value={channelForm.maxConcurrency}
              onChange={(e) =>
                setChannelForm({ ...channelForm, maxConcurrency: parseInt(e.target.value) || 1 })
              }
            />
          </div>
          <div className={styles.formGroup}>
            <ToggleSwitch
              label={t('common.enabled')}
              checked={channelForm.enabled}
              onChange={(val: boolean) => setChannelForm({ ...channelForm, enabled: val })}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
