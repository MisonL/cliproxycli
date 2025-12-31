import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { HeaderInputList } from '@/components/ui/HeaderInputList';
import { useConfigStore, useNotificationStore } from '@/stores';
import { providersApi } from '@/services/api';
import { headersToEntries, buildHeaderObject } from '@/utils/headers';
import { parseExcludedModels, excludedModelsToText } from '@/utils/auth-config';
import type { GeminiKeyConfig } from '@/types';
import type { GeminiFormState } from './types';

interface GeminiConfigModalProps {
  open: boolean;
  onClose: () => void;
  initialData: GeminiKeyConfig | undefined;
  index: number | null;
  existingKeys: GeminiKeyConfig[];
}

export function GeminiConfigModal({ open, onClose, initialData, index, existingKeys }: GeminiConfigModalProps) {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);
  const clearCache = useConfigStore((state) => state.clearCache);

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<GeminiFormState>({
    apiKey: '',
    baseUrl: '',
    headers: {},
    excludedText: '',
  });

  useEffect(() => {
    if (open) {
      if (initialData) {
        setForm({
          apiKey: initialData.apiKey || '',
          baseUrl: initialData.baseUrl || '',
          headers: initialData.headers || {},
          excludedText: excludedModelsToText(initialData.excludedModels),
        });
      } else {
        setForm({
          apiKey: '',
          baseUrl: '',
          headers: {},
          excludedText: '',
        });
      }
    }
  }, [open, initialData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: GeminiKeyConfig = {
        apiKey: form.apiKey.trim(),
        baseUrl: form.baseUrl?.trim() || undefined,
        headers: form.headers, // Already a Record
        excludedModels: parseExcludedModels(form.excludedText),
      };

      const nextList =
        index !== null
          ? existingKeys.map((item, idx) => (idx === index ? payload : item))
          : [...existingKeys, payload];

      await providersApi.saveGeminiKeys(nextList);
      
      // Update local store
      updateConfigValue('gemini-api-key', nextList);
      clearCache('gemini-api-key');
      
      const message =
        index !== null
          ? t('notification.gemini_key_updated')
          : t('notification.gemini_key_added');
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
          ? t('ai_providers.gemini_edit_modal_title')
          : t('ai_providers.gemini_add_modal_title')
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
        label={t('ai_providers.gemini_add_modal_key_label')}
        placeholder={t('ai_providers.gemini_add_modal_key_placeholder')}
        value={form.apiKey}
        onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
        disabled={saving}
      />
      <Input
        label={t('ai_providers.gemini_base_url_label')}
        placeholder={t('ai_providers.gemini_base_url_placeholder')}
        value={form.baseUrl}
        onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
        disabled={saving}
      />
      <HeaderInputList
        entries={headersToEntries(form.headers)}
        onChange={(entries) =>
          setForm((prev) => ({ ...prev, headers: buildHeaderObject(entries) }))
        }
        addLabel={t('common.custom_headers_add')}
        keyPlaceholder={t('common.custom_headers_key_placeholder')}
        valuePlaceholder={t('common.custom_headers_value_placeholder')}
        disabled={saving}
      />
      <div className="form-group">
        <label>{t('ai_providers.excluded_models_label')}</label>
        <textarea
          className="input"
          placeholder={t('ai_providers.excluded_models_placeholder')}
          value={form.excludedText}
          onChange={(e) => setForm((prev) => ({ ...prev, excludedText: e.target.value }))}
          rows={4}
          disabled={saving}
        />
        <div className="hint">{t('ai_providers.excluded_models_hint')}</div>
      </div>
    </Modal>
  );
}
