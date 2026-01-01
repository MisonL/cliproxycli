import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconDownload, IconTrash2, IconLayoutGrid, IconList, IconPlus, IconSearch, IconRefreshCw } from '@/components/ui/icons';
import { useNotificationStore, useThemeStore } from '@/stores';
import { authFilesApi, usageApi } from '@/services/api';
import { apiClient } from '@/services/api/client';
import type { AuthFileItem } from '@/types';
import type { KeyStats, KeyStatBucket } from '@/utils/usage';
import { formatFileSize } from '@/utils/format';

type ThemeColors = { bg: string; text: string; border?: string };
type TypeColorSet = { light: ThemeColors; dark?: ThemeColors };

const TYPE_COLORS: Record<string, TypeColorSet> = {
  qwen: { light: { bg: '#e8f5e9', text: '#2e7d32' }, dark: { bg: 'rgba(46, 125, 50, 0.15)', text: '#81c784' } },
  gemini: { light: { bg: '#e3f2fd', text: '#1565c0' }, dark: { bg: 'rgba(21, 101, 192, 0.15)', text: '#64b5f6' } },
  'gemini-cli': { light: { bg: '#e7efff', text: '#1e4fa3' }, dark: { bg: 'rgba(30, 63, 115, 0.15)', text: '#a8c7ff' } },
  claude: { light: { bg: '#fce4ec', text: '#c2185b' }, dark: { bg: 'rgba(194, 24, 91, 0.15)', text: '#f48fb1' } },
  codex: { light: { bg: '#fff3e0', text: '#ef6c00' }, dark: { bg: 'rgba(239, 108, 0, 0.15)', text: '#ffb74d' } },
  antigravity: { light: { bg: '#e0f7fa', text: '#006064' }, dark: { bg: 'rgba(0, 96, 100, 0.15)', text: '#80deea' } },
  iflow: { light: { bg: '#f3e5f5', text: '#7b1fa2' }, dark: { bg: 'rgba(123, 31, 162, 0.15)', text: '#ce93d8' } },
  unknown: { light: { bg: '#f0f0f0', text: '#666666' }, dark: { bg: 'rgba(102, 102, 102, 0.15)', text: '#aaaaaa' } }
};


function normalizeAuthIndexValue(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toString();
  if (typeof value === 'string') return value.trim() || null;
  return null;
}

function resolveAuthFileStats(file: AuthFileItem, stats: KeyStats): KeyStatBucket {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndexKey = normalizeAuthIndexValue(rawAuthIndex);
  if (authIndexKey && stats.byAuthIndex?.[authIndexKey]) return stats.byAuthIndex[authIndexKey];
  if (file.name && stats.bySource?.[file.name]) return stats.bySource[file.name];
  return { success: 0, failure: 0 };
}

export function AuthFilesPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const theme = useThemeStore((state) => state.theme);

  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | string>('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [uploading, setUploading] = useState(false);
  const [keyStats, setKeyStats] = useState<KeyStats>({ bySource: {}, byAuthIndex: {} });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await authFilesApi.list();
      setFiles(data?.files || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadKeyStats = useCallback(async () => {
    try {
      const stats = await usageApi.getKeyStats();
      setKeyStats(stats);
    } catch {}
  }, []);

  useEffect(() => { loadFiles(); loadKeyStats(); }, [loadFiles, loadKeyStats]);

  const filtered = useMemo(() => {
    return files.filter((item) => {
      const matchType = filter === 'all' || item.type === filter;
      const term = search.trim().toLowerCase();
      return matchType && (!term || item.name.toLowerCase().includes(term));
    });
  }, [files, filter, search]);

  const existingTypes = useMemo(() => {
    const types = new Set<string>(['all']);
    files.forEach((file) => file.type && types.add(file.type));
    return Array.from(types);
  }, [files]);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        await authFilesApi.upload(file);
      }
      showNotification(t('auth_files.upload_success'), 'success');
      loadFiles();
    } catch (err: any) {
      showNotification(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleDownload = async (name: string) => {
    try {
      const response = await apiClient.getRaw(`/auth-files/download?name=${encodeURIComponent(name)}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a'); a.href = url; a.download = name; a.click();
      window.URL.revokeObjectURL(url);
    } catch {}
  };

  const handleDelete = async (name: string) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    try {
      await authFilesApi.deleteFile(name);
      setFiles(prev => prev.filter(f => f.name !== name));
    } catch (err) {
      showNotification(t('common.error'), 'error');
    }
  };

  const getTypeColor = (type: string) => {
    const set = TYPE_COLORS[type] || TYPE_COLORS.unknown;
    return theme === 'dark' && set.dark ? set.dark : set.light;
  };

  if (loading) return <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}><LoadingSpinner /></div>;

  return (
    <div className="flex-column">
      {/* Hero Header */}
      <section className="hero-wrapper">
        <div className="hero-content">
          <div className="badge badge-success" style={{ marginBottom: '16px' }}>
            Resource Pool
          </div>
          <h1 className="hero-title">认证文件云端仓库</h1>
          <p className="hero-subtitle">
            集中化管理所有上游供应商的认证凭证 (JSON)。支持多端同步、健康度监控与实时性能统计。
          </p>
          <div className="flex-row gap-md" style={{ marginTop: '32px' }}>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple hidden />
            <Button size="sm" onClick={handleUploadClick} loading={uploading}>
              <IconPlus size={14} /> 上传认证文件
            </Button>
            <Button variant="secondary" size="sm" onClick={loadFiles}>
              <IconRefreshCw size={14} /> 刷新同步
            </Button>
          </div>
        </div>
      </section>

      {/* Main Container */}
      <div style={{ padding: '0 40px 80px', marginTop: '-40px' }}>
        <div className="card card-glass">
          {/* Toolbar */}
          <div className="card-header" style={{ padding: '24px 32px' }}>
            <div className="flex-column gap-md" style={{ width: '100%' }}>
              <div className="flex-row justify-between items-center">
                <div className="flex-row gap-sm" style={{ flexWrap: 'wrap' }}>
                  {existingTypes.map(t => {
                    const active = filter === t;
                    const color = getTypeColor(t);
                    return (
                      <button 
                        key={t}
                        onClick={() => setFilter(t)}
                        style={{ 
                          border: `1px solid ${color.text}`,
                          background: active ? color.text : 'transparent',
                          color: active ? '#fff' : color.text,
                          padding: '4px 16px', borderRadius: '8px', 
                          fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        {t.toUpperCase()}
                      </button>
                    )
                  })}
                </div>
                <div className="flex-row gap-sm">
                   <Button variant="ghost" size="sm" onClick={() => setViewMode('grid')} style={{ padding: '8px', opacity: viewMode === 'grid' ? 1 : 0.4 }}>
                     <IconLayoutGrid size={18} />
                   </Button>
                   <Button variant="ghost" size="sm" onClick={() => setViewMode('list')} style={{ padding: '8px', opacity: viewMode === 'list' ? 1 : 0.4 }}>
                     <IconList size={18} />
                   </Button>
                </div>
              </div>
              <div className="flex-row items-center gap-md" style={{ position: 'relative' }}>
                <IconSearch size={16} style={{ position: 'absolute', left: '16px', color: 'var(--text-tertiary)' }} />
                <input 
                  className="input-premium" 
                  style={{ paddingLeft: '44px' }}
                  placeholder="搜索文件名、供应商或属性..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="card-body">
            {filtered.length === 0 ? (
               <div style={{ padding: '60px 0' }}>
                 <EmptyState title="未找到相关文件" description="尝试更换筛选条件或上传新文件" />
               </div>
            ) : viewMode === 'grid' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
                {filtered.map(f => {
                  const stats = resolveAuthFileStats(f, keyStats);
                  const color = getTypeColor(f.type || 'unknown');
                  return (
                    <div key={f.name} className="card-glass card-hover" style={{ padding: '24px', borderRadius: '20px', border: '1px solid var(--border-light)' }}>
                      <div className="flex-column gap-lg">
                        <div className="flex-row justify-between items-start">
                          <div className="badge" style={{ background: color.bg, color: color.text }}>{f.type}</div>
                          <div className="flex-row gap-xs">
                            <Button variant="ghost" size="sm" onClick={() => handleDownload(f.name)} style={{ padding: '6px' }}><IconDownload size={16}/></Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(f.name)} style={{ padding: '6px' }}><IconTrash2 size={16} style={{ color: 'var(--error-color)' }}/></Button>
                          </div>
                        </div>
                        <div>
                          <h4 className="text-primary" style={{ fontWeight: 800, fontSize: '16px', overflowWrap: 'break-word', wordBreak: 'break-all' }}>{f.name}</h4>
                          <p className="text-tertiary" style={{ fontSize: '12px', marginTop: '4px' }}>Size: {formatFileSize(f.size || 0)}</p>
                        </div>
                        <div className="flex-row gap-md" style={{ background: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: '12px' }}>
                          <div className="flex-column" style={{ flex: 1 }}>
                            <span style={{ fontSize: '18px', fontWeight: 900, color: 'var(--success-color)' }}>{stats.success}</span>
                            <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', opacity: 0.5 }}>Success</span>
                          </div>
                          <div style={{ width: '1px', background: 'var(--border-light)' }}></div>
                          <div className="flex-column" style={{ flex: 1 }}>
                            <span style={{ fontSize: '18px', fontWeight: 900, color: 'var(--error-color)' }}>{stats.failure}</span>
                            <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', opacity: 0.5 }}>Failure</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="modern-table-container">
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th>文件名 / 供应商</th>
                      <th>成功 / 失败</th>
                      <th>大小</th>
                      <th style={{ textAlign: 'right' }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(f => {
                      const stats = resolveAuthFileStats(f, keyStats);
                      const color = getTypeColor(f.type || 'unknown');
                      return (
                        <tr key={f.name}>
                          <td>
                            <div className="flex-row items-center gap-md">
                              <span className="badge" style={{ background: color.bg, color: color.text }}>{f.type}</span>
                              <span className="text-primary" style={{ fontWeight: 700 }}>{f.name}</span>
                            </div>
                          </td>
                          <td>
                            <div className="flex-row gap-sm items-center">
                              <span style={{ color: 'var(--success-color)', fontWeight: 800 }}>{stats.success}</span>
                              <span style={{ opacity: 0.2 }}>/</span>
                              <span style={{ color: 'var(--error-color)', fontWeight: 800 }}>{stats.failure}</span>
                            </div>
                          </td>
                          <td className="text-tertiary" style={{ fontSize: '13px' }}>{formatFileSize(f.size || 0)}</td>
                          <td>
                            <div className="flex-row justify-end gap-xs">
                              <Button variant="ghost" size="sm" onClick={() => handleDownload(f.name)} style={{ padding: '6px' }}><IconDownload size={16}/></Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(f.name)} style={{ padding: '6px' }}><IconTrash2 size={16} style={{ color: 'var(--error-color)' }}/></Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
