import { useEffect, useState } from 'react';
import {
  usageApi,
  type UsageAggregateBucket,
  type UsageAggregateModel,
  type UsageAggregatePayload,
  type UsageDetailTokens
} from '@/services/api/usage';
import { parseTimestampMs } from '@/utils/timestamp';
import type { UsageTimeRange } from '@/utils/usage';
import type { UsagePayload } from './useUsageData';

export interface UseUsageDetailSnapshotOptions {
  enabled: boolean;
  range?: UsageTimeRange;
  refreshKey?: string | number | null;
}

export interface UseUsageDetailSnapshotReturn {
  usage: UsagePayload | null;
  loading: boolean;
  error: string;
}

interface ModelBucket {
  total_requests: number;
  success_count: number;
  failure_count: number;
  total_tokens: number;
  tokens: UsageDetailTokens;
  details: Array<Record<string, unknown>>;
}

interface ApiBucket {
  total_requests: number;
  success_count: number;
  failure_count: number;
  total_tokens: number;
  tokens: UsageDetailTokens;
  models: Record<string, ModelBucket>;
}

const toNumber = (value: unknown): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const normalizeName = (value: unknown, fallback: string): string => {
  const normalized = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  return normalized || fallback;
};

const normalizeTokens = (tokens: UsageDetailTokens | undefined) => {
  const inputTokens = Math.max(toNumber(tokens?.input_tokens), 0);
  const outputTokens = Math.max(toNumber(tokens?.output_tokens), 0);
  const reasoningTokens = Math.max(toNumber(tokens?.reasoning_tokens), 0);
  const cachedTokens = Math.max(toNumber(tokens?.cached_tokens), toNumber(tokens?.cache_tokens), 0);
  let totalTokens = Math.max(toNumber(tokens?.total_tokens), 0);

  if (totalTokens <= 0) {
    totalTokens = inputTokens + outputTokens + reasoningTokens;
  }
  if (totalTokens <= 0) {
    totalTokens = inputTokens + outputTokens + reasoningTokens + cachedTokens;
  }

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    reasoning_tokens: reasoningTokens,
    cached_tokens: cachedTokens,
    total_tokens: totalTokens
  };
};

const ensureApiBucket = (apis: Record<string, ApiBucket>, apiName: string): ApiBucket => {
  if (!apis[apiName]) {
    apis[apiName] = {
      total_requests: 0,
      success_count: 0,
      failure_count: 0,
      total_tokens: 0,
      tokens: normalizeTokens(undefined),
      models: {}
    };
  }
  return apis[apiName];
};

const ensureModelBucket = (apiBucket: ApiBucket, modelName: string): ModelBucket => {
  if (!apiBucket.models[modelName]) {
    apiBucket.models[modelName] = {
      total_requests: 0,
      success_count: 0,
      failure_count: 0,
      total_tokens: 0,
      tokens: normalizeTokens(undefined),
      details: []
    };
  }
  return apiBucket.models[modelName];
};

const applyModelAggregate = (target: ModelBucket, aggregate: UsageAggregateModel | undefined) => {
  target.total_requests = Math.max(toNumber(aggregate?.total_requests), 0);
  target.success_count = Math.max(toNumber(aggregate?.success_count), 0);
  target.failure_count = Math.max(toNumber(aggregate?.failure_count), 0);
  target.total_tokens = Math.max(toNumber(aggregate?.total_tokens), toNumber(aggregate?.tokens?.total_tokens), 0);
  target.tokens = normalizeTokens(aggregate?.tokens);
};

const makeSyntheticDetail = (
  timestamp: string,
  modelName: string,
  tokens: UsageDetailTokens | undefined,
  failed = false,
  requestCount = 1
) => {
  const timestampMs = parseTimestampMs(timestamp);
  return {
    timestamp,
    latency_ms: 0,
    source: '',
    auth_index: null,
    tokens: normalizeTokens(tokens),
    failed,
    __modelName: modelName,
    __timestampMs: Number.isNaN(timestampMs) ? 0 : timestampMs,
    __requestCount: Math.max(toNumber(requestCount), 0)
  };
};

const selectBuckets = (
  aggregate: UsageAggregatePayload,
  range: UsageTimeRange
): UsageAggregateBucket[] => {
  if (range === 'all' && Array.isArray(aggregate.daily) && aggregate.daily.length > 0) {
    return aggregate.daily;
  }
  if (Array.isArray(aggregate.hourly) && aggregate.hourly.length > 0) {
    return aggregate.hourly;
  }
  if (Array.isArray(aggregate.daily) && aggregate.daily.length > 0) {
    return aggregate.daily;
  }
  return [];
};

function buildUsageFromAggregate(aggregate: UsageAggregatePayload, range: UsageTimeRange): UsagePayload {
  const apis: Record<string, ApiBucket> = {};
  const aggregateApis = aggregate.apis && typeof aggregate.apis === 'object' ? aggregate.apis : {};

  Object.entries(aggregateApis).forEach(([apiNameRaw, apiAggregate]) => {
    const apiName = normalizeName(apiNameRaw, 'unknown');
    const apiBucket = ensureApiBucket(apis, apiName);
    apiBucket.total_requests = Math.max(toNumber(apiAggregate?.total_requests), 0);
    apiBucket.success_count = Math.max(toNumber(apiAggregate?.success_count), 0);
    apiBucket.failure_count = Math.max(toNumber(apiAggregate?.failure_count), 0);
    apiBucket.total_tokens = Math.max(toNumber(apiAggregate?.total_tokens), toNumber(apiAggregate?.tokens?.total_tokens), 0);
    apiBucket.tokens = normalizeTokens(apiAggregate?.tokens);

    const models = apiAggregate?.models && typeof apiAggregate.models === 'object' ? apiAggregate.models : {};
    Object.entries(models).forEach(([modelNameRaw, modelAggregate]) => {
      applyModelAggregate(ensureModelBucket(apiBucket, normalizeName(modelNameRaw, 'unknown')), modelAggregate);
    });
  });

  selectBuckets(aggregate, range).forEach((bucket) => {
    const apiName = normalizeName(bucket.api, 'unknown');
    const modelName = normalizeName(bucket.model, 'unknown');
    const timestamp = typeof bucket.bucket === 'string' && bucket.bucket.trim()
      ? bucket.bucket
      : aggregate.until || new Date().toISOString();
    const apiBucket = ensureApiBucket(apis, apiName);
    const modelBucket = ensureModelBucket(apiBucket, modelName);
    modelBucket.details.push(
      makeSyntheticDetail(timestamp, modelName, bucket.tokens, false, bucket.total_requests)
    );
  });

  const fallbackTimestamp = aggregate.until || new Date().toISOString();
  Object.values(apis).forEach((apiBucket) => {
    Object.entries(apiBucket.models).forEach(([modelName, modelBucket]) => {
      if (modelBucket.details.length === 0 && modelBucket.total_tokens > 0) {
        modelBucket.details.push(
          makeSyntheticDetail(fallbackTimestamp, modelName, { total_tokens: modelBucket.total_tokens }, false)
        );
      }
    });
  });

  return {
    total_requests: Math.max(toNumber(aggregate.total_requests), 0),
    success_count: Math.max(toNumber(aggregate.success_count), 0),
    failure_count: Math.max(toNumber(aggregate.failure_count), 0),
    total_tokens: Math.max(toNumber(aggregate.total_tokens), toNumber(aggregate.tokens?.total_tokens), 0),
    apis
  };
}

export function useUsageDetailSnapshot({
  enabled,
  range = 'all',
  refreshKey
}: UseUsageDetailSnapshotOptions): UseUsageDetailSnapshotReturn {
  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) {
      setUsage(null);
      setLoading(false);
      setError('');
      return;
    }

    let cancelled = false;

    const loadAggregate = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await usageApi.getUsageAggregate({ range });
        if (!cancelled) {
          setUsage(buildUsageFromAggregate(response ?? {}, range));
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '');
          setUsage(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadAggregate();

    return () => {
      cancelled = true;
    };
  }, [enabled, range, refreshKey]);

  return { usage, loading, error };
}
