const RFC3339_HIGH_PRECISION_REGEX =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.(\d+))?(Z|[+-]\d{2}:\d{2})?$/i;

/**
 * 某些浏览器对超毫秒精度的 RFC3339 时间戳解析不稳定。
 * 在解析前统一截断为毫秒精度，避免时间解析失败。
 */
export function normalizeTimestampForDateParse(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const match = trimmed.match(RFC3339_HIGH_PRECISION_REGEX);
  if (!match) return trimmed;

  const [, base, , fractionDigits = '', timezone = ''] = match;
  if (fractionDigits.length <= 3) {
    return trimmed;
  }

  return `${base}.${fractionDigits.slice(0, 3)}${timezone}`;
}

export function parseTimestampMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value !== 'string') {
    return Number.NaN;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return Number.NaN;
  }

  const normalized = normalizeTimestampForDateParse(trimmed);
  const normalizedParsed = Date.parse(normalized);
  if (!Number.isNaN(normalizedParsed)) {
    return normalizedParsed;
  }

  if (normalized !== trimmed) {
    const originalParsed = Date.parse(trimmed);
    if (!Number.isNaN(originalParsed)) {
      return originalParsed;
    }
  }

  return Number.NaN;
}

export function parseTimestamp(value: unknown): Date | null {
  const timestampMs = parseTimestampMs(value);
  if (!Number.isFinite(timestampMs)) {
    return null;
  }
  return new Date(timestampMs);
}
