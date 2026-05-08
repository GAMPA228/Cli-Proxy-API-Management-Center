import {
  MAX_REQUEST_TIMEOUT_SECONDS,
  MIN_REQUEST_TIMEOUT_SECONDS,
} from './constants';

const MIN_REQUEST_TIMEOUT_MS = MIN_REQUEST_TIMEOUT_SECONDS * 1000;
const MAX_REQUEST_TIMEOUT_MS = MAX_REQUEST_TIMEOUT_SECONDS * 1000;

export function normalizeRequestTimeoutMs(value: unknown): number | null {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number.parseInt(value.trim(), 10)
        : NaN;

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return Math.min(Math.max(Math.trunc(numeric), MIN_REQUEST_TIMEOUT_MS), MAX_REQUEST_TIMEOUT_MS);
}

export function parseRequestTimeoutSeconds(value: string): { isValid: boolean; timeoutMs: number | null } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { isValid: true, timeoutMs: null };
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) {
    return { isValid: false, timeoutMs: null };
  }

  if (parsed < MIN_REQUEST_TIMEOUT_SECONDS || parsed > MAX_REQUEST_TIMEOUT_SECONDS) {
    return { isValid: false, timeoutMs: null };
  }

  return { isValid: true, timeoutMs: parsed * 1000 };
}

export function requestTimeoutMsToSeconds(timeoutMs: number | null | undefined): string {
  if (!timeoutMs || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return '';
  }

  return String(Math.max(MIN_REQUEST_TIMEOUT_SECONDS, Math.round(timeoutMs / 1000)));
}
