type PerformanceInput = {
  latencyMs: number | null;
  outputTokens: number;
  failed: boolean;
  model: string;
  responseModel?: string;
};

export function getRequestOutputTps(row: PerformanceInput): number | null {
  const isImageModel = (model: string) =>
    /^(gpt-image(?:-|$)|dall-e(?:-|$)|imagen(?:-|$))/i.test(model);
  if (
    row.failed ||
    isImageModel(row.model) ||
    isImageModel(row.responseModel ?? '') ||
    row.latencyMs === null ||
    !Number.isFinite(row.latencyMs) ||
    row.latencyMs <= 0 ||
    !Number.isFinite(row.outputTokens) ||
    row.outputTokens <= 0
  )
    return null;
  const rate = (row.outputTokens * 1000) / row.latencyMs;
  return Number.isFinite(rate) ? rate : null;
}

export function latencySeverity(ms: number | null, firstToken = false): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return 'unknown';
  const thresholds = firstToken ? [10000, 30000, 60000] : [60000, 180000, 300000];
  if (ms >= thresholds[2]) return 'critical';
  if (ms >= thresholds[1]) return 'slow';
  if (ms >= thresholds[0]) return 'warn';
  return 'good';
}
