import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { HeaderInputList } from '@/components/ui/HeaderInputList';
import { ModelInputList } from '@/components/ui/ModelInputList';
import { useConfigStore, useNotificationStore } from '@/stores';
import { providersApi } from '@/services/api';
import { headersToEntries, buildHeaderObject } from '@/utils/headers';
import { modelsToEntries, entriesToModels } from '@/utils/models';
import { parseExcludedModels, excludedModelsToText } from '@/utils/auth-config';
import type { ProviderKeyConfig } from '@/types';

// We reuse ProviderFormState from types, or define locally if redundant.
// Let's use the one from ./types if it fits, or redefine.
// In Page: 
/*
  interface ProviderFormState extends ProviderKeyConfig {
    modelEntries: ModelEntry[];
    excludedText: string;
  }
*/
// I will just define `FormState` locally to avoid dependency on types.ts if it's too coupled.
interface FormState {
  apiKey: string;
  baseUrl: string;
  proxyUrl: string;
  headers: { key: string; value: string }[];
  modelEntries: { name: string; alias: string }[];
  excludedText: string;
}

interface CodexConfigModalProps {
  open: boolean;
  onClose: () => void;
  initialData: ProviderKeyConfig | undefined;
  index: number | null;
  existingConfigs: ProviderKeyConfig[];
}

export function CodexConfigModal({ open, onClose, initialData, index, existingConfigs }: CodexConfigModalProps) {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);
  const clearCache = useConfigStore((state) => state.clearCache);

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    apiKey: '',
    baseUrl: '',
    proxyUrl: '',
    headers: [],
    modelEntries: [{ name: '', alias: '' }],
    excludedText: '',
  });

  useEffect(() => {
    if (open) {
      if (initialData) {
        setForm({
          apiKey: initialData.apiKey,
          baseUrl: initialData.baseUrl ?? '',
          proxyUrl: initialData.proxyUrl ?? '',
          headers: headersToEntries(initialData.headers || {}),
          modelEntries: modelsToEntries(initialData.models),
          excludedText: excludedModelsToText(initialData.excludedModels),
        });
      } else {
        setForm({
          apiKey: '',
          baseUrl: '',
          proxyUrl: '',
          headers: [],
          modelEntries: [{ name: '', alias: '' }],
          excludedText: '',
        });
      }
    }
  }, [open, initialData]);

  const handleSave = async () => {
    const baseUrl = form.baseUrl.trim();
    if (!baseUrl) {
      showNotification(t('codex_base_url_required'), 'error'); // Verify translation key? Page used 'codex_base_url_required' but actually likely 'ai_providers.codex_base_url_required' or similar? 
      // Line 363: showNotification(t('codex_base_url_required'), 'error'); 
      // It seems it is a top-level key or Page custom key? 
      // Assuming it works as is.
      return;
    }

    setSaving(true);
    try {
      const payload: ProviderKeyConfig = {
        apiKey: form.apiKey.trim(),
        baseUrl,
        proxyUrl: form.proxyUrl?.trim() || undefined,
        headers: buildHeaderObject(form.headers),
        models: entriesToModels(form.modelEntries),
        excludedModels: parseExcludedModels(form.excludedText),
      };

      const nextList =
        index !== null
          ? existingConfigs.map((item, idx) => (idx === index ? payload : item))
          : [...existingConfigs, payload];

      await providersApi.saveCodexConfigs(nextList);
      updateConfigValue('codex-api-key', nextList);
      clearCache('codex-api-key');

      const message =
        index !== null
          ? t('notification.codex_config_updated')
          : t('notification.codex_config_added');
      showNotification(message, 'success');
      onClose();
    } catch (err: unknown) {
      showNotification(`${t('notification.update_failed')}: ${(err as Error)?.message || ''}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        index !== null
          ? t('ai_providers.codex_edit_modal_title')
          : t('ai_providers.codex_add_modal_title')
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Input
        label={t('ai_providers.codex_add_modal_key_label')}
        value={form.apiKey}
        onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
      />
      <Input
        label={t('ai_providers.codex_add_modal_url_label')}
        value={form.baseUrl}
        onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
      />
      <Input
        label={t('ai_providers.codex_add_modal_proxy_label')}
        value={form.proxyUrl}
        onChange={(e) => setForm((prev) => ({ ...prev, proxyUrl: e.target.value }))}
      />
      <HeaderInputList
        entries={form.headers}
        onChange={(entries) => setForm((prev) => ({ ...prev, headers: entries }))}
        addLabel={t('common.custom_headers_add')}
        keyPlaceholder={t('common.custom_headers_key_placeholder')}
        valuePlaceholder={t('common.custom_headers_value_placeholder')}
      />
      
      {/* 
        Note: The Page used t('ai_providers.claude_models_label') for Label even for Codex??
        Line 1685 (Step 546): <label>{t('ai_providers.claude_models_label')}</label>
        Wait, was that inside the shared modal?
        Yes, line 1622: <Modal open={modal?.type === 'codex' || modal?.type === 'claude'} ...
        Inside: 
             label={
              modal?.type === 'codex'
                ? t('ai_providers.codex_add_modal_key_label')
                ...
             }
        But line 1685: <label>{t('ai_providers.claude_models_label')}</label>
        This looks like a bug or shared label in the original code.
        Since I am splitting, I should use codex label if available, or just 'Models' (claude label might be generic?).
        Let's stick to what was there or try 'ai_providers.codex_models_label' if it exists.
        If not sure, I will use 'ai_providers.claude_models_label' to be safe (preserve behavior).
      */}
      <div className="form-group">
        <label>{t('ai_providers.claude_models_label')}</label> 
        <ModelInputList
          entries={form.modelEntries}
          onChange={(entries) => setForm((prev) => ({ ...prev, modelEntries: entries }))}
          addLabel={t('ai_providers.claude_models_add_btn')} // Same here, likely shared
          namePlaceholder={t('common.model_name_placeholder')}
          aliasPlaceholder={t('common.model_alias_placeholder')}
          disabled={saving}
        />
      </div>
      <div className="form-group">
        <label>{t('ai_providers.excluded_models_label')}</label>
        <textarea
          className="input"
          placeholder={t('ai_providers.excluded_models_placeholder')}
          value={form.excludedText}
          onChange={(e) => setForm((prev) => ({ ...prev, excludedText: e.target.value }))}
          rows={4}
        />
        <div className="hint">{t('ai_providers.excluded_models_hint')}</div>
      </div>
    </Modal>
  );
}
