/**
 * 使用统计相关 API
 */

import { apiClient } from './client';
import { computeKeyStats, KeyStats } from '@/utils/usage';
import { LONG_REQUEST_TIMEOUT_MS } from '@/utils/constants';

const USAGE_TIMEOUT_MS = LONG_REQUEST_TIMEOUT_MS;

export interface UsageExportPayload {
  version?: number;
  exported_at?: string;
  usage?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UsageImportResponse {
  added?: number;
  skipped?: number;
  total_requests?: number;
  failed_requests?: number;
  [key: string]: unknown;
}
export interface UsageDetailTokens {
  input_tokens?: number;
  output_tokens?: number;
  reasoning_tokens?: number;
  cached_tokens?: number;
  cache_tokens?: number;
  total_tokens?: number;
}

export interface UsageDetailRow {
  id?: number;
  api?: string;
  model?: string;
  timestamp?: string;
  latency_ms?: number;
  source?: string;
  auth_index?: string | number | null;
  tokens?: UsageDetailTokens;
  failed?: boolean;
}

export interface UsageDetailsQuery {
  page?: number;
  page_size?: number;
  offset?: number;
  api?: string;
  model?: string;
  source?: string;
  auth_index?: string | number | null;
  search?: string;
}

export interface UsageDetailsPage {
  items?: UsageDetailRow[];
  total?: number;
  page?: number;
  page_size?: number;
  offset?: number;
  has_more?: boolean;
}

export interface UsageAggregateBucket {
  bucket?: string;
  api?: string;
  model?: string;
  total_requests?: number;
  success_count?: number;
  failure_count?: number;
  total_tokens?: number;
  tokens?: UsageDetailTokens;
}

export interface UsageAggregateModel {
  total_requests?: number;
  success_count?: number;
  failure_count?: number;
  total_tokens?: number;
  tokens?: UsageDetailTokens;
}

export interface UsageAggregateApi extends UsageAggregateModel {
  models?: Record<string, UsageAggregateModel>;
}

export interface UsageAggregatePayload extends UsageAggregateModel {
  apis?: Record<string, UsageAggregateApi>;
  models?: Record<string, UsageAggregateModel>;
  hourly?: UsageAggregateBucket[];
  daily?: UsageAggregateBucket[];
  range?: string;
  since?: string;
  until?: string;
}

export interface UsageAggregateQuery {
  range?: string;
}

const compactQuery = (query: object = {}) => {
  const params: Record<string, string | number> = {};
  Object.entries(query as Record<string, unknown>).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const normalized = typeof value === 'string' ? value.trim() : value;
    if (normalized === '') return;
    if (typeof normalized === 'string' || typeof normalized === 'number') {
      params[key] = normalized;
    }
  });
  return params;
};

export const usageApi = {
  /**
   * 获取使用统计原始数据
   */
  getUsage: () =>
    apiClient.get<Record<string, unknown>>('/usage', {
      timeout: apiClient.getTimeout(USAGE_TIMEOUT_MS)
    }),
  /**
   * 分页获取请求事件明细
   */
  getUsageDetails: (query: UsageDetailsQuery = {}) =>
    apiClient.get<UsageDetailsPage>('/usage/details', {
      params: compactQuery(query),
      timeout: apiClient.getTimeout(USAGE_TIMEOUT_MS)
    }),

  /**
   * 获取 SQLite 侧聚合后的使用统计数据
   */
  getUsageAggregate: (query: UsageAggregateQuery = {}) =>
    apiClient.get<UsageAggregatePayload>('/usage/aggregate', {
      params: compactQuery(query),
      timeout: apiClient.getTimeout(USAGE_TIMEOUT_MS)
    }),

  /**
   * 导出使用统计快照
   */
  exportUsage: () =>
    apiClient.get<UsageExportPayload>('/usage/export', {
      timeout: apiClient.getTimeout(USAGE_TIMEOUT_MS)
    }),

  /**
   * 导入使用统计快照
   */
  importUsage: (payload: unknown) =>
    apiClient.post<UsageImportResponse>('/usage/import', payload, {
      timeout: apiClient.getTimeout(USAGE_TIMEOUT_MS)
    }),

  /**
   * 计算密钥成功/失败统计，必要时会先获取 usage 数据
   */
  async getKeyStats(usageData?: unknown): Promise<KeyStats> {
    let payload = usageData;
    if (!payload) {
      const response = await apiClient.get<Record<string, unknown>>('/usage', {
        timeout: apiClient.getTimeout(USAGE_TIMEOUT_MS)
      });
      payload = response?.usage ?? response;
    }
    return computeKeyStats(payload);
  }
};

