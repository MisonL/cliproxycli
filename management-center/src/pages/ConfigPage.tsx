import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { keymap } from '@codemirror/view';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { IconChevronDown, IconChevronUp, IconSearch } from '@/components/ui/icons';
import { useNotificationStore, useAuthStore, useThemeStore } from '@/stores';
import { configFileApi } from '@/services/api/configFile';

export function ConfigPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const theme = useThemeStore((state) => state.theme);

  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [lastSearchedQuery, setLastSearchedQuery] = useState('');
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const floatingControlsRef = useRef<HTMLDivElement>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);

  const disableControls = connectionStatus !== 'connected';

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await configFileApi.fetchConfigYaml();
      setContent(data);
      setDirty(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('notification.refresh_failed');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await configFileApi.saveConfigYaml(content);
      setDirty(false);
      showNotification(t('config_management.save_success'), 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      showNotification(`${t('notification.save_failed')}: ${message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = useCallback((value: string) => {
    setContent(value);
    setDirty(true);
  }, []);

  // Search functionality
  const performSearch = useCallback((query: string, direction: 'next' | 'prev' = 'next') => {
    if (!query || !editorRef.current?.view) return;

    const view = editorRef.current.view;
    const doc = view.state.doc.toString();
    const matches: number[] = [];
    const lowerQuery = query.toLowerCase();
    const lowerDoc = doc.toLowerCase();

    let pos = 0;
    while (pos < lowerDoc.length) {
      const index = lowerDoc.indexOf(lowerQuery, pos);
      if (index === -1) break;
      matches.push(index);
      pos = index + 1;
    }

    if (matches.length === 0) {
      setSearchResults({ current: 0, total: 0 });
      return;
    }

    // Find current match based on cursor position
    const selection = view.state.selection.main;
    const cursorPos = direction === 'prev' ? selection.from : selection.to;
    let currentIndex = 0;

    if (direction === 'next') {
      // Find next match after cursor
      for (let i = 0; i < matches.length; i++) {
        if (matches[i] > cursorPos) {
          currentIndex = i;
          break;
        }
        // If no match after cursor, wrap to first
        if (i === matches.length - 1) {
          currentIndex = 0;
        }
      }
    } else {
      // Find previous match before cursor
      for (let i = matches.length - 1; i >= 0; i--) {
        if (matches[i] < cursorPos) {
          currentIndex = i;
          break;
        }
        // If no match before cursor, wrap to last
        if (i === 0) {
          currentIndex = matches.length - 1;
        }
      }
    }

    const matchPos = matches[currentIndex];
    setSearchResults({ current: currentIndex + 1, total: matches.length });

    // Scroll to and select the match
    view.dispatch({
      selection: { anchor: matchPos, head: matchPos + query.length },
      scrollIntoView: true
    });
    view.focus();
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    // Do not auto-search on each keystroke. Clear previous results when query changes.
    if (!value) {
      setSearchResults({ current: 0, total: 0 });
      setLastSearchedQuery('');
    } else {
      setSearchResults({ current: 0, total: 0 });
    }
  }, []);

  const executeSearch = useCallback((direction: 'next' | 'prev' = 'next') => {
    if (!searchQuery) return;
    setLastSearchedQuery(searchQuery);
    performSearch(searchQuery, direction);
  }, [searchQuery, performSearch]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeSearch(e.shiftKey ? 'prev' : 'next');
    }
  }, [executeSearch]);

  const handlePrevMatch = useCallback(() => {
    if (!lastSearchedQuery) return;
    performSearch(lastSearchedQuery, 'prev');
  }, [lastSearchedQuery, performSearch]);

  const handleNextMatch = useCallback(() => {
    if (!lastSearchedQuery) return;
    performSearch(lastSearchedQuery, 'next');
  }, [lastSearchedQuery, performSearch]);

  // Keep floating controls from covering editor content by syncing its height to a CSS variable.
  useLayoutEffect(() => {
    const controlsEl = floatingControlsRef.current;
    const wrapperEl = editorWrapperRef.current;
    if (!controlsEl || !wrapperEl) return;

    const updatePadding = () => {
      const height = controlsEl.getBoundingClientRect().height;
      wrapperEl.style.setProperty('--floating-controls-height', `${height}px`);
    };

    updatePadding();
    window.addEventListener('resize', updatePadding);

    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePadding);
    ro?.observe(controlsEl);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', updatePadding);
    };
  }, []);

  // CodeMirror extensions
  const extensions = useMemo(() => [
    yaml(),
    search(),
    highlightSelectionMatches(),
    keymap.of(searchKeymap)
  ], []);

  // Status text
  const getStatusText = () => {
    if (disableControls) return t('config_management.status_disconnected');
    if (loading) return t('config_management.status_loading');
    if (error) return t('config_management.status_load_failed');
    if (saving) return t('config_management.status_saving');
    if (dirty) return t('config_management.status_dirty');
    return t('config_management.status_loaded');
  };



  return (
    <div className="flex-column">
      <header className="hero-wrapper">
        <div className="hero-content">
          <div className="flex-column gap-xs">
            <div className="badge badge-primary" style={{ marginBottom: '8px', width: 'fit-content' }}>
               Core Engine Config
            </div>
            <h1 className="hero-title">{t('config_management.title')}</h1>
            <p className="hero-subtitle">{t('config_management.description') || '系统核心运行配置，采用标准 YAML 格式，修改后实时生效。'}</p>
          </div>
        </div>
      </header>

      <div style={{ padding: '0 40px 80px', marginTop: '-40px' }} className="flex-column gap-xl">
        <div className="card-glass flex-column overflow-hidden" style={{ borderRadius: '24px', border: '1px solid var(--border-light)', minHeight: '600px' }}>
          {/* 编辑器状态栏 */}
          <div className="flex-row justify-between items-center" style={{ padding: '20px 28px', background: 'linear-gradient(to right, rgba(var(--bg-primary-rgb), 0.6), rgba(var(--bg-primary-rgb), 0.2))', borderBottom: '1px solid var(--border-light)' }}>
            <div className="flex-row items-center gap-md">
              <div className={`record-dot ${dirty ? 'animate-pulse' : ''}`} style={{ 
                width: '10px', height: '10px', 
                background: error ? 'var(--error-color)' : (dirty ? 'var(--warning-color)' : 'var(--success-color)'),
                boxShadow: `0 0 10px ${error ? 'var(--error-color)' : (dirty ? 'var(--warning-color)' : 'var(--success-color)')}`
              }} />
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)' }}>{getStatusText()}</span>
            </div>

            <div className="flex-row items-center gap-md">
              <Button variant="secondary" size="md" onClick={loadConfig} disabled={loading} className="btn-glass" style={{ height: '40px' }}>
                 <span style={{ fontSize: '13px' }}>{t('config_management.reload')}</span>
              </Button>
              <Button size="md" onClick={handleSave} loading={saving} disabled={disableControls || loading || !dirty} style={{ height: '40px', padding: '0 24px' }}>
                 <span style={{ fontSize: '13px' }}>{t('config_management.save')}</span>
              </Button>
            </div>
          </div>

          <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
            {/* 浮动搜索栏 */}
            <div className="card-glass flex-row items-center gap-md" style={{ 
              position: 'absolute', top: '24px', right: '32px', zIndex: 10,
              padding: '8px 16px', borderRadius: '16px', border: '1px solid var(--border-light)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.1)', background: 'rgba(var(--bg-primary-rgb), 0.8)'
            }}>
              <div style={{ position: 'relative', width: '240px' }}>
                <Input
                  className="input-premium"
                  style={{ height: '36px', paddingLeft: '36px', paddingRight: '70px', fontSize: '13px' }}
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={t('config_management.search_placeholder', { defaultValue: 'Search...' })}
                  disabled={disableControls || loading}
                />
                <IconSearch size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                {searchQuery && lastSearchedQuery === searchQuery && (
                   <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', fontWeight: 800, color: 'var(--primary-color)' }}>
                     {searchResults.total > 0 ? `${searchResults.current}/${searchResults.total}` : 'N/A'}
                   </span>
                )}
              </div>
              <div className="flex-row items-center gap-xs">
                <Button variant="ghost" size="sm" onClick={handlePrevMatch} disabled={!searchQuery || lastSearchedQuery !== searchQuery || searchResults.total === 0} style={{ padding: '6px' }}>
                  <IconChevronUp size={16} />
                </Button>
                <Button variant="ghost" size="sm" onClick={handleNextMatch} disabled={!searchQuery || lastSearchedQuery !== searchQuery || searchResults.total === 0} style={{ padding: '6px' }}>
                  <IconChevronDown size={16} />
                </Button>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: '500px' }}>
              <CodeMirror
                ref={editorRef}
                value={content}
                onChange={handleChange}
                extensions={extensions}
                theme={theme === 'dark' ? 'dark' : 'light'}
                editable={!disableControls && !loading}
                placeholder={t('config_management.editor_placeholder')}
                height="100%"
                style={{ height: '100%' }}
                basicSetup={{
                  lineNumbers: true,
                  highlightActiveLineGutter: true,
                  highlightActiveLine: true,
                  foldGutter: true,
                  dropCursor: true,
                  allowMultipleSelections: true,
                  indentOnInput: true,
                  bracketMatching: true,
                  closeBrackets: true,
                  autocompletion: false,
                  rectangularSelection: true,
                  crosshairCursor: false,
                  highlightSelectionMatches: true,
                  closeBracketsKeymap: true,
                  searchKeymap: true,
                  foldKeymap: true,
                  completionKeymap: false,
                  lintKeymap: true
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
