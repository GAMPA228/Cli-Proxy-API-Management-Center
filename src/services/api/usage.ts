/**
 * Usage statistics API.
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
  first_token_ms?: number | null;
  turn_state_length?: number | null;
  capture_id?: string;
  client_ip?: string;
  source?: string;
  auth_id?: string;
  auth_index?: string | number | null;
  proxy_mode?: string;
  proxy_source?: string;
  proxy_protocol?: string;
  proxy_endpoint?: string;
  reasoning_effort?: string;
  service_tier?: string;
  applied_service_tier?: string;
  response_service_tier?: string;
  response_model?: string;
  tokens?: UsageDetailTokens;
  failed?: boolean;
  error_status?: number;
  error_message?: string;
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
  result?: 'success' | 'failed';
  start_time?: string;
  end_time?: string;
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

export interface QuotaEstimatorPrice {
  prompt: number;
  completion: number;
  cache: number;
}

export interface QuotaEstimatorWindow {
  scope: 'primary' | 'weekly' | string;
  used_percent: number;
  remaining_percent: number;
  reset_at: string;
  window_minutes: number;
  last_observed_at: string;
  current_cycle_tokens: number;
  current_cycle_cost_usd: number;
  estimate_available: boolean;
  full_window_tokens: number;
  full_window_cost_usd: number;
  remaining_tokens: number;
  remaining_cost_usd: number;
  cost_low: number;
  cost_high: number;
  sample_count: number;
  percent_span: number;
  confidence: 'insufficient' | 'low' | 'medium' | 'high' | string;
  status: 'active' | 'expired' | string;
}

export interface QuotaEstimatorAccount {
  account: string;
  auth_id?: string;
  auth_index?: string;
  plan_type?: string;
  latest_model?: string;
  primary: QuotaEstimatorWindow;
  secondary?: QuotaEstimatorWindow;
}

export interface QuotaEstimatorOverview {
  generated_at: string;
  value_unit: string;
  accounts: QuotaEstimatorAccount[];
  missing_price_models?: string[];
}

export interface QuotaEstimatorOptions {
  prices?: Record<string, QuotaEstimatorPrice>;
  fast_multiplier?: number;
  apply_fast?: boolean;
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
   * Fetch raw usage statistics.
   */
  getUsage: () =>
    apiClient.get<Record<string, unknown>>('/usage', {
      timeout: apiClient.getTimeout(USAGE_TIMEOUT_MS),
    }),
  /**
   * Fetch paginated request events.
   */
  getUsageDetails: (query: UsageDetailsQuery = {}) =>
    apiClient.get<UsageDetailsPage>('/usage/details', {
      params: compactQuery(query),
      timeout: apiClient.getTimeout(USAGE_TIMEOUT_MS),
    }),

  /**
   * Fetch usage statistics aggregated by SQLite.
   */
  getUsageAggregate: (query: UsageAggregateQuery = {}) =>
    apiClient.get<UsageAggregatePayload>('/usage/aggregate', {
      params: compactQuery(query),
      timeout: apiClient.getTimeout(USAGE_TIMEOUT_MS),
    }),

  /**
   * Fetch quota capacity estimates per Codex account.
   */
  getQuotaEstimator: (options: QuotaEstimatorOptions = {}) =>
    apiClient.post<QuotaEstimatorOverview>('/usage/quota-estimator', options, {
      timeout: apiClient.getTimeout(USAGE_TIMEOUT_MS),
    }),

  /**
   * Export a usage snapshot.
   */
  exportUsage: () =>
    apiClient.get<UsageExportPayload>('/usage/export', {
      timeout: apiClient.getTimeout(USAGE_TIMEOUT_MS),
    }),

  /**
   * Import a usage snapshot.
   */
  importUsage: (payload: unknown) =>
    apiClient.post<UsageImportResponse>('/usage/import', payload, {
      timeout: apiClient.getTimeout(USAGE_TIMEOUT_MS),
    }),

  /**
   * Compute key success/failure statistics, fetching usage if needed.
   */
  async getKeyStats(usageData?: unknown): Promise<KeyStats> {
    let payload = usageData;
    if (!payload) {
      const response = await apiClient.get<Record<string, unknown>>('/usage', {
        timeout: apiClient.getTimeout(USAGE_TIMEOUT_MS),
      });
      payload = response?.usage ?? response;
    }
    return computeKeyStats(payload);
  },
};
