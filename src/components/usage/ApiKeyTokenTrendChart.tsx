import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChartData, ChartOptions } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { maskApiKey } from '@/utils/format';
import {
  collectUsageDetailsWithEndpoint,
  extractTotalTokens,
  formatCompactNumber,
  formatDayLabel,
  formatHourLabel,
  type UsageDetailWithEndpoint
} from '@/utils/usage';
import { getHourChartMinWidth } from '@/utils/usage/chartConfig';
import { USAGE_MODEL_CHART_COLORS } from '@/utils/usage/palette';
import type { UsagePayload } from './hooks/useUsageData';
import styles from '@/pages/UsagePage.module.scss';

type Period = 'hour' | 'day';

export interface ApiKeyTokenTrendChartProps {
  usage: UsagePayload | null;
  loading: boolean;
  period: Period;
  onPeriodChange: (period: Period) => void;
  isDark: boolean;
  isMobile: boolean;
  hourWindowHours?: number;
  emptyText: string;
}

interface ApiKeySeries {
  labels: string[];
  totalsByKey: Map<string, number>;
  valuesByKey: Map<string, Map<string, number>>;
}

const TOP_KEY_OPTIONS = [5, 10, 20, 50].map((value) => ({
  value: String(value),
  label: `Top ${value}`
}));

const OTHER_KEY = '__other_api_keys__';

const toBucketLabel = (detail: UsageDetailWithEndpoint, period: Period): string => {
  const timestamp = detail.__timestampMs;
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '';
  }
  const date = new Date(timestamp);
  return period === 'hour' ? formatHourLabel(date) : formatDayLabel(date);
};

const buildHourlyLabels = (hourWindow: number = 24): string[] => {
  const hourMs = 60 * 60 * 1000;
  const resolvedHourWindow =
    Number.isFinite(hourWindow) && hourWindow > 0
      ? Math.min(Math.max(Math.floor(hourWindow), 1), 24 * 31)
      : 24;
  const now = new Date();
  const currentHour = new Date(now);
  currentHour.setMinutes(0, 0, 0);

  const earliestBucket = new Date(currentHour);
  earliestBucket.setHours(earliestBucket.getHours() - (resolvedHourWindow - 1));
  const earliestTime = earliestBucket.getTime();

  const labels: string[] = [];
  for (let i = 0; i < resolvedHourWindow; i += 1) {
    labels.push(formatHourLabel(new Date(earliestTime + i * hourMs)));
  }
  return labels;
};

const buildApiKeySeries = (
  usage: UsagePayload | null,
  period: Period,
  hourWindowHours?: number
): ApiKeySeries => {
  const details = usage ? collectUsageDetailsWithEndpoint(usage) : [];
  const labelsSet = new Set<string>();
  const valuesByKey = new Map<string, Map<string, number>>();
  const totalsByKey = new Map<string, number>();

  details.forEach((detail) => {
    const apiKey = detail.__endpoint || 'unknown';
    const label = toBucketLabel(detail, period);
    if (!label) {
      return;
    }
    const tokens = extractTotalTokens(detail);
    if (!Number.isFinite(tokens) || tokens <= 0) {
      return;
    }

    labelsSet.add(label);
    totalsByKey.set(apiKey, (totalsByKey.get(apiKey) ?? 0) + tokens);

    if (!valuesByKey.has(apiKey)) {
      valuesByKey.set(apiKey, new Map());
    }
    const bucketValues = valuesByKey.get(apiKey)!;
    bucketValues.set(label, (bucketValues.get(label) ?? 0) + tokens);
  });

  const labels = period === 'hour'
    ? buildHourlyLabels(hourWindowHours)
    : Array.from(labelsSet).sort();

  return { labels, totalsByKey, valuesByKey };
};

const displayApiKey = (apiKey: string, otherLabel: string): string => {
  if (apiKey === OTHER_KEY) {
    return otherLabel;
  }
  if (apiKey === 'unknown') {
    return 'unknown';
  }
  return maskApiKey(apiKey) || apiKey;
};

export function ApiKeyTokenTrendChart({
  usage,
  loading,
  period,
  onPeriodChange,
  isDark,
  isMobile,
  hourWindowHours,
  emptyText
}: ApiKeyTokenTrendChartProps) {
  const { t } = useTranslation();
  const [topCount, setTopCount] = useState('10');
  const otherLabel = t('usage_stats.other_api_keys');

  const { chartData, hasData } = useMemo(() => {
    const topLimit = Math.max(Number.parseInt(topCount, 10) || 10, 1);
    const series = buildApiKeySeries(usage, period, hourWindowHours);
    const rankedKeys = Array.from(series.totalsByKey.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => key);
    const visibleKeys = rankedKeys.slice(0, topLimit);
    const overflowKeys = rankedKeys.slice(topLimit);
    const keys = overflowKeys.length > 0 ? [...visibleKeys, OTHER_KEY] : visibleKeys;

    const datasets: ChartData<'bar'>['datasets'] = keys.map((key, index) => {
      const color = USAGE_MODEL_CHART_COLORS[index % USAGE_MODEL_CHART_COLORS.length];
      const sourceMaps =
        key === OTHER_KEY
          ? overflowKeys.map((overflowKey) => series.valuesByKey.get(overflowKey)).filter(Boolean)
          : [series.valuesByKey.get(key)];
      const data = series.labels.map((label) =>
        sourceMaps.reduce((sum, bucketMap) => sum + (bucketMap?.get(label) ?? 0), 0)
      );

      return {
        label: displayApiKey(key, otherLabel),
        data,
        borderColor: color.borderColor,
        backgroundColor: color.borderColor,
        borderWidth: 1,
        borderRadius: 3,
        borderSkipped: false,
        stack: 'api-key-token-usage'
      };
    });

    return {
      chartData: {
        labels: series.labels,
        datasets
      },
      hasData: datasets.some((dataset) =>
        dataset.data.some((value) => typeof value === 'number' && value > 0)
      )
    };
  }, [hourWindowHours, otherLabel, period, topCount, usage]);

  const chartOptions: ChartOptions<'bar'> = useMemo(() => {
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(17, 24, 39, 0.06)';
    const axisBorderColor = isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(17, 24, 39, 0.10)';
    const tickColor = isDark ? 'rgba(255, 255, 255, 0.72)' : 'rgba(17, 24, 39, 0.72)';
    const tooltipBg = isDark ? 'rgba(17, 24, 39, 0.94)' : 'rgba(255, 255, 255, 0.98)';
    const tooltipTitle = isDark ? '#ffffff' : '#111827';
    const tooltipBody = isDark ? 'rgba(255, 255, 255, 0.86)' : '#374151';
    const tooltipBorder = isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(17, 24, 39, 0.10)';
    const tickFontSize = isMobile ? 10 : 12;
    const maxTickLabelCount = isMobile ? (period === 'hour' ? 8 : 6) : period === 'hour' ? 12 : 10;

    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      scales: {
        x: {
          stacked: true,
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
            minRotation: 0,
            autoSkip: true,
            maxTicksLimit: maxTickLabelCount,
            callback: (value) => {
              const index = typeof value === 'number' ? value : Number(value);
              const raw =
                Number.isFinite(index) && chartData.labels[index]
                  ? chartData.labels[index]
                  : typeof value === 'string'
                    ? value
                    : '';

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
          stacked: true,
          beginAtZero: true,
          grid: {
            color: gridColor
          },
          border: {
            color: axisBorderColor
          },
          ticks: {
            color: tickColor,
            font: { size: tickFontSize },
            callback: (value) => formatCompactNumber(Number(value))
          }
        }
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
          usePointStyle: true,
          callbacks: {
            label: () => '',
            afterBody: (items) => {
              const firstItem = items[0];
              if (!firstItem) {
                return [];
              }
              const rows = firstItem.chart.data.datasets
                .map((dataset) => {
                  const raw = dataset.data[firstItem.dataIndex];
                  const value = typeof raw === 'number' ? raw : Number(raw) || 0;
                  return {
                    label: dataset.label || '',
                    value
                  };
                })
                .filter((row) => row.value > 0)
                .sort((a, b) => b.value - a.value);
              const total = rows.reduce((sum, row) => sum + row.value, 0);
              return rows.map((row) => {
                const percent = total > 0 ? ` (${((row.value / total) * 100).toFixed(1)}%)` : '';
                return `${row.label}: ${formatCompactNumber(row.value)}${percent}`;
              });
            },
            footer: (items) => {
              const firstItem = items[0];
              const total = firstItem
                ? firstItem.chart.data.datasets.reduce((sum, dataset) => {
                    const raw = dataset.data[firstItem.dataIndex];
                    return sum + (typeof raw === 'number' ? raw : Number(raw) || 0);
                  }, 0)
                : 0;
              return `${t('usage_stats.total_tokens')}: ${formatCompactNumber(total)}`;
            }
          }
        }
      },
      datasets: {
        bar: {
          categoryPercentage: 0.72,
          barPercentage: 0.86,
          maxBarThickness: 44
        }
      }
    };
  }, [chartData.labels, isDark, isMobile, period, t]);

  const chartCanvasStyle =
    period === 'hour'
      ? { minWidth: getHourChartMinWidth(chartData.labels.length, isMobile) }
      : undefined;

  return (
    <Card
      title={t('usage_stats.api_key_token_trend')}
      extra={
        <div className={styles.chartHeaderControls}>
          <Select
            value={topCount}
            options={TOP_KEY_OPTIONS}
            onChange={setTopCount}
            className={styles.chartTopSelect}
            ariaLabel={t('usage_stats.top_api_keys')}
            fullWidth={false}
            dropdownWidth="content"
          />
          <div className={styles.periodButtons}>
            <Button
              variant={period === 'hour' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => onPeriodChange('hour')}
            >
              {t('usage_stats.by_hour')}
            </Button>
            <Button
              variant={period === 'day' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => onPeriodChange('day')}
            >
              {t('usage_stats.by_day')}
            </Button>
          </div>
        </div>
      }
    >
      {loading ? (
        <div className={styles.hint}>{t('common.loading')}</div>
      ) : hasData ? (
        <div className={styles.chartWrapper}>
          <div className={styles.chartLegend} aria-label="Chart legend">
            {chartData.datasets.map((dataset, index) => {
              const legendColor =
                typeof dataset.borderColor === 'string' ? dataset.borderColor : '#64748b';
              return (
                <div
                  key={`${dataset.label}-${index}`}
                  className={styles.legendItem}
                  title={dataset.label}
                >
                  <span className={styles.legendDot} style={{ backgroundColor: legendColor }} />
                  <span className={styles.legendLabel}>{dataset.label}</span>
                </div>
              );
            })}
          </div>
          <div className={styles.chartArea}>
            <div className={styles.chartScroller}>
              <div className={styles.chartCanvas} style={chartCanvasStyle}>
                <Bar data={chartData} options={chartOptions} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.hint}>{emptyText}</div>
      )}
    </Card>
  );
}
