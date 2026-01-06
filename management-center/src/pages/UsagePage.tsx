import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions
} from 'chart.js';
import { Line } from 'react-chartjs-2';
// import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { IconDiamond, IconDollarSign, IconPlus, IconRefreshCw, IconSatellite, IconTimer, IconTrendingUp, IconChartBar } from '@/components/ui/icons';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useThemeStore } from '@/stores';
import { usageApi } from '@/services/api/usage';
import {
  formatTokensInMillions,
  formatPerMinuteValue,
  formatUsd,
  calculateTokenBreakdown,
  calculateRecentPerMinuteRates,
  calculateTotalCost,
  getModelNamesFromUsage,
  getApiStats,
  getModelStats,
  loadModelPrices,
  saveModelPrices,
  buildChartData,
  collectUsageDetails,
  extractTotalTokens,
  type ModelPrice
} from '@/utils/usage';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface UsagePayload {
  total_requests?: number;
  success_count?: number;
  failure_count?: number;
  total_tokens?: number;
  apis?: Record<string, unknown>;
  [key: string]: unknown;
}

export function UsagePage() {
  const { t } = useTranslation();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';

  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modelPrices, setModelPrices] = useState<Record<string, ModelPrice>>({});

  // Model price form state
  const [selectedModel, setSelectedModel] = useState('');
  const [promptPrice, setPromptPrice] = useState('');
  const [completionPrice, setCompletionPrice] = useState('');
  const [cachePrice, setCachePrice] = useState('');

  // Expanded sections
  const [expandedApis, setExpandedApis] = useState<Set<string>>(new Set());

  // Chart state
  const [requestsPeriod, setRequestsPeriod] = useState<'hour' | 'day'>('day');
  const [tokensPeriod, setTokensPeriod] = useState<'hour' | 'day'>('day');
  const [chartLines, setChartLines] = useState<string[]>(['all']);
  const MAX_CHART_LINES = 9;

  const loadUsage = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = (await usageApi.getUsage()) as Record<string, unknown>;
      const payload = (data?.usage || data) as UsagePayload;
      setUsage(payload);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('usage_stats.loading_error');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadUsage();
    setModelPrices(loadModelPrices());
  }, [loadUsage]);

  // Calculate derived data
  const tokenBreakdown = usage ? calculateTokenBreakdown(usage) : { cachedTokens: 0, reasoningTokens: 0 };
  const rateStats = usage
    ? calculateRecentPerMinuteRates(30, usage)
    : { rpm: 0, tpm: 0, windowMinutes: 30, requestCount: 0, tokenCount: 0 };
  const totalCost = usage ? calculateTotalCost(usage, modelPrices) : 0;
  const modelNames = usage ? getModelNamesFromUsage(usage) : [];
  const apiStats = usage ? getApiStats(usage, modelPrices) : [];
  const modelStats = usage ? getModelStats(usage, modelPrices) : [];
  const hasPrices = Object.keys(modelPrices).length > 0;

  // Build chart data
  const requestsChartData = useMemo(() => {
    if (!usage) return { labels: [], datasets: [] };
    return buildChartData(usage, requestsPeriod, 'requests', chartLines);
  }, [usage, requestsPeriod, chartLines]);

  const tokensChartData = useMemo(() => {
    if (!usage) return { labels: [], datasets: [] };
    return buildChartData(usage, tokensPeriod, 'tokens', chartLines);
  }, [usage, tokensPeriod, chartLines]);

  const sparklineOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
      elements: { line: { tension: 0.45 }, point: { radius: 0 } }
    }),
    []
  );

  const buildLastHourSeries = useCallback(
    (metric: 'requests' | 'tokens'): { labels: string[]; data: number[] } => {
      if (!usage) return { labels: [], data: [] };
      const details = collectUsageDetails(usage);
      if (!details.length) return { labels: [], data: [] };

      const windowMinutes = 60;
      const now = Date.now();
      const windowStart = now - windowMinutes * 60 * 1000;
      const buckets = new Array(windowMinutes).fill(0);

      details.forEach(detail => {
        const timestamp = Date.parse(detail.timestamp);
        if (Number.isNaN(timestamp) || timestamp < windowStart) {
          return;
        }
        const minuteIndex = Math.min(
          windowMinutes - 1,
          Math.floor((timestamp - windowStart) / 60000)
        );
        const increment = metric === 'tokens' ? extractTotalTokens(detail) : 1;
        buckets[minuteIndex] += increment;
      });

      const labels = buckets.map((_, idx) => {
        const date = new Date(windowStart + (idx + 1) * 60000);
        const h = date.getHours().toString().padStart(2, '0');
        const m = date.getMinutes().toString().padStart(2, '0');
        return `${h}:${m}`;
      });

      return { labels, data: buckets };
    },
    [usage]
  );

  const buildSparkline = useCallback(
    (series: { labels: string[]; data: number[] }, color: string, backgroundColor: string) => {
      if (loading || !series?.data?.length) {
        return null;
      }
      const sliceStart = Math.max(series.data.length - 60, 0);
      const labels = series.labels.slice(sliceStart);
      const points = series.data.slice(sliceStart);
      return {
        data: {
          labels,
          datasets: [
            {
              data: points,
              borderColor: color,
              backgroundColor,
              fill: true,
              tension: 0.45,
              pointRadius: 0,
              borderWidth: 2
            }
          ]
        }
      };
    },
    [loading]
  );

  const requestsSparkline = useMemo(
    () => buildSparkline(buildLastHourSeries('requests'), '#3b82f6', 'rgba(59, 130, 246, 0.18)'),
    [buildLastHourSeries, buildSparkline]
  );
  const tokensSparkline = useMemo(
    () => buildSparkline(buildLastHourSeries('tokens'), '#8b5cf6', 'rgba(139, 92, 246, 0.18)'),
    [buildLastHourSeries, buildSparkline]
  );
  const rpmSparkline = useMemo(
    () => buildSparkline(buildLastHourSeries('requests'), '#22c55e', 'rgba(34, 197, 94, 0.18)'),
    [buildLastHourSeries, buildSparkline]
  );
  const tpmSparkline = useMemo(
    () => buildSparkline(buildLastHourSeries('tokens'), '#f97316', 'rgba(249, 115, 22, 0.18)'),
    [buildLastHourSeries, buildSparkline]
  );
  const costSparkline = useMemo(
    () => buildSparkline(buildLastHourSeries('tokens'), '#f59e0b', 'rgba(245, 158, 11, 0.18)'),
    [buildLastHourSeries, buildSparkline]
  );

  const buildChartOptions = useCallback(
    (period: 'hour' | 'day', labels: string[]): ChartOptions<'line'> => {
      const pointRadius = isMobile && period === 'hour' ? 0 : isMobile ? 2 : 4;
      const tickFontSize = isMobile ? 10 : 12;
      const maxTickLabelCount = isMobile ? (period === 'hour' ? 8 : 6) : period === 'hour' ? 12 : 10;
      const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(17, 24, 39, 0.06)';
      const axisBorderColor = isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(17, 24, 39, 0.10)';
      const tickColor = isDark ? 'rgba(255, 255, 255, 0.72)' : 'rgba(17, 24, 39, 0.72)';
      const tooltipBg = isDark ? 'rgba(17, 24, 39, 0.92)' : 'rgba(255, 255, 255, 0.98)';
      const tooltipTitle = isDark ? '#ffffff' : '#111827';
      const tooltipBody = isDark ? 'rgba(255, 255, 255, 0.86)' : '#374151';
      const tooltipBorder = isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(17, 24, 39, 0.10)';

      return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: tooltipBg,
            titleColor: tooltipTitle,
            bodyColor: tooltipBody,
            borderColor: tooltipBorder,
            borderWidth: 1,
            padding: 10,
            displayColors: true,
            usePointStyle: true
          }
        },
        scales: {
          x: {
            grid: {
              color: gridColor,
              drawTicks: false
            },
            border: {
              color: axisBorderColor
            },
            ticks: {
              color: tickColor,
              font: { size: tickFontSize },
              maxRotation: isMobile ? 0 : 45,
              minRotation: isMobile ? 0 : 0,
              autoSkip: true,
              maxTicksLimit: maxTickLabelCount,
              callback: (value) => {
                const index = typeof value === 'number' ? value : Number(value);
                const raw =
                  Number.isFinite(index) && labels[index] ? labels[index] : typeof value === 'string' ? value : '';

                if (period === 'hour') {
                  const [md, time] = raw.split(' ');
                  if (!time) return raw;
                  if (time.startsWith('00:')) {
                    return md ? [md, time] : time;
                  }
                  return time;
                }

                if (isMobile) {
                  const parts = raw.split('-');
                  if (parts.length === 3) {
                    return `${parts[1]}-${parts[2]}`;
                  }
                }
                return raw;
              }
            }
          },
          y: {
            beginAtZero: true,
            grid: {
              color: gridColor
            },
            border: {
              color: axisBorderColor
            },
            ticks: {
              color: tickColor,
              font: { size: tickFontSize }
            }
          }
        },
        elements: {
          line: {
            tension: 0.35,
            borderWidth: isMobile ? 1.5 : 2
          },
          point: {
            borderWidth: 2,
            radius: pointRadius,
            hoverRadius: 4
          }
        }
      };
    },
    [isDark, isMobile]
  );

  const requestsChartOptions = useMemo(
    () => buildChartOptions(requestsPeriod, requestsChartData.labels),
    [buildChartOptions, requestsPeriod, requestsChartData.labels]
  );

  const tokensChartOptions = useMemo(
    () => buildChartOptions(tokensPeriod, tokensChartData.labels),
    [buildChartOptions, tokensPeriod, tokensChartData.labels]
  );

  const getHourChartMinWidth = useCallback(
    (labelCount: number) => {
      if (!isMobile || labelCount <= 0) return undefined;
      // 24 小时标签在移动端需要更宽的画布，避免 X 轴与点位过度挤压
      const perPoint = 56;
      const minWidth = Math.min(labelCount * perPoint, 3000);
      return `${minWidth}px`;
    },
    [isMobile]
  );

  // Chart line management
  const handleAddChartLine = () => {
    if (chartLines.length >= MAX_CHART_LINES) return;
    const unusedModel = modelNames.find(m => !chartLines.includes(m));
    if (unusedModel) {
      setChartLines([...chartLines, unusedModel]);
    } else {
      setChartLines([...chartLines, 'all']);
    }
  };

  const handleRemoveChartLine = (index: number) => {
    if (chartLines.length <= 1) return;
    const newLines = [...chartLines];
    newLines.splice(index, 1);
    setChartLines(newLines);
  };

  const handleChartLineChange = (index: number, value: string) => {
    const newLines = [...chartLines];
    newLines[index] = value;
    setChartLines(newLines);
  };

  // Handle model price save
  const handleSavePrice = () => {
    if (!selectedModel) return;
    const prompt = parseFloat(promptPrice) || 0;
    const completion = parseFloat(completionPrice) || 0;
    const cache = cachePrice.trim() === '' ? prompt : parseFloat(cachePrice) || 0;
    const newPrices = { ...modelPrices, [selectedModel]: { prompt, completion, cache } };
    setModelPrices(newPrices);
    saveModelPrices(newPrices);
    setSelectedModel('');
    setPromptPrice('');
    setCompletionPrice('');
    setCachePrice('');
  };

  // Handle model price delete
  const handleDeletePrice = (model: string) => {
    const newPrices = { ...modelPrices };
    delete newPrices[model];
    setModelPrices(newPrices);
    saveModelPrices(newPrices);
  };

  // Handle edit price
  const handleEditPrice = (model: string) => {
    const price = modelPrices[model];
    setSelectedModel(model);
    setPromptPrice(price?.prompt?.toString() || '');
    setCompletionPrice(price?.completion?.toString() || '');
    setCachePrice(price?.cache?.toString() || '');
  };

  // Toggle API expansion
  const toggleApiExpand = (endpoint: string) => {
    setExpandedApis(prev => {
      const newSet = new Set(prev);
      if (newSet.has(endpoint)) {
        newSet.delete(endpoint);
      } else {
        newSet.add(endpoint);
      }
      return newSet;
    });
  };

  const statsCards = [
    {
      key: 'requests',
      label: t('usage_stats.total_requests'),
      icon: <IconSatellite size={16} />,
      accent: '#3b82f6',
      accentSoft: 'rgba(59, 130, 246, 0.18)',
      accentBorder: 'rgba(59, 130, 246, 0.35)',
      value: loading ? '-' : (usage?.total_requests ?? 0).toLocaleString(),
      meta: (
        <>
          <span className={"flex-row items-center gap-xs"}>
            <span className={"stat-meta-dot"} style={{ backgroundColor: '#10b981' }} />
            {t('usage_stats.success_requests')}: {loading ? '-' : (usage?.success_count ?? 0)}
          </span>
          <span className={"flex-row items-center gap-xs"}>
            <span className={"stat-meta-dot"} style={{ backgroundColor: '#ef4444' }} />
            {t('usage_stats.failed_requests')}: {loading ? '-' : (usage?.failure_count ?? 0)}
          </span>
        </>
      ),
      trend: requestsSparkline
    },
    {
      key: 'tokens',
      label: t('usage_stats.total_tokens'),
      icon: <IconDiamond size={16} />,
      accent: '#8b5cf6',
      accentSoft: 'rgba(139, 92, 246, 0.18)',
      accentBorder: 'rgba(139, 92, 246, 0.35)',
      value: loading ? '-' : formatTokensInMillions(usage?.total_tokens ?? 0),
      meta: (
        <>
          <span className={"flex-row items-center gap-xs"}>
            {t('usage_stats.cached_tokens')}: {loading ? '-' : formatTokensInMillions(tokenBreakdown.cachedTokens)}
          </span>
          <span className={"flex-row items-center gap-xs"}>
            {t('usage_stats.reasoning_tokens')}: {loading ? '-' : formatTokensInMillions(tokenBreakdown.reasoningTokens)}
          </span>
        </>
      ),
      trend: tokensSparkline
    },
    {
      key: 'rpm',
      label: t('usage_stats.rpm_30m'),
      icon: <IconTimer size={16} />,
      accent: '#22c55e',
      accentSoft: 'rgba(34, 197, 94, 0.18)',
      accentBorder: 'rgba(34, 197, 94, 0.32)',
      value: loading ? '-' : formatPerMinuteValue(rateStats.rpm),
      meta: (
        <span className={"flex-row items-center gap-xs"}>
          {t('usage_stats.total_requests')}: {loading ? '-' : rateStats.requestCount.toLocaleString()}
        </span>
      ),
      trend: rpmSparkline
    },
    {
      key: 'tpm',
      label: t('usage_stats.tpm_30m'),
      icon: <IconTrendingUp size={16} />,
      accent: '#f97316',
      accentSoft: 'rgba(249, 115, 22, 0.18)',
      accentBorder: 'rgba(249, 115, 22, 0.32)',
      value: loading ? '-' : formatPerMinuteValue(rateStats.tpm),
      meta: (
        <span className={"flex-row items-center gap-xs"}>
          {t('usage_stats.total_tokens')}: {loading ? '-' : formatTokensInMillions(rateStats.tokenCount)}
        </span>
      ),
      trend: tpmSparkline
    },
    {
      key: 'cost',
      label: t('usage_stats.total_cost'),
      icon: <IconDollarSign size={16} />,
      accent: '#f59e0b',
      accentSoft: 'rgba(245, 158, 11, 0.18)',
      accentBorder: 'rgba(245, 158, 11, 0.32)',
      value: loading ? '-' : hasPrices ? formatUsd(totalCost) : '--',
      meta: (
        <>
          <span className={"flex-row items-center gap-xs"}>
            {t('usage_stats.total_tokens')}: {loading ? '-' : formatTokensInMillions(usage?.total_tokens ?? 0)}
          </span>
          {!hasPrices && (
            <span className={`${"flex-row items-center gap-xs"} ${"text-tertiary"}`}>
              {t('usage_stats.cost_need_price')}
            </span>
          )}
        </>
      ),
      trend: hasPrices ? costSparkline : null
    }
  ];

  return (
    <div className="flex-column">
      {loading && !usage && (
        <div className="loading-overlay" aria-busy="true">
          <div className="flex-column items-center gap-md">
            <LoadingSpinner size={28} />
            <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}>{t('common.loading')}</span>
          </div>
        </div>
      )}

      {/* Hero Header Section */}
      <header className="hero-wrapper">
        <div className="hero-content flex-row justify-between items-center">
          <div className="flex-column gap-xs">
            <div className="badge badge-primary" style={{ marginBottom: '8px', width: 'fit-content' }}>
               Resource Dashboard
            </div>
            <h1 className="hero-title">{t('usage_stats.title')}</h1>
            <p className="hero-subtitle">{t('usage_stats.subtitle', { defaultValue: '实时追踪您的 API 资源消耗与成本明细，辅助智能决策。' })}</p>
          </div>
          <Button
            variant="secondary"
            onClick={loadUsage}
            disabled={loading}
            className="btn-glass"
            style={{ height: '48px', padding: '0 24px' }}
          >
            {loading ? (
              <div className="flex-row items-center gap-sm">
                <LoadingSpinner size={16} /> <span style={{ fontSize: '14px' }}>{t('common.loading')}</span>
              </div>
            ) : (
              <div className="flex-row items-center gap-sm">
                <IconRefreshCw size={18} /> <span style={{ fontSize: '14px', fontWeight: 700 }}>{t('usage_stats.refresh')}</span>
              </div>
            )}
          </Button>
        </div>
      </header>

      <div style={{ padding: '0 40px 80px', marginTop: '-40px' }}>
        <div className="card card-glass">
          <div className="card-body" style={{ padding: '32px' }}>
            <div className="flex-column gap-xl">
        {error && (
          <div className="card-glass border-error" style={{ padding: '16px 24px' }}>
            <span className="text-error" style={{ fontWeight: 600 }}>{error}</span>
          </div>
        )}

        {/* Stats Overview Cards */}
        <div className="grid cols-5" style={{ gap: '20px' }}>
          {statsCards.map(card => (
            <div
              key={card.key}
              className="card-glass flex-column"
              style={
                {
                  padding: '24px',
                  borderRadius: '24px',
                  position: 'relative',
                  overflow: 'hidden',
                  '--accent': card.accent,
                  '--accent-soft': card.accentSoft,
                  border: '1px solid var(--border-color)',
                  boxShadow: '0 8px 32px -4px rgba(0,0,0,0.1)'
                } as React.CSSProperties
              }
            >
              <div className="flex-row justify-between items-start mb-md">
                <div className="flex-column">
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{card.label}</span>
                  <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '4px', color: 'var(--text-primary)' }}>{card.value}</div>
                </div>
                <div
                  className="flex-center"
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: card.accentSoft,
                    color: card.accent,
                    boxShadow: `0 0 20px -5px ${card.accent}`
                  }}
                >
                  {card.icon}
                </div>
              </div>

              {card.meta && (
                <div className="flex-column gap-xs mb-lg pt-sm" style={{ borderTop: '1px solid var(--border-color)', fontSize: '12px' }}>
                  {card.meta}
                </div>
              )}

              <div style={{ height: '40px', marginTop: 'auto', marginBottom: '-10px', marginLeft: '-24px', marginRight: '-24px' }}>
                {card.trend && <Line data={card.trend.data} options={sparklineOptions} />}
              </div>
            </div>
          ))}
        </div>

        {/* Chart Line Selection */}
        <div className="card-glass" style={{ padding: '24px' }}>
          <div className="flex-row justify-between items-center mb-lg">
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>{t('usage_stats.chart_line_actions_label')}</h3>
            <div className="flex-row items-center gap-md">
              <span className="badge badge-secondary" style={{ fontSize: '12px' }}>
                {chartLines.length}/{MAX_CHART_LINES}
              </span>
              <Button
                variant="primary"
                size="sm"
                onClick={handleAddChartLine}
                disabled={chartLines.length >= MAX_CHART_LINES}
                className="btn-glass"
              >
                <IconPlus size={16} style={{ marginRight: '6px' }} />
                {t('usage_stats.chart_line_add')}
              </Button>
            </div>
          </div>
          <div className="grid cols-3" style={{ gap: '16px' }}>
            {chartLines.map((line, index) => (
              <div key={index} className="flex-row items-center gap-md p-sm rounded-lg" style={{ background: 'rgba(var(--bg-primary-rgb), 0.3)', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', minWidth: '60px' }}>
                   Line {index + 1}
                </span>
                <select
                  value={line}
                  onChange={(e) => handleChartLineChange(index, e.target.value)}
                  className="input-premium flex-1"
                  style={{ height: '36px', padding: '0 12px' }}
                >
                  <option value="all">{t('usage_stats.chart_line_all')}</option>
                  {modelNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                {chartLines.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveChartLine(index)}
                    className="text-error"
                    style={{ padding: '4px' }}
                  >
                    <IconTimer size={14} style={{ transform: 'rotate(45deg)' }} />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <p style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
            {t('usage_stats.chart_line_hint')}
          </p>
        </div>

        <div className="grid cols-2" style={{ gap: '24px' }}>
          {/* Requests Chart */}
          <div className="card-glass" style={{ padding: '24px' }}>
            <div className="flex-row justify-between items-center mb-xl">
              <div className="flex-row items-center gap-md">
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, rgba(var(--primary-color-rgb), 0.2) 0%, rgba(var(--primary-color-rgb), 0.05) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <IconSatellite size={18} style={{ color: 'var(--primary-color)' }} />
                </div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>{t('usage_stats.requests_trend')}</h3>
              </div>
              <div className="flex-row bg-secondary p-xs rounded-lg" style={{ background: 'rgba(var(--bg-primary-rgb), 0.5)', padding: '4px', border: '1px solid var(--border-color)' }}>
                <Button
                  variant={requestsPeriod === 'hour' ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setRequestsPeriod('hour')}
                  style={{ borderRadius: '6px' }}
                >
                  {t('usage_stats.by_hour')}
                </Button>
                <Button
                  variant={requestsPeriod === 'day' ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setRequestsPeriod('day')}
                  style={{ borderRadius: '6px' }}
                >
                  {t('usage_stats.by_day')}
                </Button>
              </div>
            </div>
            
            {loading ? (
              <div className="flex-center" style={{ height: '320px', color: 'var(--text-tertiary)' }}>{t('common.loading')}</div>
            ) : requestsChartData.labels.length > 0 ? (
              <div className="flex-column gap-md">
                <div className="flex-row flex-wrap gap-md" style={{ marginBottom: '8px' }}>
                  {requestsChartData.datasets.map((dataset, index) => (
                    <div key={index} className="flex-row items-center gap-xs">
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: dataset.borderColor as string }} />
                      <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)' }}>{dataset.label}</span>
                    </div>
                  ))}
                </div>
                <div style={{ height: '320px', position: 'relative' }}>
                  <div style={{ height: '100%', overflowX: 'auto', overflowY: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        minWidth: requestsPeriod === 'hour' ? getHourChartMinWidth(requestsChartData.labels.length) : '100%'
                      }}
                    >
                      <Line data={requestsChartData} options={requestsChartOptions} />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-center" style={{ height: '320px', color: 'var(--text-tertiary)' }}>{t('usage_stats.no_data')}</div>
            )}
          </div>

          {/* Tokens Chart */}
          <div className="card-glass" style={{ padding: '24px' }}>
            <div className="flex-row justify-between items-center mb-xl">
               <div className="flex-row items-center gap-md">
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, rgba(var(--primary-color-rgb), 0.2) 0%, rgba(var(--primary-color-rgb), 0.05) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <IconDiamond size={18} style={{ color: 'var(--primary-color)' }} />
                </div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>{t('usage_stats.tokens_trend')}</h3>
              </div>
              <div className="flex-row bg-secondary p-xs rounded-lg" style={{ background: 'rgba(var(--bg-primary-rgb), 0.5)', padding: '4px', border: '1px solid var(--border-color)' }}>
                <Button
                  variant={tokensPeriod === 'hour' ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setTokensPeriod('hour')}
                  style={{ borderRadius: '6px' }}
                >
                  {t('usage_stats.by_hour')}
                </Button>
                <Button
                  variant={tokensPeriod === 'day' ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setTokensPeriod('day')}
                  style={{ borderRadius: '6px' }}
                >
                  {t('usage_stats.by_day')}
                </Button>
              </div>
            </div>
            
            {loading ? (
              <div className="flex-center" style={{ height: '320px', color: 'var(--text-tertiary)' }}>{t('common.loading')}</div>
            ) : tokensChartData.labels.length > 0 ? (
              <div className="flex-column gap-md">
                <div className="flex-row flex-wrap gap-md" style={{ marginBottom: '8px' }}>
                  {tokensChartData.datasets.map((dataset, index) => (
                    <div key={index} className="flex-row items-center gap-xs">
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: dataset.borderColor as string }} />
                      <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)' }}>{dataset.label}</span>
                    </div>
                  ))}
                </div>
                <div style={{ height: '320px', position: 'relative' }}>
                  <div style={{ height: '100%', overflowX: 'auto', overflowY: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        minWidth: tokensPeriod === 'hour' ? getHourChartMinWidth(tokensChartData.labels.length) : '100%'
                      }}
                    >
                      <Line data={tokensChartData} options={tokensChartOptions} />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-center" style={{ height: '320px', color: 'var(--text-tertiary)' }}>{t('usage_stats.no_data')}</div>
            )}
          </div>
        </div>

        <div className="grid cols-2" style={{ gap: '24px' }}>
          {/* API Key Statistics */}
          <div className="card-glass" style={{ padding: '24px' }}>
            <div className="flex-row items-center gap-md mb-lg">
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, rgba(var(--primary-color-rgb), 0.2) 0%, rgba(var(--primary-color-rgb), 0.05) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <IconChartBar size={18} style={{ color: 'var(--primary-color)' }} />
                </div>
               <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>{t('usage_stats.api_details')}</h3>
            </div>
            {loading ? (
              <div className="flex-center" style={{ padding: '40px', color: 'var(--text-tertiary)' }}>{t('common.loading')}</div>
            ) : apiStats.length > 0 ? (
              <div className="flex-column gap-md">
                {apiStats.map((api) => (
                  <div key={api.endpoint} className="card-glass" style={{ padding: '16px', border: '1px solid var(--border-color)', background: 'rgba(var(--bg-primary-rgb), 0.3)' }}>
                    <div
                      className="flex-row justify-between items-center"
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleApiExpand(api.endpoint)}
                    >
                      <div className="flex-column gap-sm">
                        <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>{api.endpoint}</span>
                        <div className="flex-row flex-wrap gap-sm">
                          <span className="badge badge-primary" style={{ fontSize: '10px' }}>
                            {t('usage_stats.requests_count')}: {api.totalRequests}
                          </span>
                          <span className="badge badge-secondary" style={{ fontSize: '10px' }}>
                            Tokens: {formatTokensInMillions(api.totalTokens)}
                          </span>
                          {hasPrices && api.totalCost > 0 && (
                            <span className="badge badge-success" style={{ fontSize: '10px' }}>
                              {t('usage_stats.total_cost')}: {formatUsd(api.totalCost)}
                            </span>
                          )}
                        </div>
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                        {expandedApis.has(api.endpoint) ? <IconTimer size={14} style={{ transform: 'rotate(180deg)' }} /> : <IconTimer size={14} />}
                      </span>
                    </div>
                    {expandedApis.has(api.endpoint) && (
                      <div className="mt-md pt-md" style={{ borderTop: '1px solid var(--border-color)' }}>
                        {Object.entries(api.models).map(([model, stats]) => (
                          <div key={model} className="flex-row justify-between items-center py-xs" style={{ fontSize: '13px' }}>
                            <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{model}</span>
                            <div className="flex-row gap-md">
                              <span style={{ color: 'var(--text-secondary)' }}>{stats.requests} {t('usage_stats.requests_count')}</span>
                              <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{formatTokensInMillions(stats.tokens)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-center" style={{ padding: '40px', color: 'var(--text-tertiary)' }}>{t('usage_stats.no_data')}</div>
            )}
          </div>

          {/* Model Statistics */}
          <div className="card-glass" style={{ padding: '24px' }}>
            <h3 className="mb-lg" style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>{t('usage_stats.models')}</h3>
            {loading ? (
              <div className="flex-center" style={{ padding: '40px', color: 'var(--text-tertiary)' }}>{t('common.loading')}</div>
            ) : modelStats.length > 0 ? (
              <div className="flex-column gap-md">
                <div className="card-glass overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
                  <table className="table-premium" style={{ margin: 0, border: 'none' }}>
                    <thead>
                      <tr style={{ background: 'rgba(var(--bg-primary-rgb), 0.5)' }}>
                        <th>{t('usage_stats.model_name')}</th>
                        <th>{t('usage_stats.requests_count')}</th>
                        <th>{t('usage_stats.tokens_count')}</th>
                        {hasPrices && <th>{t('usage_stats.total_cost')}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {modelStats.map((stat) => (
                        <tr key={stat.model}>
                          <td style={{ fontWeight: 700 }}>{stat.model}</td>
                          <td>{stat.requests.toLocaleString()}</td>
                          <td>{formatTokensInMillions(stat.tokens)}</td>
                          {hasPrices && (
                            <td style={{ fontWeight: 600, color: 'var(--primary-color)' }}>
                              {stat.cost > 0 ? formatUsd(stat.cost) : '--'}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="flex-center" style={{ padding: '40px', color: 'var(--text-tertiary)' }}>{t('usage_stats.no_data')}</div>
            )}
          </div>
        </div>

        {/* Model Pricing Configuration */}
        <div className="card-glass" style={{ padding: '24px', marginTop: '24px' }}>
          <h3 className="mb-lg" style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>{t('usage_stats.model_price_settings')}</h3>
          <div className="flex-column gap-xl">
            {/* Price Form */}
            <div className="card-glass" style={{ padding: '20px', background: 'rgba(var(--bg-primary-rgb), 0.4)' }}>
              <div className="grid cols-4 items-end" style={{ gap: '16px' }}>
                <div className="flex-column gap-xs">
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('usage_stats.model_name')}</label>
                  <select
                    value={selectedModel}
                    onChange={(e) => {
                      setSelectedModel(e.target.value);
                      const price = modelPrices[e.target.value];
                      if (price) {
                        setPromptPrice(price.prompt.toString());
                        setCompletionPrice(price.completion.toString());
                        setCachePrice(price.cache.toString());
                      } else {
                        setPromptPrice('');
                        setCompletionPrice('');
                        setCachePrice('');
                      }
                    }}
                    className="input-premium"
                  >
                    <option value="">{t('usage_stats.model_price_select_placeholder')}</option>
                    {modelNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-column gap-xs">
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('usage_stats.model_price_prompt')} ($/1M)</label>
                  <Input
                    type="number"
                    value={promptPrice}
                    onChange={(e) => setPromptPrice(e.target.value)}
                    placeholder="0.00"
                    step="0.0001"
                  />
                </div>
                <div className="flex-column gap-xs">
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('usage_stats.model_price_completion')} ($/1M)</label>
                  <Input
                    type="number"
                    value={completionPrice}
                    onChange={(e) => setCompletionPrice(e.target.value)}
                    placeholder="0.00"
                    step="0.0001"
                  />
                </div>
                <div className="flex-row gap-md">
                  <Button
                    variant="primary"
                    onClick={handleSavePrice}
                    disabled={!selectedModel}
                    className="w-full btn-glass"
                  >
                    {t('common.save')}
                  </Button>
                </div>
              </div>
            </div>

            {/* Saved Prices List */}
            <div className="flex-column gap-md">
              <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('usage_stats.saved_prices')}</h4>
              {Object.keys(modelPrices).length > 0 ? (
                <div className="grid cols-3" style={{ gap: '16px' }}>
                  {Object.entries(modelPrices).map(([model, price]) => (
                    <div key={model} className="card-glass flex-column justify-between" style={{ padding: '16px', border: '1px solid var(--border-color)', background: 'rgba(var(--bg-primary-rgb), 0.2)' }}>
                      <div className="flex-column gap-sm mb-md">
                        <span style={{ fontWeight: 700, fontSize: '15px' }}>{model}</span>
                        <div className="flex-column gap-xs">
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{t('usage_stats.model_price_prompt')}: <strong style={{ color: 'var(--primary-color)' }}>${price.prompt.toFixed(4)}/1M</strong></span>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{t('usage_stats.model_price_completion')}: <strong style={{ color: 'var(--primary-color)' }}>${price.completion.toFixed(4)}/1M</strong></span>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{t('usage_stats.model_price_cache')}: <strong style={{ color: 'var(--primary-color)' }}>${price.cache.toFixed(4)}/1M</strong></span>
                        </div>
                      </div>
                      <div className="flex-row gap-sm">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleEditPrice(model)}
                          className="btn-glass flex-1"
                        >
                          {t('common.edit')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeletePrice(model)}
                          className="text-error flex-1"
                        >
                          {t('common.delete')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-center card-glass" style={{ padding: '32px', color: 'var(--text-tertiary)' }}>{t('usage_stats.model_price_empty')}</div>
              )}
            </div>
          </div>
        </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
