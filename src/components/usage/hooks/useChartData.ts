import { useState, useMemo } from 'react';
import type { ChartData as ChartJsData, ChartOptions } from 'chart.js';
import { buildChartData, type ChartData } from '@/utils/usage';
import { buildBarChartOptions, buildChartOptions } from '@/utils/usage/chartConfig';
import type { UsagePayload } from './useUsageData';

export interface UseChartDataOptions {
  usage: UsagePayload | null;
  chartLines: string[];
  isDark: boolean;
  isMobile: boolean;
  hourWindowHours?: number;
}

export interface UseChartDataReturn {
  requestsPeriod: 'hour' | 'day';
  setRequestsPeriod: (period: 'hour' | 'day') => void;
  tokensPeriod: 'hour' | 'day';
  setTokensPeriod: (period: 'hour' | 'day') => void;
  requestsChartData: ChartJsData<'bar', number[], string>;
  tokensChartData: ChartData;
  requestsChartOptions: ChartOptions<'bar'>;
  tokensChartOptions: ChartOptions<'line'>;
}

export function useChartData({
  usage,
  chartLines,
  isDark,
  isMobile,
  hourWindowHours
}: UseChartDataOptions): UseChartDataReturn {
  const [requestsPeriod, setRequestsPeriod] = useState<'hour' | 'day'>('day');
  const [tokensPeriod, setTokensPeriod] = useState<'hour' | 'day'>('day');

  const requestsChartData = useMemo<ChartJsData<'bar', number[], string>>(() => {
    if (!usage) return { labels: [], datasets: [] };
    const lineData = buildChartData(usage, requestsPeriod, 'requests', chartLines, {
      hourWindowHours
    });

    return {
      labels: lineData.labels,
      datasets: lineData.datasets.map((dataset) => ({
        label: dataset.label,
        data: dataset.data,
        borderColor: dataset.borderColor,
        backgroundColor: dataset.borderColor,
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false
      }))
    };
  }, [usage, requestsPeriod, chartLines, hourWindowHours]);

  const tokensChartData = useMemo(() => {
    if (!usage) return { labels: [], datasets: [] };
    return buildChartData(usage, tokensPeriod, 'tokens', chartLines, { hourWindowHours });
  }, [usage, tokensPeriod, chartLines, hourWindowHours]);

  const requestsChartOptions = useMemo(
    () =>
      buildBarChartOptions({
        period: requestsPeriod,
        labels: requestsChartData.labels ?? [],
        isDark,
        isMobile
      }),
    [requestsPeriod, requestsChartData.labels, isDark, isMobile]
  );

  const tokensChartOptions = useMemo(
    () =>
      buildChartOptions({
        period: tokensPeriod,
        labels: tokensChartData.labels,
        isDark,
        isMobile
      }),
    [tokensPeriod, tokensChartData.labels, isDark, isMobile]
  );

  return {
    requestsPeriod,
    setRequestsPeriod,
    tokensPeriod,
    setTokensPeriod,
    requestsChartData,
    tokensChartData,
    requestsChartOptions,
    tokensChartOptions
  };
}
