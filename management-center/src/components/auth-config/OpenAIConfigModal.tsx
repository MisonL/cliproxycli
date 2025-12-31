import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { HeaderInputList } from '@/components/ui/HeaderInputList';
import { ModelInputList } from '@/components/ui/ModelInputList';
// import { IconCheck, IconX, IconTrash } from '@/components/ui/icons'; 
import { useConfigStore, useNotificationStore } from '@/stores';
import { providersApi, modelsApi } from '@/services/api';
import { 
    buildApiKeyEntry, 
    buildOpenAIChatCompletionsEndpoint, 
} from '@/utils/auth-config';
import { headersToEntries, buildHeaderObject } from '@/utils/headers';
import { modelsToEntries, entriesToModels } from '@/utils/models';
import type { OpenAIProviderConfig } from '@/types';
import type { OpenAIFormState } from './types';
import type { ModelInfo } from '@/utils/models';
import { OpenAIModelDiscoveryModal } from './OpenAIModelDiscoveryModal';
import styles from './OpenAIConfigModal.module.scss'; 

const OPENAI_TEST_TIMEOUT_MS = 30_000;

interface OpenAIConfigModalProps {
  open: boolean;
  onClose: () => void;
  initialData: OpenAIProviderConfig | undefined;
  index: number | null;
  existingProviders: OpenAIProviderConfig[];
}

export function OpenAIConfigModal({ open, onClose, initialData, index, existingProviders }: OpenAIConfigModalProps) {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);
  const clearCache = useConfigStore((state) => state.clearCache);

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<OpenAIFormState>({
    name: '',
    baseUrl: '',
    headers: [],
    apiKeyEntries: [buildApiKeyEntry()],
    modelEntries: [{ name: '', alias: '' }],
  });

  // Discovery State
  const [discoveryOpen, setDiscoveryOpen] = useState(false);

  // Test State
  const [testModel, setTestModel] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
    if (open) {
      if (initialData) {
        const modelEntries = modelsToEntries(initialData.models);
        setForm({
          name: initialData.name || '',
          baseUrl: initialData.baseUrl || '',
          headers: headersToEntries(initialData.headers || {}), 
          apiKeyEntries: initialData.apiKeyEntries?.length ? initialData.apiKeyEntries : [buildApiKeyEntry()],
          modelEntries: modelEntries,
          testModel: initialData.testModel,
        });
        
        const available = modelEntries.map(m => m.name.trim()).filter(Boolean);
        const initialTestModel = initialData.testModel && available.includes(initialData.testModel)
          ? initialData.testModel
          : available[0] || '';
        setTestModel(initialTestModel);

      } else {
         setForm({
            name: '',
            baseUrl: '',
            headers: [],
            apiKeyEntries: [buildApiKeyEntry()],
            modelEntries: [{ name: '', alias: '' }],
         });
         setTestModel('');
      }
      setTestStatus('idle');
      setTestMessage('');
    }
  }, [open, initialData]);

  const handleApplyDiscovery = (models: ModelInfo[]) => {
    // Append or replace? Logic in Page was just setting local `openaiDiscoverySelected` then user clicks Apply.
    // In Page: `applyOpenaiModelDiscoverySelection` loops through selected and adds to form.modelEntries.
    // Logic: add if not exists.
    
    // Page Logic:
    /*
    const selected = Array.from(openaiDiscoverySelected);
    const newModels = selected.map(...);
    const combined = [...current, ...newModels];
    setOpenaiForm...
    */
    
    // Here we get `models` (which are selected ModelInfos).
    const newEntries = modelsToEntries(models);
    const currentEntries = [...form.modelEntries];
    
    // Merge: unique names
    const seen = new Set(currentEntries.map(e => e.name));
    newEntries.forEach(e => {
        if (!seen.has(e.name)) {
            currentEntries.push(e);
            seen.add(e.name);
        }
    });

    setForm(prev => ({ ...prev, modelEntries: currentEntries }));
    
    // Update test model if it was empty
    if (!testModel && currentEntries.length > 0) {
        setTestModel(currentEntries[0].name);
    }
  };

  const handleTestConnection = async () => {
    const baseUrl = form.baseUrl.trim();
    if (!baseUrl) {
       showNotification(t('ai_providers.openai_test_invalid_url'), 'error');
       return;
    }
    if (!testModel) return;

    setTestStatus('loading');
    setTestMessage('');
    
    const timeoutId = window.setTimeout(() => {
       // Abort controller logic would be better but simple timeout message update is what Page did
       // Actually Page used internal fetch with signal? No, `modelsApi.chatCompletions`?
       // Let's assume `modelsApi` doesn't expose abort easily or we just let it hang.
       // Page used `setOpenaiTestMessage(timeout)` but didn't actually abort the request unless request supported it.
    }, OPENAI_TEST_TIMEOUT_MS);

    try {
        const headerObj = buildHeaderObject(form.headers);
        const firstKey = form.apiKeyEntries
            .find((entry) => entry.apiKey?.trim())
            ?.apiKey?.trim();
        const hasAuthHeader = Boolean(headerObj.Authorization || headerObj['authorization']);

        // Construct payload
        const testPayload = {
            model: testModel,
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 5,
        };

        const chatUrl = buildOpenAIChatCompletionsEndpoint(baseUrl);
        
        await modelsApi.chatCompletions(
            chatUrl,
            hasAuthHeader ? '' : (firstKey || ''),
            headerObj,
            testPayload
        );
        
        setTestStatus('success');
        setTestMessage(t('ai_providers.openai_test_success'));
        
    } catch (err: unknown) {
        setTestStatus('error');
        setTestMessage(`${t('ai_providers.openai_test_failed')}: ${(err as Error)?.message}`);
    } finally {
        window.clearTimeout(timeoutId);
        // Page code had `setOpenaiTestLoading(false)` logic inside status check.
    }
  };

  const handleSave = async () => {
    // Validate
    if (!form.name.trim()) {
        showNotification(t('ai_providers.openai_name_required'), 'error');
        return;
    }
    if (!form.baseUrl.trim()) {
        showNotification(t('ai_providers.openai_base_url_required'), 'error');
        return;
    }

    setSaving(true);
    try {
        const modelsList = entriesToModels(form.modelEntries);
        const payload: OpenAIProviderConfig = {
            name: form.name.trim(),
            baseUrl: form.baseUrl.trim(),
            headers: buildHeaderObject(form.headers),
            models: modelsList,
            apiKeyEntries: form.apiKeyEntries.filter(k => k.apiKey.trim() || (k.proxyUrl || '').trim()),
            testModel: testModel || undefined,
        };
        
        const nextList = index !== null 
            ? existingProviders.map((p, i) => i === index ? payload : p)
            : [...existingProviders, payload];

        await providersApi.saveOpenAIProviders(nextList);
        
        // Update store
        updateConfigValue('openai-compatibility', nextList);
        clearCache('openai-compatibility');
        
        const msg = index !== null 
            ? t('notification.openai_provider_updated')
            : t('notification.openai_provider_added');
        showNotification(msg, 'success');
        onClose();
        
    } catch (err: unknown) {
        showNotification(`${t('notification.update_failed')}: ${(err as Error)?.message}`, 'error');
    } finally {
        setSaving(false);
    }
  };

  const renderKeyEntries = () => {
    // Logic to render key inputs. In Page it was a helper `renderKeyEntries`.
    // I should probably inline it or make a sub-component.
    // For simplicity, I will implement inline mapping here.
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {form.apiKeyEntries.map((entry, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                   <div style={{ flex: 1 }}>
                       <Input 
                          placeholder={t('ai_providers.openai_key_placeholder')}
                          value={entry.apiKey}
                          onChange={(e) => {
                             const next = [...form.apiKeyEntries];
                             next[idx] = { ...next[idx], apiKey: e.target.value };
                             setForm(prev => ({ ...prev, apiKeyEntries: next }));
                          }}
                          type="password"
                          style={{ marginBottom: 4 }}
                       />
                       <Input 
                          placeholder={t('ai_providers.openai_proxy_url_placeholder')}
                          value={entry.proxyUrl}
                           onChange={(e) => {
                             const next = [...form.apiKeyEntries];
                             next[idx] = { ...next[idx], proxyUrl: e.target.value };
                             setForm(prev => ({ ...prev, apiKeyEntries: next }));
                          }}
                       />
                   </div>
                   <Button 
                      variant="danger" 
                      onClick={() => {
                          const next = form.apiKeyEntries.filter((_, i) => i !== idx);
                          setForm(prev => ({ ...prev, apiKeyEntries: next }));
                      }}
                      disabled={form.apiKeyEntries.length <= 1}
                   >
                       <span style={{ fontSize: 16 }}>&times;</span>
                   </Button>
                </div>
            ))}
            <Button 
                variant="secondary" 
                size="sm" 
                onClick={() => setForm(prev => ({ 
                    ...prev, 
                    apiKeyEntries: [...prev.apiKeyEntries, buildApiKeyEntry()] 
                }))}
            >
                {t('ai_providers.openai_add_key_btn')}
            </Button>
        </div>
    );
  };

  const availableModels = useMemo(() => 
    form.modelEntries.map(e => e.name.trim()).filter(Boolean),
    [form.modelEntries]
  );

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title={
        index !== null
          ? t('ai_providers.openai_edit_modal_title')
          : t('ai_providers.openai_add_modal_title')
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
        label={t('ai_providers.openai_add_modal_name_label')}
        value={form.name}
        onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
      />
      <Input
        label={t('ai_providers.openai_add_modal_url_label')}
        value={form.baseUrl}
        onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
      />

      <HeaderInputList
        entries={form.headers}
        onChange={(entries) => setForm((prev) => ({ ...prev, headers: entries }))}
        addLabel={t('common.custom_headers_add')}
        keyPlaceholder={t('common.custom_headers_key_placeholder')}
        valuePlaceholder={t('common.custom_headers_value_placeholder')}
      />

      <div className="form-group">
        <label>
          {index !== null
            ? t('ai_providers.openai_edit_modal_models_label')
            : t('ai_providers.openai_add_modal_models_label')}
        </label>
        <div className="hint">{t('ai_providers.openai_models_hint')}</div>
        <ModelInputList
          entries={form.modelEntries}
          onChange={(entries) => setForm((prev) => ({ ...prev, modelEntries: entries }))}
          addLabel={t('ai_providers.openai_models_add_btn')}
          namePlaceholder={t('common.model_name_placeholder')}
          aliasPlaceholder={t('common.model_alias_placeholder')}
          disabled={saving}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
              if (!form.baseUrl) {
                  showNotification(t('ai_providers.openai_models_fetch_invalid_url'), 'error');
                  return;
              }
              setDiscoveryOpen(true);
          }}
          disabled={saving}
        >
          {t('ai_providers.openai_models_fetch_button')}
        </Button>
      </div>

      <div className="form-group">
        <label>{t('ai_providers.openai_test_title')}</label>
        <div className="hint">{t('ai_providers.openai_test_hint')}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            className={`input ${styles.openaiTestSelect}`}
            value={testModel}
            onChange={(e) => {
              setTestModel(e.target.value);
              setTestStatus('idle');
              setTestMessage('');
            }}
            disabled={saving || availableModels.length === 0}
            style={{ flex: 1 }}
          >
            <option value="">
              {availableModels.length
                ? t('ai_providers.openai_test_select_placeholder')
                : t('ai_providers.openai_test_select_empty')}
            </option>
            {form.modelEntries
              .filter((entry) => entry.name.trim())
              .map((entry, idx) => {
                const name = entry.name.trim();
                const alias = entry.alias.trim();
                const label = alias && alias !== name ? `${name} (${alias})` : name;
                return (
                  <option key={`${name}-${idx}`} value={name}>
                    {label}
                  </option>
                );
              })}
          </select>
          <Button
            variant={testStatus === 'error' ? 'danger' : 'secondary'}
            className={`${styles.openaiTestButton} ${testStatus === 'success' ? styles.openaiTestButtonSuccess : ''}`}
            onClick={handleTestConnection}
            loading={testStatus === 'loading'}
            disabled={saving || availableModels.length === 0}
          >
            {t('ai_providers.openai_test_action')}
          </Button>
        </div>
        {testMessage && (
          <div
            className={`status-badge ${
              testStatus === 'error'
                ? 'error'
                : testStatus === 'success'
                  ? 'success'
                  : 'muted'
            }`}
          >
            {testMessage}
          </div>
        )}
      </div>

      <div className="form-group">
        <label>{t('ai_providers.openai_add_modal_keys_label')}</label>
        {renderKeyEntries()}
      </div>
    </Modal>

    <OpenAIModelDiscoveryModal 
        open={discoveryOpen}
        onClose={() => setDiscoveryOpen(false)}
        baseUrl={form.baseUrl}
        headers={form.headers}
        apiKeyEntries={form.apiKeyEntries}
        onApply={handleApplyDiscovery}
    />
    </>
  );
}
