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
const tooltipElements = new WeakMap<HTMLCanvasElement, HTMLDivElement>();

const getOrCreateTooltipElement = (canvas: HTMLCanvasElement): HTMLDivElement => {
  const existing = tooltipElements.get(canvas);
  if (existing) {
    return existing;
  }

  const tooltip = document.createElement('div');
  document.body.appendChild(tooltip);
  tooltipElements.set(canvas, tooltip);
  return tooltip;
};

const appendTextNode = (parent: HTMLElement, tagName: string, className: string, text: string) => {
  const node = document.createElement(tagName);
  node.className = className;
  node.textContent = text;
  parent.appendChild(node);
  return node;
};

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
    const tickFontSize = isMobile ? 10 : 12;
    const maxTickLabelCount = isMobile ? (period === 'hour' ? 8 : 6) : period === 'hour' ? 12 : 10;
    const totalTokensLabel = t('usage_stats.total_tokens');

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
          enabled: false,
          external: ({ chart, tooltip }) => {
            const tooltipEl = getOrCreateTooltipElement(chart.canvas);
            tooltipEl.className = `${styles.apiKeyTokenTooltip} ${
              isDark ? styles.apiKeyTokenTooltipDark : ''
            }`.trim();

            if (tooltip.opacity === 0) {
              tooltipEl.style.opacity = '0';
              tooltipEl.style.visibility = 'hidden';
              return;
            }

            const firstItem = tooltip.dataPoints[0];
            if (!firstItem) {
              tooltipEl.style.opacity = '0';
              tooltipEl.style.visibility = 'hidden';
              return;
            }

            const rows = chart.data.datasets
              .map((dataset, datasetIndex) => {
                const raw = dataset.data[firstItem.dataIndex];
                const value = typeof raw === 'number' ? raw : Number(raw) || 0;
                const color =
                  typeof dataset.backgroundColor === 'string'
                    ? dataset.backgroundColor
                    : typeof dataset.borderColor === 'string'
                      ? dataset.borderColor
                      : USAGE_MODEL_CHART_COLORS[datasetIndex % USAGE_MODEL_CHART_COLORS.length].borderColor;
                return {
                  color,
                  label: dataset.label || '',
                  value
                };
              })
              .filter((row) => row.value > 0)
              .sort((a, b) => b.value - a.value);

            const total = rows.reduce((sum, row) => sum + row.value, 0);
            const columnCount = rows.length > 30 ? 3 : rows.length > 10 ? 2 : 1;

            tooltipEl.replaceChildren();
            tooltipEl.style.setProperty('--api-key-tooltip-columns', String(columnCount));

            const title = tooltip.title.join(' ');
            if (title) {
              appendTextNode(tooltipEl, 'div', styles.apiKeyTokenTooltipTitle, title);
            }

            const rowsEl = document.createElement('div');
            rowsEl.className = styles.apiKeyTokenTooltipRows;
            rows.forEach((row) => {
              const rowEl = document.createElement('div');
              rowEl.className = styles.apiKeyTokenTooltipRow;

              const dotEl = document.createElement('span');
              dotEl.className = styles.apiKeyTokenTooltipDot;
              dotEl.style.backgroundColor = row.color;
              rowEl.appendChild(dotEl);

              const labelEl = document.createElement('span');
              labelEl.className = styles.apiKeyTokenTooltipLabel;
              labelEl.textContent = row.label;
              rowEl.appendChild(labelEl);

              const valueEl = document.createElement('span');
              valueEl.className = styles.apiKeyTokenTooltipValue;
              const percent = total > 0 ? ` (${((row.value / total) * 100).toFixed(1)}%)` : '';
              valueEl.textContent = `${formatCompactNumber(row.value)}${percent}`;
              rowEl.appendChild(valueEl);

              rowsEl.appendChild(rowEl);
            });
            tooltipEl.appendChild(rowsEl);

            appendTextNode(
              tooltipEl,
              'div',
              styles.apiKeyTokenTooltipFooter,
              `${totalTokensLabel}: ${formatCompactNumber(total)}`
            );

            tooltipEl.style.opacity = '1';
            tooltipEl.style.visibility = 'hidden';
            tooltipEl.style.left = '0px';
            tooltipEl.style.top = '0px';

            const canvasRect = chart.canvas.getBoundingClientRect();
            const padding = 12;
            const tooltipWidth = tooltipEl.offsetWidth;
            const tooltipHeight = tooltipEl.offsetHeight;
            let left = canvasRect.left + tooltip.caretX;
            let top = canvasRect.top + tooltip.caretY + 12;

            left = Math.min(
              Math.max(left, padding + tooltipWidth / 2),
              window.innerWidth - padding - tooltipWidth / 2
            );

            if (top + tooltipHeight > window.innerHeight - padding) {
              top = canvasRect.top + tooltip.caretY - tooltipHeight - 12;
            }
            top = Math.min(Math.max(top, padding), window.innerHeight - padding - tooltipHeight);

            tooltipEl.style.left = `${left}px`;
            tooltipEl.style.top = `${top}px`;
            tooltipEl.style.visibility = 'visible';
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
