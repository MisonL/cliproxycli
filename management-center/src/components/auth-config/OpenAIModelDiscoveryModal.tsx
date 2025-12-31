import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { modelsApi } from '@/services/api';
import { buildHeaderObject, type HeaderEntry } from '@/utils/headers';
import { buildOpenAIModelsEndpoint } from '@/utils/auth-config';
import type { ApiKeyEntry } from '@/types';
import type { ModelInfo } from '@/utils/models';
import styles from './OpenAIConfigModal.module.scss'; // Share styles

interface OpenAIModelDiscoveryModalProps {
  open: boolean;
  onClose: () => void;
  baseUrl: string;
  headers: HeaderEntry[];
  apiKeyEntries: ApiKeyEntry[];
  onApply: (models: ModelInfo[]) => void;
}

export function OpenAIModelDiscoveryModal({
  open,
  onClose,
  baseUrl,
  headers,
  apiKeyEntries,
  onApply,
}: OpenAIModelDiscoveryModalProps) {
  const { t } = useTranslation();
  const [endpoint, setEndpoint] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setEndpoint(buildOpenAIModelsEndpoint(baseUrl));
      setModels([]);
      setSearch('');
      setSelected(new Set());
      setError('');
      // Auto fetch
      fetchModels();
    }
  }, [open, baseUrl]);

  const fetchModels = async (allowFallback = true) => {
    if (!baseUrl.trim()) return;
    setLoading(true);
    setError('');
    try {
      const headerObj = buildHeaderObject(headers);
      const firstKey = apiKeyEntries
        .find((entry) => entry.apiKey?.trim())
        ?.apiKey?.trim();
      const hasAuthHeader = Boolean(headerObj.Authorization || headerObj['authorization']);
      
      const list = await modelsApi.fetchModels(
        baseUrl.trim(),
        hasAuthHeader ? undefined : firstKey,
        headerObj
      );
      setModels(list);
    } catch (err: unknown) {
      if (allowFallback) {
        try {
          // Fallback without auth if failed (sometimes endpoints are public or auth is handled differently)
          const list = await modelsApi.fetchModels(baseUrl.trim());
          setModels(list);
        } catch (fallbackErr: unknown) {
           const message = (fallbackErr as Error)?.message || (err as Error)?.message || '';
           setModels([]);
           setError(`${t('ai_providers.openai_models_fetch_error')}: ${message}`);
        }
      } else {
        setModels([]);
        setError(`${t('ai_providers.openai_models_fetch_error')}: ${(err as Error)?.message || ''}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredModels = useMemo(() => {
    const filter = search.trim().toLowerCase();
    if (!filter) return models;
    return models.filter((model) => {
       const name = (model.name || '').toLowerCase();
       const alias = (model.alias || '').toLowerCase();
       const desc = (model.description || '').toLowerCase();
       return name.includes(filter) || alias.includes(filter) || desc.includes(filter);
    });
  }, [models, search]);

  const toggleSelection = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    setSelected(next);
  };

  const handleApply = () => {
    const selectedModels = models.filter((m) => selected.has(m.name));
    onApply(selectedModels);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('ai_providers.openai_models_fetch_title')}
      width={720}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t('ai_providers.openai_models_fetch_back')}
          </Button>
          <Button onClick={handleApply} disabled={loading || selected.size === 0}>
            {t('ai_providers.openai_models_fetch_apply')}
          </Button>
        </>
      }
    >
       <div className="hint" style={{ marginBottom: 8 }}>
          {t('ai_providers.openai_models_fetch_hint')}
        </div>
        <div className="form-group">
          <label>{t('ai_providers.openai_models_fetch_url_label')}</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="input" readOnly value={endpoint} />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fetchModels(true)}
              loading={loading}
            >
              {t('ai_providers.openai_models_fetch_refresh')}
            </Button>
          </div>
        </div>
        <Input
          label={t('ai_providers.openai_models_search_label')}
          placeholder={t('ai_providers.openai_models_search_placeholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {error && <div className="error-box">{error}</div>}
        
        {loading ? (
           <div className="hint">{t('ai_providers.openai_models_fetch_loading')}</div>
        ) : models.length === 0 ? (
           <div className="hint">{t('ai_providers.openai_models_fetch_empty')}</div>
        ) : filteredModels.length === 0 ? (
           <div className="hint">{t('ai_providers.openai_models_search_empty')}</div>
        ) : (
           <div className={styles.modelDiscoveryList}>
             {filteredModels.map((model) => {
               const checked = selected.has(model.name);
               return (
                 <label
                   key={model.name}
                   className={`${styles.modelDiscoveryRow} ${checked ? styles.modelDiscoveryRowSelected : ''}`}
                 >
                   <input
                     type="checkbox"
                     checked={checked}
                     onChange={() => toggleSelection(model.name)}
                   />
                   <div className={styles.modelDiscoveryMeta}>
                     <div className={styles.modelDiscoveryName}>
                       {model.name}
                       {model.alias && (
                         <span className={styles.modelDiscoveryAlias}>{model.alias}</span>
                       )}
                     </div>
                     {model.description && (
                       <div className={styles.modelDiscoveryDesc}>{model.description}</div>
                     )}
                   </div>
                 </label>
               );
             })}
           </div>
        )}
    </Modal>
  );
}
