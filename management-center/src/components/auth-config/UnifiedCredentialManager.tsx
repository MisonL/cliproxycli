import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { configApi } from '@/services/api/config';
import { UnifiedProvider, SchedulingConfig } from '@/types/unified';
import { CredentialEditModal } from './CredentialEditModal';
import { IconTrash2, IconEdit, IconPlus, IconRefreshCw } from '@/components/ui/icons';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';

export const UnifiedCredentialManager: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [scheduling, setScheduling] = useState<SchedulingConfig>({ strategy: 'priority', retry: 1, fallback: true });
  const [providers, setProviders] = useState<UnifiedProvider[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentProvider, setCurrentProvider] = useState<UnifiedProvider | null>(null);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const cfg = await configApi.getConfig();
      if (cfg.scheduling) setScheduling(cfg.scheduling);
      if (cfg.providers) setProviders(cfg.providers);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadConfig(); }, []);

  const handleStrategyChange = async (strategy: string) => {
    const newConfig = { ...scheduling, strategy: strategy as SchedulingConfig['strategy'] };
    setScheduling(newConfig);
    try {
      await configApi.updateScheduling(newConfig);
    } catch(err) {
      console.error(err);
    }
  };

  const handleSaveProvider = async (provider: UnifiedProvider) => {
    const newProviders = [...providers];
    const index = newProviders.findIndex(p => p.id === provider.id);
    if (index >= 0) {
      newProviders[index] = provider;
    } else {
      newProviders.push(provider);
    }
    setProviders(newProviders);
    await configApi.updateUnifiedProviders(newProviders);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('credentials.delete_confirm'))) return;
    const newProviders = providers.filter(p => p.id !== id);
    setProviders(newProviders);
    await configApi.updateUnifiedProviders(newProviders);
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    const newProviders = providers.map(p => p.id === id ? { ...p, enabled } : p);
    setProviders(newProviders);
    await configApi.updateUnifiedProviders(newProviders);
  };

  const openAdd = () => {
    setCurrentProvider(null);
    setIsModalOpen(true);
  };

  const openEdit = (p: UnifiedProvider) => {
    setCurrentProvider(p);
    setIsModalOpen(true);
  };

  const strategies = useMemo(() => [
    { value: 'priority', label: t('credentials.strategy_priority'), icon: '⚡', desc: t('credentials.strategy_priority_desc') },
    { value: 'load-balance', label: t('credentials.strategy_lb'), icon: '⚖️', desc: t('credentials.strategy_lb_desc') },
    { value: 'round-robin', label: t('credentials.strategy_rr'), icon: '🔄', desc: t('credentials.strategy_rr_desc') },
    { value: 'sticky', label: t('credentials.strategy_sticky'), icon: '🔒', desc: t('credentials.strategy_sticky_desc') }
  ], [t]);

  if (loading) return <div style={{ display: 'grid', placeItems: 'center', height: '300px' }}><LoadingSpinner /></div>;

  return (
    <div className="flex-column">
      {/* 调度策略区域 */}
      <div className="card-body" style={{ padding: '32px' }}>
        <div className="flex-column gap-xl">
          <div className="flex-row items-center justify-between">
            <div className="flex-column gap-xs">
              <h2 className="title" style={{ fontSize: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, rgba(var(--primary-color-rgb), 0.2) 0%, rgba(var(--primary-color-rgb), 0.05) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconRefreshCw size={18} style={{ color: 'var(--primary-color)' }} />
                </div>
                {t('credentials.scheduling_title')}
              </h2>
              <p className="text-tertiary" style={{ fontSize: '14px', fontWeight: 500 }}>{t('credentials.scheduling_desc')}</p>
            </div>
          </div>

          <div className="grid cols-4" style={{ gap: '16px' }}>
            {strategies.map((s) => (
              <div
                key={s.value}
                onClick={() => handleStrategyChange(s.value)}
                className={`card-glass card-hover flex-column gap-sm ${scheduling.strategy === s.value ? 'active-selection' : ''}`}
                style={{ 
                  padding: '20px', 
                  borderRadius: '20px',
                  cursor: 'pointer',
                  border: scheduling.strategy === s.value ? '2px solid var(--primary-color)' : '1px solid var(--border-light)',
                  background: scheduling.strategy === s.value ? 'linear-gradient(135deg, rgba(var(--primary-color-rgb), 0.08) 0%, rgba(var(--primary-color-rgb), 0.02) 100%)' : 'transparent',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
              >
                <div className="flex-row items-center justify-between">
                  <span style={{ fontSize: '24px' }}>{s.icon}</span>
                  {scheduling.strategy === s.value && (
                    <div className="badge badge-primary animate-in fade-in zoom-in" style={{ fontSize: '10px', padding: '2px 8px' }}>Active</div>
                  )}
                </div>
                <div className="flex-column gap-xs">
                  <span style={{ fontSize: '15px', fontWeight: 800, color: scheduling.strategy === s.value ? 'var(--primary-color)' : 'var(--text-primary)' }}>{s.label}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: 1.4, fontWeight: 500 }}>{s.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ height: '1px', background: 'linear-gradient(to right, transparent, var(--border-light), transparent)', margin: '0 32px' }} />

      {/* 凭证列表区域 */}
      <div className="card-body" style={{ padding: '32px' }}>
        <div className="flex-column gap-xl">
          <div className="flex-row items-center justify-between">
            <div className="flex-column gap-xs">
              <h2 className="title" style={{ fontSize: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, rgba(var(--success-color-rgb), 0.2) 0%, rgba(var(--success-color-rgb), 0.05) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconPlus size={18} style={{ color: 'var(--success-color)' }} />
                </div>
                {t('credentials.pool_title')}
              </h2>
              <p className="text-tertiary" style={{ fontSize: '14px', fontWeight: 500 }}>{t('credentials.pool_desc')}</p>
            </div>
            <Button variant="primary" onClick={openAdd} style={{ borderRadius: '12px', padding: '0 20px', height: '44px', boxShadow: '0 4px 12px rgba(var(--primary-color-rgb), 0.2)' }}>
              <div className="flex-row items-center gap-sm">
                <IconPlus size={18} />
                <span style={{ fontWeight: 700 }}>{t('credentials.add_provider')}</span>
              </div>
            </Button>
          </div>

          <div className="flex-column gap-md">
            {providers.map((p) => (
              <div 
                key={p.id} 
                className="card-glass flex-row items-center justify-between card-hover" 
                style={{ 
                  padding: '20px 24px', 
                  borderRadius: '20px',
                  background: 'rgba(var(--bg-primary-rgb), 0.3)',
                  border: '1px solid var(--border-light)',
                  transition: 'transform 0.2s ease'
                }}
              >
                <div className="flex-row items-center gap-lg">
                  <div style={{ 
                    width: '48px', height: '48px', borderRadius: '14px', 
                    background: 'var(--bg-tertiary)', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '20px',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)'
                  }}>
                    {p.type === 'openai' ? '🤖' : p.type === 'gemini' ? '♊' : '✨'}
                  </div>
                  <div className="flex-column gap-xs">
                    <div className="flex-row items-center gap-sm">
                      <span style={{ fontSize: '16px', fontWeight: 850, color: 'var(--text-primary)' }}>{p.id}</span>
                      <span className="badge badge-secondary" style={{ textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.05em' }}>{p.type}</span>
                    </div>
                    <div className="flex-row items-center gap-md">
                      <span style={{ fontSize: '13px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{p.credentials?.base_url || p.credentials?.url || 'Default API Base'}</span>
                      <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--border-color)' }} />
                      <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Weight: <b style={{ color: 'var(--text-primary)' }}>{p.weight || 1}</b> / Priority: <b style={{ color: 'var(--text-primary)' }}>{p.priority || 0}</b></span>
                    </div>
                  </div>
                </div>

                <div className="flex-row items-center gap-md">
                  <div className="flex-row items-center gap-sm px-md py-xs rounded-full" style={{ background: 'rgba(var(--bg-primary-rgb), 0.4)', borderRadius: '100px', padding: '6px 16px', border: '1px solid var(--border-light)' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.enabled ? 'var(--success-color)' : 'var(--text-tertiary)', boxShadow: p.enabled ? '0 0 8px var(--success-color)' : 'none' }} />
                    <span style={{ fontSize: '12px', fontWeight: 800, color: p.enabled ? 'var(--success-color)' : 'var(--text-tertiary)' }}>{p.enabled ? 'ENABLED' : 'DISABLED'}</span>
                    <div style={{ width: '1px', height: '14px', background: 'var(--border-light)', margin: '0 4px' }} />
                    <ToggleSwitch 
                      checked={p.enabled} 
                      onChange={(checked) => handleToggle(p.id, checked)}
                    />
                  </div>
                  
                  <div className="flex-row items-center gap-sm">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)} style={{ width: '36px', height: '36px', padding: 0, borderRadius: '10px' }}>
                      <IconEdit size={18} style={{ color: 'var(--primary-color)' }} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)} style={{ width: '36px', height: '36px', padding: 0, borderRadius: '10px' }}>
                      <IconTrash2 size={18} style={{ color: 'var(--error-color)' }} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <CredentialEditModal 
        key={isModalOpen ? (currentProvider?.id || 'new') : 'closed'}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveProvider}
        initialData={currentProvider}
      />
    </div>
  );
};