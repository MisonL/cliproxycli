import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconDownload,
  IconEyeOff,
  IconRefreshCw,
  IconSearch,
  IconTimer,
  IconTrash2,
} from '@/components/ui/icons';
import { useNotificationStore, useAuthStore } from '@/stores';
import { logsApi } from '@/services/api/logs';
import { MANAGEMENT_API_PREFIX } from '@/utils/constants';
import { formatUnixTimestamp } from '@/utils/format';

interface ErrorLogItem {
  name: string;
  size?: number;
  modified?: number;
}

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

// Keep buffer limit
const MAX_BUFFER_LINES = 10000;

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];
const HTTP_METHOD_REGEX = new RegExp(`\\b(${HTTP_METHODS.join('|')})\\b`);

const LOG_TIMESTAMP_REGEX = /^\[?(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)\]?/;
const LOG_LEVEL_REGEX = /^\[?(trace|debug|info|warn|warning|error|fatal)\]?(?=\s|\[|$)\s*/i;
const LOG_SOURCE_REGEX = /^\[([^\]]+)\]/;
const LOG_LATENCY_REGEX = /\b(\d+(?:\.\d+)?)(?:\s*)(µs|us|ms|s)\b/i;
const LOG_IPV4_REGEX = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
const LOG_IPV6_REGEX = /\b(?:[a-f0-9]{0,4}:){2,7}[a-f0-9]{0,4}\b/i;
const LOG_TIME_OF_DAY_REGEX = /^\d{1,2}:\d{2}:\d{2}(?:\.\d{1,3})?$/;
const GIN_TIMESTAMP_SEGMENT_REGEX =
  /^\[GIN\]\s+(\d{4})\/(\d{2})\/(\d{2})\s*-\s*(\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)\s*$/;

const HTTP_STATUS_PATTERNS: RegExp[] = [
  /\|\s*([1-5]\d{2})\s*\|/,
  /\b([1-5]\d{2})\s*-/,
  new RegExp(`\\b(?:${HTTP_METHODS.join('|')})\\s+\\S+\\s+([1-5]\\d{2})\\b`),
  /\b(?:status|code|http)[:\s]+([1-5]\d{2})\b/i,
  /\b([1-5]\d{2})\s+(?:OK|Created|Accepted|No Content|Moved|Found|Bad Request|Unauthorized|Forbidden|Not Found|Method Not Allowed|Internal Server Error|Bad Gateway|Service Unavailable|Gateway Timeout)\b/i,
];

const detectHttpStatusCode = (text: string): number | undefined => {
  for (const pattern of HTTP_STATUS_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const code = Number.parseInt(match[1], 10);
    if (!Number.isFinite(code)) continue;
    if (code >= 100 && code <= 599) return code;
  }
  return undefined;
};

const extractIp = (text: string): string | undefined => {
  const ipv4Match = text.match(LOG_IPV4_REGEX);
  if (ipv4Match) return ipv4Match[0];

  const ipv6Match = text.match(LOG_IPV6_REGEX);
  if (!ipv6Match) return undefined;

  const candidate = ipv6Match[0];

  // Avoid treating time strings like "12:34:56" as IPv6 addresses.
  if (LOG_TIME_OF_DAY_REGEX.test(candidate)) return undefined;

  // If no compression marker is present, a valid IPv6 address must contain 8 hextets.
  if (!candidate.includes('::') && candidate.split(':').length !== 8) return undefined;

  return candidate;
};

const normalizeTimestampToSeconds = (value: string): string => {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (!match) return trimmed;
  return `${match[1]} ${match[2]}`;
};

type ParsedLogLine = {
  raw: string;
  timestamp?: string;
  level?: LogLevel;
  source?: string;
  statusCode?: number;
  latency?: string;
  ip?: string;
  method?: HttpMethod;
  path?: string;
  message: string;
};

const extractLogLevel = (value: string): LogLevel | undefined => {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'warning') return 'warn';
  if (normalized === 'warn') return 'warn';
  if (normalized === 'info') return 'info';
  if (normalized === 'error') return 'error';
  if (normalized === 'fatal') return 'fatal';
  if (normalized === 'debug') return 'debug';
  if (normalized === 'trace') return 'trace';
  return undefined;
};

const inferLogLevel = (line: string): LogLevel | undefined => {
  const lowered = line.toLowerCase();
  if (/\bfatal\b/.test(lowered)) return 'fatal';
  if (/\berror\b/.test(lowered)) return 'error';
  if (/\bwarn(?:ing)?\b/.test(lowered) || line.includes('警告')) return 'warn';
  if (/\binfo\b/.test(lowered)) return 'info';
  if (/\bdebug\b/.test(lowered)) return 'debug';
  if (/\btrace\b/.test(lowered)) return 'trace';
  return undefined;
};

const extractHttpMethodAndPath = (text: string): { method?: HttpMethod; path?: string } => {
  const match = text.match(HTTP_METHOD_REGEX);
  if (!match) return {};

  const method = match[1] as HttpMethod;
  const index = match.index ?? 0;
  const after = text.slice(index + match[0].length).trim();
  const path = after ? after.split(/\s+/)[0] : undefined;
  return { method, path };
};

const parseLogLine = (raw: string): ParsedLogLine => {
  let remaining = raw.trim();

  let timestamp: string | undefined;
  const tsMatch = remaining.match(LOG_TIMESTAMP_REGEX);
  if (tsMatch) {
    timestamp = tsMatch[1];
    remaining = remaining.slice(tsMatch[0].length).trim();
  }

  let level: LogLevel | undefined;
  const lvlMatch = remaining.match(LOG_LEVEL_REGEX);
  if (lvlMatch) {
    level = extractLogLevel(lvlMatch[1]);
    remaining = remaining.slice(lvlMatch[0].length).trim();
  }

  let source: string | undefined;
  const sourceMatch = remaining.match(LOG_SOURCE_REGEX);
  if (sourceMatch) {
    source = sourceMatch[1];
    remaining = remaining.slice(sourceMatch[0].length).trim();
  }

  let statusCode: number | undefined;
  let latency: string | undefined;
  let ip: string | undefined;
  let method: HttpMethod | undefined;
  let path: string | undefined;
  let message = remaining;

  if (remaining.includes('|')) {
    const segments = remaining
      .split('|')
      .map((segment) => segment.trim())
      .filter(Boolean);
    const consumed = new Set<number>();

    const ginIndex = segments.findIndex((segment) => GIN_TIMESTAMP_SEGMENT_REGEX.test(segment));
    if (ginIndex >= 0) {
      const match = segments[ginIndex].match(GIN_TIMESTAMP_SEGMENT_REGEX);
      if (match) {
        const ginTimestamp = `${match[1]}-${match[2]}-${match[3]} ${match[4]}`;
        const normalizedGin = normalizeTimestampToSeconds(ginTimestamp);
        const normalizedParsed = timestamp ? normalizeTimestampToSeconds(timestamp) : undefined;

        if (!timestamp) {
          timestamp = ginTimestamp;
          consumed.add(ginIndex);
        } else if (normalizedParsed === normalizedGin) {
          consumed.add(ginIndex);
        }
      }
    }

    // status code
    const statusIndex = segments.findIndex((segment) => /^\d{3}\b/.test(segment));
    if (statusIndex >= 0) {
      const match = segments[statusIndex].match(/^(\d{3})\b/);
      if (match) {
        const code = Number.parseInt(match[1], 10);
        if (code >= 100 && code <= 599) {
          statusCode = code;
          consumed.add(statusIndex);
        }
      }
    }

    // latency
    const latencyIndex = segments.findIndex((segment) => LOG_LATENCY_REGEX.test(segment));
    if (latencyIndex >= 0) {
      const match = segments[latencyIndex].match(LOG_LATENCY_REGEX);
      if (match) {
        latency = `${match[1]}${match[2]}`;
        consumed.add(latencyIndex);
      }
    }

    // ip
    const ipIndex = segments.findIndex((segment) => Boolean(extractIp(segment)));
    if (ipIndex >= 0) {
      const extracted = extractIp(segments[ipIndex]);
      if (extracted) {
        ip = extracted;
        consumed.add(ipIndex);
      }
    }

    // method + path
    const methodIndex = segments.findIndex((segment) => {
      const { method: parsedMethod } = extractHttpMethodAndPath(segment);
      return Boolean(parsedMethod);
    });
    if (methodIndex >= 0) {
      const parsed = extractHttpMethodAndPath(segments[methodIndex]);
      method = parsed.method;
      path = parsed.path;
      consumed.add(methodIndex);
    }

    message = segments.filter((_, index) => !consumed.has(index)).join(' | ');
  } else {
    statusCode = detectHttpStatusCode(remaining);

    const latencyMatch = remaining.match(LOG_LATENCY_REGEX);
    if (latencyMatch) latency = `${latencyMatch[1]}${latencyMatch[2]}`;

    ip = extractIp(remaining);

    const parsed = extractHttpMethodAndPath(remaining);
    method = parsed.method;
    path = parsed.path;
  }

  if (!level) level = inferLogLevel(raw);

  if (message) {
    const match = message.match(GIN_TIMESTAMP_SEGMENT_REGEX);
    if (match) {
      const ginTimestamp = `${match[1]}-${match[2]}-${match[3]} ${match[4]}`;
      if (!timestamp) timestamp = ginTimestamp;
      if (normalizeTimestampToSeconds(timestamp) === normalizeTimestampToSeconds(ginTimestamp)) {
        message = '';
      }
    }
  }

  return {
    raw,
    timestamp,
    level,
    source,
    statusCode,
    latency,
    ip,
    method,
    path,
    message,
  };
};

const getErrorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err !== 'object' || err === null) return '';
  if (!('message' in err)) return '';

  const message = (err as { message?: unknown }).message;
  return typeof message === 'string' ? message : '';
};

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
};

export function LogsPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);

  const [logBuffer, setLogBuffer] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [hideManagementLogs, setHideManagementLogs] = useState(false);
  const [errorLogs, setErrorLogs] = useState<ErrorLogItem[]>([]);

  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // 保存最新时间戳用于增量获取
  const latestTimestampRef = useRef<number>(0);

  const disableControls = connectionStatus !== 'connected';

  const loadLogs = async (incremental: boolean = true) => {
    if (incremental && loading) return;

    if (!incremental) {
      setLoading(true);
    }

    try {
      const params =
        incremental && latestTimestampRef.current > 0 ? { after: latestTimestampRef.current } : {};
      const data = await logsApi.fetchLogs(params);

      // 更新时间戳
      if (data['latest-timestamp']) {
        latestTimestampRef.current = data['latest-timestamp'];
      }

      const newLines = Array.isArray(data.lines) ? data.lines : [];

      if (incremental && newLines.length > 0) {
        // 增量更新：追加新日志并限制缓冲区大小
        setLogBuffer((prev) => {
          const combined = [...prev, ...newLines];
          const dropCount = Math.max(combined.length - MAX_BUFFER_LINES, 0);
          return dropCount > 0 ? combined.slice(dropCount) : combined;
        });
      } else if (!incremental) {
        // 全量加载
        setLogBuffer(newLines.slice(-MAX_BUFFER_LINES));
      }
    } catch (err: unknown) {
      console.error('Failed to load logs:', err);
    } finally {
      if (!incremental) {
        setLoading(false);
      }
    }
  };

  const clearLogs = async () => {
    if (!window.confirm(t('logs.clear_confirm'))) return;
    try {
      await logsApi.clearLogs();
      setLogBuffer([]);
      latestTimestampRef.current = 0;
      showNotification(t('logs.clear_success'), 'success');
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      showNotification(
        `${t('notification.delete_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    }
  };

  const downloadLogs = () => {
    // ... download logs implementation ...
    const text = logBuffer.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'logs.txt';
    a.click();
    window.URL.revokeObjectURL(url);
    showNotification(t('logs.download_success'), 'success');
  };

  const loadErrorLogs = async () => {
    if (connectionStatus !== 'connected') {
      return;
    }

    try {
      const res = await logsApi.fetchErrorLogs();
      // API 返回 { files: [...] }
      setErrorLogs(Array.isArray(res.files) ? res.files : []);
    } catch (err: unknown) {
      console.error('Failed to load error logs:', err);
      // 静默失败,不影响主日志显示
      setErrorLogs([]);
    }
  };

  const downloadErrorLog = async (name: string) => {
    try {
      const response = await logsApi.downloadErrorLog(name);
      const blob = new Blob([response.data], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      window.URL.revokeObjectURL(url);
      showNotification(t('logs.error_log_download_success'), 'success');
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      showNotification(
        `${t('notification.download_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    }
  };

  useEffect(() => {
    if (connectionStatus === 'connected') {
      latestTimestampRef.current = 0;
      loadLogs(false);
      loadErrorLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionStatus]);

  useEffect(() => {
    if (!autoRefresh || connectionStatus !== 'connected') {
      return;
    }
    const id = window.setInterval(() => {
      loadLogs(true);
    }, 8000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, connectionStatus]);

  const trimmedSearchQuery = deferredSearchQuery.trim();

  const { filteredLines, removedCount } = useMemo(() => {
    let working = logBuffer;
    let removed = 0;

    if (hideManagementLogs) {
      const next: string[] = [];
      for (const line of working) {
        if (line.includes(MANAGEMENT_API_PREFIX)) {
          removed += 1;
        } else {
          next.push(line);
        }
      }
      working = next;
    }

    if (trimmedSearchQuery) {
      const queryLowered = trimmedSearchQuery.toLowerCase();
      const next: string[] = [];
      for (const line of working) {
        if (line.toLowerCase().includes(queryLowered)) {
          next.push(line);
        } else {
          removed += 1;
        }
      }
      working = next;
    }

    return { filteredLines: working, removedCount: removed };
  }, [logBuffer, hideManagementLogs, trimmedSearchQuery]);

  const copyLogLine = async (raw: string) => {
    const ok = await copyToClipboard(raw);
    if (ok) {
      showNotification(t('logs.copy_success', { defaultValue: 'Copied to clipboard' }), 'success');
    } else {
      showNotification(t('logs.copy_failed', { defaultValue: 'Copy failed' }), 'error');
    }
  };

  return (
    <div className="flex-column">
      <header className="hero-wrapper">
        <div className="hero-content flex-row justify-between items-center">
          <div className="flex-column gap-xs">
            <div className="badge badge-primary" style={{ marginBottom: '8px', width: 'fit-content' }}>
               Real-time Stream
            </div>
            <h1 className="hero-title">{t('logs.title')}</h1>
            <p className="hero-subtitle">{t('logs.description') || '系统运行轨迹，支持多维过滤、实时流监控与历史溯源。'}</p>
          </div>
          <div className="flex-row gap-md">
            <Button variant="secondary" onClick={() => loadLogs(false)} disabled={disableControls || loading} className="btn-glass" style={{ height: '48px', padding: '0 20px' }}>
              <IconRefreshCw size={18} className={loading ? 'animate-spin' : ''} /> <span style={{ marginLeft: '8px' }}>{t('logs.refresh_button')}</span>
            </Button>
            <Button onClick={downloadLogs} disabled={logBuffer.length === 0} className="btn-glass" style={{ height: '48px', padding: '0 20px' }}>
              <IconDownload size={18} /> <span style={{ marginLeft: '8px' }}>{t('logs.download_button')}</span>
            </Button>
            <Button variant="ghost" onClick={clearLogs} disabled={disableControls} className="text-error" style={{ height: '48px' }}>
              <IconTrash2 size={18} />
            </Button>
          </div>
        </div>
      </header>

      <div style={{ padding: '0 40px 80px', marginTop: '-40px' }} className="flex-column gap-xl">
        <div className="card-glass flex-column overflow-hidden" style={{ borderRadius: '24px', border: '1px solid var(--border-light)', minHeight: '600px' }}>
          {/* 日志筛选栏 */}
          <div className="flex-row justify-between items-center" style={{ padding: '20px 28px', background: 'linear-gradient(to right, rgba(var(--bg-primary-rgb), 0.6), rgba(var(--bg-primary-rgb), 0.2))', borderBottom: '1px solid var(--border-light)' }}>
            <div className="flex-row items-center gap-xl flex-1">
              <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                <Input
                   className="input-premium"
                   style={{ paddingLeft: '44px', width: '100%' }}
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                   placeholder={t('logs.search_placeholder')}
                />
                <IconSearch size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
              </div>

              <div className="flex-row items-center gap-md">
                <div className="flex-row items-center gap-sm card-glass" style={{ padding: '4px 12px', borderRadius: '12px', background: 'rgba(var(--bg-primary-rgb), 0.3)' }}>
                  <IconTimer size={16} style={{ color: 'var(--primary-color)' }} />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>{t('logs.auto_refresh')}</span>
                  <ToggleSwitch checked={autoRefresh} onChange={setAutoRefresh} disabled={disableControls} />
                </div>

                <div className="flex-row items-center gap-sm card-glass" style={{ padding: '4px 12px', borderRadius: '12px', background: 'rgba(var(--bg-primary-rgb), 0.3)' }}>
                  <IconEyeOff size={16} style={{ color: 'var(--text-tertiary)' }} />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>{t('logs.hide_management_logs', { prefix: 'API' })}</span>
                  <ToggleSwitch checked={hideManagementLogs} onChange={setHideManagementLogs} />
                </div>
              </div>
            </div>

            <div className="flex-row items-center gap-md ml-xl">
               <div className="flex-column items-end">
                 <span style={{ fontSize: '15px', fontWeight: 900, color: 'var(--primary-color)' }}>{filteredLines.length}</span>
                 <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Lines</span>
               </div>
               {removedCount > 0 && (
                 <>
                   <div style={{ width: '1px', height: '24px', background: 'var(--border-light)' }} />
                   <div className="flex-column items-end">
                     <span style={{ fontSize: '15px', fontWeight: 900, color: 'var(--text-tertiary)' }}>{removedCount}</span>
                     <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Hidden</span>
                   </div>
                 </>
               )}
            </div>
          </div>

          {/* 日志显示区 */}
          <div style={{ flex: 1, position: 'relative', background: 'rgba(0,0,0,0.02)' }}>
            {loading ? (
              <div className="flex-center" style={{ height: '500px' }}>
                <LoadingSpinner />
              </div>
            ) : logBuffer.length > 0 && filteredLines.length > 0 ? (
              <Virtuoso
                ref={virtuosoRef}
                data={filteredLines}
                style={{ height: '600px' }}
                followOutput="auto"
                itemContent={(_, rawLine) => {
                  const line = parseLogLine(rawLine);
                  let levelColor = 'var(--text-tertiary)';
                  let rowBg = 'transparent';
                  if (line.level === 'warn') {
                    levelColor = 'var(--warning-color)';
                    rowBg = 'rgba(var(--warning-color-rgb), 0.03)';
                  }
                  if (line.level === 'error' || line.level === 'fatal') {
                    levelColor = 'var(--error-color)';
                    rowBg = 'rgba(var(--error-color-rgb), 0.05)';
                  }

                  return (
                    <div
                      className="log-row flex-row gap-lg"
                      style={{ 
                        padding: '12px 28px', 
                        borderBottom: '1px solid var(--border-light)', 
                        background: rowBg,
                        fontFamily: 'var(--font-mono)',
                        fontSize: '13px',
                        cursor: 'pointer',
                        transition: 'background 0.2s'
                      }}
                      onDoubleClick={() => copyLogLine(line.raw)}
                    >
                      <div style={{ width: '160px', flexShrink: 0, color: 'var(--text-tertiary)', fontSize: '12px', fontWeight: 500 }}>
                        {line.timestamp || ''}
                      </div>
                      
                      <div className="flex-column gap-xs flex-1 min-w-0">
                        <div className="flex-row items-center gap-md flex-wrap">
                          {line.level && (
                            <span className="badge" style={{ 
                              fontSize: '10px', 
                              color: levelColor, 
                              background: `rgba(${levelColor === 'var(--text-tertiary)' ? 'var(--text-tertiary-rgb)' : (levelColor === 'var(--warning-color)' ? 'var(--warning-color-rgb)' : 'var(--error-color-rgb)')}, 0.1)`,
                              border: 'none',
                              padding: '2px 8px'
                            }}>
                              {line.level.toUpperCase()}
                            </span>
                          )}

                          {line.source && (
                            <span style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>[{line.source}]</span>
                          )}

                          {typeof line.statusCode === 'number' && (
                            <span className="badge" style={{ 
                              fontSize: '10px',
                              background: line.statusCode < 400 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                              color: line.statusCode < 400 ? 'var(--success-color)' : 'var(--error-color)',
                              border: 'none'
                            }}>
                              {line.statusCode}
                            </span>
                          )}

                          {line.method && (
                            <span style={{ fontWeight: 900, color: 'var(--primary-color)', fontSize: '11px' }}>{line.method}</span>
                          )}

                          {line.path && (
                            <span style={{ color: 'var(--text-primary)', fontWeight: 700, letterSpacing: '-0.01em' }}>{line.path}</span>
                          )}

                          {line.latency && (
                            <span className="badge badge-secondary" style={{ fontSize: '10px' }}>{line.latency}</span>
                          )}
                        </div>
                        
                        {line.message && (
                          <div style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6 }}>
                            {line.message}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }}
              />
            ) : (
              <div className="flex-center" style={{ height: '500px' }}>
                <EmptyState title={t('logs.empty_title')} description={t('logs.empty_desc')} />
              </div>
            )}
          </div>
        </div>

        {/* 错误日志归档 */}
        <div className="flex-column gap-lg mt-xl">
           <div className="flex-row items-center gap-md">
            <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error-color)' }}>
              <IconEyeOff size={20} />
            </div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>{t('logs.error_logs_modal_title')}</h2>
          </div>

          <div className="grid cols-3" style={{ gap: '20px' }}>
            {errorLogs.map((item) => (
              <div key={item.name} className="card-glass flex-column gap-md card-hover" style={{ padding: '24px', borderRadius: '20px' }}>
                <div className="flex-row justify-between items-start">
                  <div className="flex-column gap-xs">
                    <span style={{ fontSize: '15px', fontWeight: 850, color: 'var(--text-primary)' }}>{item.name}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{item.modified ? formatUnixTimestamp(item.modified) : 'Unknown Date'}</span>
                  </div>
                  <div className="badge badge-secondary">{item.size ? `${(item.size / 1024).toFixed(1)} KB` : '0 KB'}</div>
                </div>
                <Button variant="secondary" onClick={() => downloadErrorLog(item.name)} className="btn-glass" style={{ width: '100%', height: '40px' }}>
                   <IconDownload size={14} /> <span style={{ marginLeft: '8px' }}>{t('logs.error_logs_download')}</span>
                </Button>
              </div>
            ))}
            {errorLogs.length === 0 && (
              <div className="card-glass flex-center" style={{ padding: '40px', gridColumn: 'span 3', borderRadius: '20px', color: 'var(--text-tertiary)' }}>
                {t('logs.error_logs_empty')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
