import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { ModelInputList } from '@/components/ui/ModelInputList';
import { useConfigStore, useNotificationStore } from '@/stores';
import { ampcodeApi } from '@/services/api';
import { maskApiKey } from '@/utils/format';
import { 
    entriesToAmpcodeMappings, 
    buildAmpcodeFormState 
} from '@/utils/auth-config';
import type { AmpcodeConfig } from '@/types';
import type { AmpcodeFormState } from './types';

interface AmpcodeConfigModalProps {
  open: boolean;
  onClose: () => void;
  config: AmpcodeConfig | undefined;
}

export function AmpcodeConfigModal({ open, onClose, config }: AmpcodeConfigModalProps) {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);
  const clearCache = useConfigStore((state) => state.clearCache);

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mappingsDirty, setMappingsDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);
  
  const [form, setForm] = useState<AmpcodeFormState>(() => buildAmpcodeFormState(config));

  // Fetch configuration when modal opens
  useEffect(() => {
    if (open) {
      setLoading(true);
      setLoaded(false);
      setMappingsDirty(false);
      setError('');
      // Set initial state from props while fetching
      setForm(buildAmpcodeFormState(config));

      (async () => {
        try {
          const ampcode = await ampcodeApi.getAmpcode();
          setLoaded(true);
          updateConfigValue('ampcode', ampcode);
          clearCache('ampcode');
          // Form will update via the other useEffect dependency on config
        } catch (err: unknown) {
          const msg = (err as Error)?.message || t('notification.refresh_failed');
          setError(msg);
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [open]);

  // Sync form with config when it changes (e.g. after fetch)
  useEffect(() => {
    if (open && config) {
       // Only update if we haven't dirtied the form? 
       // Or always update? The original logic overwrote it.
       // But if user is typing, we shouldn't overwrite.
       // However, fetch happens fast. And usually config doesn't change otherwise.
       // Let's rely on the fetch updating the store.
       setForm(buildAmpcodeFormState(config));
    }
  }, [config, open]);

  const clearUpstreamApiKey = async () => {
    if (!window.confirm(t('common.confirm_delete'))) return;
    setSaving(true);
    try {
      await ampcodeApi.clearUpstreamApiKey();
      
      const next = { ...config, upstreamApiKey: '' };
      updateConfigValue('ampcode', next as AmpcodeConfig);
      clearCache('ampcode');
      
      showNotification(t('notification.ampcode_api_key_cleared'), 'success');
    } catch (err: unknown) {
      showNotification(`${t('notification.operation_failed')}: ${(err as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!loaded && mappingsDirty) {
      const confirmed = window.confirm(t('ai_providers.ampcode_mappings_overwrite_confirm'));
      if (!confirmed) return;
    }

    setSaving(true);
    setError('');
    try {
      const upstreamUrl = form.upstreamUrl.trim();
      const overrideKey = form.upstreamApiKey.trim();
      const modelMappings = entriesToAmpcodeMappings(form.mappingEntries);

      if (upstreamUrl) {
        await ampcodeApi.updateUpstreamUrl(upstreamUrl);
      } else {
        await ampcodeApi.clearUpstreamUrl();
      }

      await ampcodeApi.updateRestrictManagementToLocalhost(
        form.restrictManagementToLocalhost
      );
      await ampcodeApi.updateForceModelMappings(form.forceModelMappings);

      if (loaded || mappingsDirty) {
        if (modelMappings.length) {
          await ampcodeApi.saveModelMappings(modelMappings);
        } else {
          await ampcodeApi.clearModelMappings();
        }
      }

      if (overrideKey) {
        await ampcodeApi.updateUpstreamApiKey(overrideKey);
      }

      const previous = config ?? {};
      const next: AmpcodeConfig = {
        ...previous,
        upstreamUrl: upstreamUrl || undefined,
        restrictManagementToLocalhost: form.restrictManagementToLocalhost,
        forceModelMappings: form.forceModelMappings,
        upstreamApiKey: previous.upstreamApiKey 
      };

      if (overrideKey) {
        next.upstreamApiKey = overrideKey;
      }
      
      if (loaded || mappingsDirty) {
        if (modelMappings.length) {
          next.modelMappings = modelMappings;
        } else {
          delete (next as Partial<AmpcodeConfig>).modelMappings;
        }
      }

      updateConfigValue('ampcode', next);
      clearCache('ampcode');
      showNotification(t('notification.ampcode_updated'), 'success');
      onClose();
    } catch (err: unknown) {
      const message = (err as Error)?.message || '';
      setError(message);
      showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('ai_providers.ampcode_modal_title')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={loading || saving}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      {error && <div className="error-box">{error}</div>}
      <Input
        label={t('ai_providers.ampcode_upstream_url_label')}
        placeholder={t('ai_providers.ampcode_upstream_url_placeholder')}
        value={form.upstreamUrl}
        onChange={(e) => setForm((prev) => ({ ...prev, upstreamUrl: e.target.value }))}
        disabled={saving || loading}
        hint={t('ai_providers.ampcode_upstream_url_hint')}
      />
      <Input
        label={t('ai_providers.ampcode_upstream_api_key_label')}
        placeholder={t('ai_providers.ampcode_upstream_api_key_placeholder')}
        type="password"
        value={form.upstreamApiKey}
        onChange={(e) =>
          setForm((prev) => ({ ...prev, upstreamApiKey: e.target.value }))
        }
        disabled={saving || loading}
        hint={t('ai_providers.ampcode_upstream_api_key_hint')}
      />
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginTop: -8,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <div className="hint" style={{ margin: 0 }}>
          {t('ai_providers.ampcode_upstream_api_key_current', {
            key: config?.upstreamApiKey
              ? maskApiKey(config.upstreamApiKey)
              : t('common.not_set'),
          })}
        </div>
        <Button
          variant="danger"
          size="sm"
          onClick={clearUpstreamApiKey}
          disabled={saving || loading || !config?.upstreamApiKey}
        >
          {t('ai_providers.ampcode_clear_upstream_api_key')}
        </Button>
      </div>

      <div className="form-group">
        <ToggleSwitch
          label={t('ai_providers.ampcode_restrict_management_label')}
          checked={form.restrictManagementToLocalhost}
          onChange={(value) =>
            setForm((prev) => ({ ...prev, restrictManagementToLocalhost: value }))
          }
          disabled={saving || loading}
        />
        <div className="hint">{t('ai_providers.ampcode_restrict_management_hint')}</div>
      </div>

      <div className="form-group">
        <ToggleSwitch
          label={t('ai_providers.ampcode_force_model_mappings_label')}
          checked={form.forceModelMappings}
          onChange={(value) =>
            setForm((prev) => ({ ...prev, forceModelMappings: value }))
          }
          disabled={saving || loading}
        />
        <div className="hint">{t('ai_providers.ampcode_force_model_mappings_hint')}</div>
      </div>

      <div className="form-group">
        <label>{t('ai_providers.ampcode_model_mappings_label')}</label>
        <ModelInputList
          entries={form.mappingEntries}
          onChange={(entries) => {
            setMappingsDirty(true);
            setForm((prev) => ({ ...prev, mappingEntries: entries }));
          }}
          addLabel={t('ai_providers.ampcode_model_mappings_add_btn')}
          namePlaceholder={t('ai_providers.ampcode_model_mappings_from_placeholder')}
          aliasPlaceholder={t('ai_providers.ampcode_model_mappings_to_placeholder')}
          disabled={saving || loading}
        />
        <div className="hint">{t('ai_providers.ampcode_model_mappings_hint')}</div>
      </div>
    </Modal>
  );
}
