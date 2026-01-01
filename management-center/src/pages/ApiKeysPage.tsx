import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import { apiKeysApi } from '@/services/api';
import { maskApiKey } from '@/utils/format';
import { IconKey, IconPlus, IconRefreshCw, IconEdit, IconTrash2 } from '@/components/ui/icons';

export function ApiKeysPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);

  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);
  const clearCache = useConfigStore((state) => state.clearCache);

  const [apiKeys, setApiKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);

  const disableControls = useMemo(() => connectionStatus !== 'connected', [connectionStatus]);

  const loadApiKeys = useCallback(
    async (force = false) => {
      setLoading(true);
      setError('');
      try {
        const result = (await fetchConfig('api-keys', force)) as string[] | undefined;
        const list = Array.isArray(result) ? result : [];
        setApiKeys(list);
      } catch (err: unknown) {
        setError((err as Error)?.message || t('notification.refresh_failed'));
      } finally {
        setLoading(false);
      }
    },
    [fetchConfig, t]
  );

  useEffect(() => { loadApiKeys(); }, [loadApiKeys]);

  useEffect(() => {
    if (Array.isArray(config?.apiKeys)) {
      setApiKeys(config.apiKeys);
    }
  }, [config?.apiKeys]);

  const openAddModal = () => {
    setEditingIndex(null);
    setInputValue('');
    setModalOpen(true);
  };

  const openEditModal = (index: number) => {
    setEditingIndex(index);
    setInputValue(apiKeys[index] ?? '');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setInputValue('');
    setEditingIndex(null);
  };

  const handleSave = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      showNotification(`${t('notification.please_enter')} ${t('notification.api_key')}`, 'error');
      return;
    }

    const isEdit = editingIndex !== null;
    const nextKeys = isEdit
      ? apiKeys.map((key, idx) => (idx === editingIndex ? trimmed : key))
      : [...apiKeys, trimmed];

    setSaving(true);
    try {
      if (isEdit && editingIndex !== null) {
        await apiKeysApi.update(editingIndex, trimmed);
        showNotification(t('notification.api_key_updated'), 'success');
      } else {
        await apiKeysApi.replace(nextKeys);
        showNotification(t('notification.api_key_added'), 'success');
      }

      setApiKeys(nextKeys);
      updateConfigValue('api-keys', nextKeys);
      clearCache('api-keys');
      closeModal();
    } catch (err: unknown) {
      showNotification(`${t('notification.update_failed')}: ${(err as Error)?.message || ''}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (index: number) => {
    if (!window.confirm(t('api_keys.delete_confirm'))) return;
    setDeletingIndex(index);
    try {
      await apiKeysApi.delete(index);
      const nextKeys = apiKeys.filter((_, idx) => idx !== index);
      setApiKeys(nextKeys);
      updateConfigValue('api-keys', nextKeys);
      clearCache('api-keys');
      showNotification(t('notification.api_key_deleted'), 'success');
    } catch (err: unknown) {
      showNotification(`${t('notification.delete_failed')}: ${(err as Error)?.message || ''}`, 'error');
    } finally {
      setDeletingIndex(null);
    }
  };

  if (loading) return <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}><LoadingSpinner /></div>;

  return (
    <div className="flex-column">
      {/* Hero Header */}
      <section className="hero-wrapper">
        <div className="hero-content">
          <div className="badge badge-success" style={{ marginBottom: '16px' }}>
            Security Layer
          </div>
          <h1 className="hero-title">API 访问密钥管理</h1>
          <p className="hero-subtitle">
            配置用于代理鉴权的 API 密钥。只有持有有效密钥的客户端才能通过网关。支持多级密钥轮转与独立配额审计。
          </p>
          <div className="flex-row gap-md" style={{ marginTop: '32px' }}>
            <Button size="sm" onClick={openAddModal} disabled={disableControls}>
              <IconPlus size={14} /> 生成新密钥
            </Button>
            <Button variant="secondary" size="sm" onClick={() => loadApiKeys(true)} disabled={loading}>
              <IconRefreshCw size={14} /> 同步状态
            </Button>
          </div>
        </div>
      </section>

      {/* Content Area */}
      <div style={{ padding: '0 40px 80px', marginTop: '-40px' }}>
        <div className="card card-glass overflow-hidden">
          <div className="card-header">
            <div className="flex-row items-center gap-sm">
               <div className="icon-wrapper" style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary-color)' }}>
                  <IconKey size={18} />
               </div>
               <span className="title" style={{ fontSize: '18px' }}>存量密钥池</span>
            </div>
            <div className="badge badge-success">{apiKeys.length} ACTIVE</div>
          </div>

          <div className="card-body">
            {error && <div className="badge badge-error" style={{ width: '100%', marginBottom: '24px' }}>{error}</div>}

            {apiKeys.length === 0 ? (
              <div style={{ padding: '80px 0' }}>
                <EmptyState
                  title={t('api_keys.empty_title')}
                  description={t('api_keys.empty_desc')}
                  action={
                    <Button onClick={openAddModal} disabled={disableControls}>
                      {t('api_keys.add_button')}
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="flex-column gap-md">
                {apiKeys.map((key, index) => (
                  <div key={index} className="card-glass card-hover" style={{ padding: '16px 24px', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
                    <div className="flex-row items-center justify-between">
                      <div className="flex-row items-center gap-lg">
                        <div style={{ 
                          width: '32px', height: '32px', borderRadius: '8px', 
                          background: 'var(--bg-tertiary)', display: 'grid', placeItems: 'center',
                          fontSize: '11px', fontWeight: 900, color: 'var(--text-tertiary)'
                        }}>
                          #{index + 1}
                        </div>
                        <div className="flex-column">
                          <span className="text-primary" style={{ fontWeight: 700, fontSize: '15px', fontFamily: 'var(--font-mono)' }}>
                            {maskApiKey(String(key || ''))}
                          </span>
                          <span className="text-tertiary" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>
                            Proxy Authentication Key
                          </span>
                        </div>
                      </div>
                      <div className="flex-row gap-sm">
                        <Button variant="ghost" size="sm" onClick={() => openEditModal(index)} disabled={disableControls} style={{ padding: '8px' }}>
                          <IconEdit size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(index)}
                          disabled={disableControls || deletingIndex === index}
                          loading={deletingIndex === index}
                          style={{ padding: '8px' }}
                        >
                          <IconTrash2 size={16} style={{ color: 'var(--error-color)' }} />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={
          <div className="flex-row items-center gap-md">
            <div className="icon-wrapper" style={{ background: 'var(--gradient-primary)', color: '#fff', borderRadius: '12px', width: '40px', height: '40px' }}>
              <IconKey size={20} />
            </div>
            <div className="flex-column">
              <span className="title" style={{ fontSize: '18px' }}>{editingIndex !== null ? "更正密钥配置" : "接入生产密钥"}</span>
              <span className="badge badge-success" style={{ fontSize: '10px', marginTop: '2px' }}>High Entropy Secure</span>
            </div>
          </div>
        }
      >
        <div className="flex-column gap-xl" style={{ padding: '8px' }}>
          <div className="flex-column gap-sm">
            <label style={{ fontWeight: 700, fontSize: '14px', marginLeft: '4px' }}>密钥原文 (Secret Value)</label>
            <input
              className="input-premium"
              placeholder="例如: sk-xxxxxxxx"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={saving}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <p className="text-tertiary" style={{ fontSize: '11px', marginLeft: '4px' }}>
              请确保密钥具有足够的熵值。系统仅进行单向哈希比对。
            </p>
          </div>

          <div className="flex-row justify-end gap-md" style={{ marginTop: '24px' }}>
            <Button variant="ghost" onClick={closeModal} disabled={saving}>放弃</Button>
            <Button onClick={handleSave} loading={saving} style={{ minWidth: '120px' }}>
              {editingIndex !== null ? "立即保存" : "创建密钥"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
