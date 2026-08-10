import type { CodexRateLimitResetCredit } from '@/types';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY = 'cli-proxy-api:codex-reset-credits:v1';
const MAX_CONCURRENT_REQUESTS = 2;

export type CodexResetCreditsData = {
  availableCount: number | null;
  credits: CodexRateLimitResetCredit[];
  error: string;
};

type CacheEntry = {
  cachedAt: number;
  availableCount: number | null;
  credits: CodexRateLimitResetCredit[];
};

const memoryCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<CodexResetCreditsData>>();
const requestWaiters: Array<() => void> = [];
let activeRequests = 0;

const normalizeEntry = (value: unknown): CacheEntry | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<CacheEntry>;
  if (!Number.isFinite(candidate.cachedAt) || Number(candidate.cachedAt) <= 0) return null;
  if (candidate.availableCount !== null && typeof candidate.availableCount !== 'number') {
    return null;
  }
  if (!Array.isArray(candidate.credits)) return null;
  return {
    cachedAt: Number(candidate.cachedAt),
    availableCount: candidate.availableCount ?? null,
    credits: candidate.credits,
  };
};

const readStorage = (): Record<string, CacheEntry> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .map(([key, value]) => [key, normalizeEntry(value)] as const)
        .filter((entry): entry is readonly [string, CacheEntry] => entry[1] !== null)
    );
  } catch {
    return {};
  }
};

const writeStorage = (entries: Record<string, CacheEntry>): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // The in-memory cache remains usable when persistent storage is unavailable.
  }
};

const getCached = (cacheKey: string): CodexResetCreditsData | null => {
  const now = Date.now();
  const memoryEntry = memoryCache.get(cacheKey);
  if (memoryEntry && now - memoryEntry.cachedAt < CACHE_TTL_MS) {
    return {
      availableCount: memoryEntry.availableCount,
      credits: memoryEntry.credits,
      error: '',
    };
  }
  memoryCache.delete(cacheKey);

  const entries = readStorage();
  const storedEntry = entries[cacheKey];
  if (!storedEntry || now - storedEntry.cachedAt >= CACHE_TTL_MS) {
    if (storedEntry) {
      delete entries[cacheKey];
      writeStorage(entries);
    }
    return null;
  }
  memoryCache.set(cacheKey, storedEntry);
  return {
    availableCount: storedEntry.availableCount,
    credits: storedEntry.credits,
    error: '',
  };
};

export const buildCodexResetCreditsCacheKey = (authIndex: string, accountId: string): string =>
  accountId.trim() || authIndex.trim();

export const cacheCodexResetCredits = (cacheKey: string, data: CodexResetCreditsData): void => {
  const now = Date.now();
  const entry: CacheEntry = {
    cachedAt: now,
    availableCount: data.availableCount,
    credits: data.credits,
  };
  memoryCache.set(cacheKey, entry);

  const entries = readStorage();
  Object.keys(entries).forEach((key) => {
    if (now - entries[key].cachedAt >= CACHE_TTL_MS) delete entries[key];
  });
  entries[cacheKey] = entry;
  writeStorage(entries);
};

export const clearCodexResetCreditsCache = (cacheKey: string): void => {
  memoryCache.delete(cacheKey);
  const entries = readStorage();
  if (!(cacheKey in entries)) return;
  delete entries[cacheKey];
  writeStorage(entries);
};

const runLimited = async <T>(task: () => Promise<T>): Promise<T> => {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise<void>((resolve) => requestWaiters.push(resolve));
  } else {
    activeRequests += 1;
  }
  try {
    return await task();
  } finally {
    const next = requestWaiters.shift();
    if (next) next();
    else activeRequests -= 1;
  }
};

export const getOrLoadCodexResetCredits = async (
  cacheKey: string,
  loader: () => Promise<CodexResetCreditsData>
): Promise<CodexResetCreditsData> => {
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const inFlight = inFlightRequests.get(cacheKey);
  if (inFlight) return inFlight;

  const request = runLimited(loader)
    .then((data) => {
      if (!data.error) cacheCodexResetCredits(cacheKey, data);
      return data;
    })
    .finally(() => inFlightRequests.delete(cacheKey));
  inFlightRequests.set(cacheKey, request);
  return request;
};
