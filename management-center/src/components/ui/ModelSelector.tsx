import React, { useState, useEffect, useRef } from 'react';
import { IconSearch, IconChevronDown, IconCpu } from './icons';
import styles from './ModelSelector.module.scss';
import { apiClient } from '@/services/api/client';

interface ModelItem {
  id: string;
  owned_by: string;
  display_name?: string;
  type?: string;
  supported_providers?: string[];
  is_direct?: boolean;
  provider?: string;
}

interface ModelSelectorProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  value,
  onChange,
  label,
  placeholder = 'Select a model...'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeProvider, setActiveProvider] = useState<string>('all');
  const containerRef = useRef<HTMLDivElement>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        // Scroll dropdown into view
        dropdownRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
        
        // Scroll to selected item
        if (value) {
          const selectedEl = document.getElementById(`model-item-${value}`);
          if (selectedEl) {
            selectedEl.scrollIntoView({
              behavior: 'auto',
              block: 'center',
            });
          }
        }
      }, 100);
    }
  }, [isOpen, value]);

  useEffect(() => {
    const fetchModels = async () => {
      setLoading(true);
      try {
        const response = await apiClient.get<{ data: ModelItem[] }>('/models');
        if (response && Array.isArray(response.data)) {
          setModels(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch models:', error);
      } finally {
        setLoading(false);
      }
    };

    if (isOpen && models.length === 0) {
      fetchModels();
    }
  }, [isOpen, models.length]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const providers = ['all', ...Array.from(new Set(models.flatMap(m => m.supported_providers || [m.owned_by]).filter(Boolean)))];

  const filteredModels = models.filter(m => {
    const matchesSearch = m.id.toLowerCase().includes(search.toLowerCase()) || 
                         (m.display_name?.toLowerCase().includes(search.toLowerCase()));
    
    // Support multi-provider check
    const modelProviders = m.supported_providers || [m.owned_by];
    const matchesProvider = activeProvider === 'all' || 
                           modelProviders.some(p => p.toLowerCase() === activeProvider.toLowerCase());
    
    return matchesSearch && matchesProvider;
  });

  // 分组显示逻辑：
  // 1. 在 "All" 视图下，按模型的原始 OwnedBy 属性分组，展示生态丰富性。
  // 2. 在特定 Provider（渠道）视图下，扁平化展示所有该渠道支持的模型。
  //    因为此时用户关注的是“这个渠道能跑什么”，而不是“这个模型原本是谁造的”。
  const renderModelList = () => {
    // 扁平化视图 (Single Provider View)
    if (activeProvider !== 'all') {
      return (
        <div className={styles.group}>
          {filteredModels.map(item => (
            <div 
              key={item.id}
              id={`model-item-${item.id}`}
              className={`${styles.item} ${value === item.id ? styles.selected : ''}`}
               onClick={() => {
                onChange(item.id);
                setIsOpen(false);
              }}
            >
              <div className={styles.itemInfo}>
                <div className={styles.itemNameWrapper}>
                  <span className={styles.itemName}>{item.id}</span>
                  {item.is_direct && <span className={styles.itemDirect}>Direct</span>}
                </div>
                <span className={styles.itemDesc}>{item.display_name}</span>
              </div>
              <span className={styles.itemProvider}>
                {getDisplayProvider(activeProvider)}
              </span>
            </div>
          ))}
        </div>
      );
    }

    // 分组视图 (All View)
    const groupedModels: Record<string, ModelItem[]> = {};
    filteredModels.forEach(m => {
      const group = m.owned_by || 'Other';
      if (!groupedModels[group]) groupedModels[group] = [];
      groupedModels[group].push(m);
    });

    return Object.entries(groupedModels).map(([group, items]) => (
      <div key={group} className={styles.group}>
        <div className={styles.groupLabel}>{getDisplayProvider(group)}</div>
        {items.map(item => (
          <div 
            key={item.id}
            id={`model-item-${item.id}`}
            className={`${styles.item} ${value === item.id ? styles.selected : ''}`}
            onClick={() => {
              onChange(item.id);
              setIsOpen(false);
            }}
          >
            <div className={styles.itemInfo}>
              <div className={styles.itemNameWrapper}>
                <span className={styles.itemName}>{item.id}</span>
                {item.is_direct && <span className={styles.itemDirect}>Direct</span>}
              </div>
              <span className={styles.itemDesc}>{item.display_name}</span>
            </div>
            <span className={styles.itemProvider}>
              {getDisplayProvider(item.is_direct ? item.provider || item.owned_by : item.owned_by)}
            </span>
          </div>
        ))}
      </div>
    ));
  };

  const getDisplayProvider = (provider: string) => {
    const p = provider.toLowerCase();
    if (p === 'geminicli' || p === 'gemini-cli') return 'GeminiCLI';
    if (p === 'iflow') return 'iFlow';
    if (p === 'openai') return 'OpenAI';
    if (p === 'antigravity') return 'Antigravity';
    if (p === 'qwen') return 'Qwen';
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  };

  return (
    <div className={styles.container} ref={containerRef}>
      {label && <label className={styles.label}>{label}</label>}
      
      <div 
        className={`${styles.trigger} ${isOpen ? styles.active : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <IconCpu size={16} className={styles.icon} />
        <span className={`${styles.value} ${!value ? styles.placeholder : ''}`}>
          {value || placeholder}
        </span>
        <IconChevronDown size={14} className={styles.icon} />
      </div>

      {isOpen && (
        <div className={styles.dropdown} ref={dropdownRef}>
          <div className={styles.searchWrapper}>
            <div style={{ position: 'relative' }}>
              <IconSearch size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
              <input 
                autoFocus
                className={styles.searchInput}
                style={{ paddingLeft: 32 }}
                placeholder="Search models..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.filterWrapper}>
            {providers.map(p => (
              <div 
                key={p} 
                className={`${styles.filterTag} ${activeProvider === p ? styles.active : ''}`}
                onClick={() => setActiveProvider(p)}
              >
                {getDisplayProvider(p)}
              </div>
            ))}
          </div>

          <div className={styles.list}>
            {loading ? (
              <div className={styles.loading}>Loading models...</div>
            ) : filteredModels.length === 0 ? (
              <div className={styles.empty}>No models found</div>
            ) : (
              renderModelList()
            )}
          </div>
        </div>
      )}
    </div>
  );
};
