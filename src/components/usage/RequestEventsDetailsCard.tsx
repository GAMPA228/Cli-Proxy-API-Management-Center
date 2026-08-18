import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { CountTooltipCell } from '@/components/providers/CountTooltipCell';
import { authFilesApi } from '@/services/api/authFiles';
import { usageApi, type UsageDetailRow } from '@/services/api/usage';
import type { GeminiKeyConfig, ProviderKeyConfig, OpenAIProviderConfig } from '@/types';
import type { AuthFileItem } from '@/types/authFile';
import type { CredentialInfo } from '@/types/sourceInfo';
import { buildSourceInfoMap, resolveSourceDisplay } from '@/utils/sourceResolver';
import { parseTimestampMs } from '@/utils/timestamp';
import {
  collectUsageDetails,
  appendApiKeyRemark,
  buildCandidateUsageSourceIds,
  extractTotalTokens,
  formatUsageApiKeyLabel,
  getModelNamesFromUsage,
  normalizeAuthIndex,
  normalizeUsageSourceId,
  type ApiKeyRemarkEntry,
  type ApiKeyRemarkMap,
  type UsageDetail
} from '@/utils/usage';
import { downloadBlob } from '@/utils/download';
import { UsageTablePagination } from './UsageTablePagination';
import styles from '@/pages/UsagePage.module.scss';

const ALL_FILTER = '__all__';

type RequestEventRow = {
  id: string;
  timestamp: string;
  timestampMs: number;
  timestampLabel: string;
  model: string;
  reasoningEffort: string;
  serviceTier: string;
  appliedServiceTier: string;
  responseServiceTier: string;
  clientIP: string;
  apiKey: string;
  apiKeyLabel: string;
  sourceKey: string;
  sourceQuery: string;
  sourceRaw: string;
  source: string;
  sourceType: string;
  authID: string;
  authIndex: string;
  proxyMode: string;
  proxySource: string;
  proxyProtocol: string;
  proxyEndpoint: string;
  proxyDisplay: string;
  failed: boolean;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  totalTokens: number;
};

export interface RequestEventsDetailsCardProps {
  usage: unknown;
  loading: boolean;
  geminiKeys: GeminiKeyConfig[];
  claudeConfigs: ProviderKeyConfig[];
  codexConfigs: ProviderKeyConfig[];
  vertexConfigs: ProviderKeyConfig[];
  openaiProviders: OpenAIProviderConfig[];
  apiKeyEntries?: ApiKeyRemarkEntry[];
  apiKeyRemarks?: ApiKeyRemarkMap;
}

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
};

const encodeCsv = (value: string | number): string => {
  const text = String(value ?? '');
  const trimmedLeft = text.replace(/^\s+/, '');
  const safeText = trimmedLeft && /^[=+\-@]/.test(trimmedLeft) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
};

const normalizeSourceForLookup = (value: unknown): string => {
  const raw = typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim();
  if (!raw) return '';
  if (raw.startsWith('k:') || raw.startsWith('m:') || raw.startsWith('t:')) {
    return raw;
  }
  return normalizeUsageSourceId(raw);
};

const formatRequestApiKeyLabel = (value: unknown, apiKeyRemarks?: ApiKeyRemarkMap): string => {
  const raw = typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim();
  if (!raw) return '-';
  const masked = raw.length > 9 ? `${raw.slice(0, 6)}...${raw.slice(-3)}` : raw;
  return appendApiKeyRemark(masked, raw, apiKeyRemarks);
};

const formatProxyDisplay = (
  mode: string,
  source: string,
  protocol: string,
  endpoint: string,
  labels: { auth: string; global: string; direct: string; directAuth: string }
): string => {
  const normalizedMode = mode.trim().toLowerCase();
  const normalizedSource = source.trim().toLowerCase();
  if (normalizedMode === 'proxy' && endpoint.trim()) {
    const sourceLabel = normalizedSource === 'auth' ? labels.auth : normalizedSource === 'global' ? labels.global : '';
    return [protocol.trim().toUpperCase() || 'PROXY', endpoint.trim(), sourceLabel ? `(${sourceLabel})` : '']
      .filter(Boolean)
      .join(' · ');
  }
  if (normalizedMode === 'direct') {
    return normalizedSource === 'auth' ? labels.directAuth : labels.direct;
  }
  return '-';
};

type ServiceTierTone = 'fast' | 'default' | 'downgraded' | 'unknown';

const normalizeServiceTier = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  return normalized === 'priority' || normalized === 'fast' ? 'fast' : normalized;
};

const formatServiceTier = (value: string): string => {
  const normalized = normalizeServiceTier(value);
  if (normalized === 'fast') return 'Fast';
  if (normalized === 'default') return 'Default';
  if (normalized === 'auto') return 'Auto';
  return value.trim() || '-';
};

const resolveServiceTierDisplay = (
  requested: string,
  applied: string,
  response: string,
  noResponseLabel: string
): { label: string; tone: ServiceTierTone } => {
  const requestedTier = normalizeServiceTier(requested);
  const appliedTier = normalizeServiceTier(applied);
  const responseTier = normalizeServiceTier(response);
  const fastRequested = requestedTier === 'fast' || appliedTier === 'fast';

  if (responseTier === 'fast') return { label: 'Fast', tone: 'fast' };
  if (fastRequested && responseTier) {
    return { label: `Fast → ${formatServiceTier(response)}`, tone: 'downgraded' };
  }
  if (fastRequested) return { label: `Fast → ${noResponseLabel}`, tone: 'unknown' };
  if (responseTier) return { label: formatServiceTier(response), tone: 'default' };
  if (appliedTier) return { label: formatServiceTier(applied), tone: 'default' };
  if (requestedTier) return { label: formatServiceTier(requested), tone: 'default' };
  return { label: '-', tone: 'default' };
};

interface ServiceTierCellProps {
  requested: string;
  applied: string;
  response: string;
  requestedLabel: string;
  appliedLabel: string;
  responseLabel: string;
  noResponseLabel: string;
}

function ServiceTierCell({
  requested,
  applied,
  response,
  requestedLabel,
  appliedLabel,
  responseLabel,
  noResponseLabel
}: ServiceTierCellProps) {
  const display = resolveServiceTierDisplay(requested, applied, response, noResponseLabel);
  const toneClass =
    display.tone === 'fast'
      ? styles.serviceTierBadgeFast
      : display.tone === 'downgraded'
        ? styles.serviceTierBadgeDowngraded
        : display.tone === 'unknown'
          ? styles.serviceTierBadgeUnknown
          : styles.serviceTierBadgeDefault;
  const title = [
    `${requestedLabel}: ${requested || '-'}`,
    `${appliedLabel}: ${applied || '-'}`,
    `${responseLabel}: ${response || '-'}`
  ].join(' · ');

  return (
    <td className={styles.tableCellStatus} title={title}>
      <span className={`${styles.serviceTierBadge} ${toneClass}`}>{display.label}</span>
    </td>
  );
}

const usageDetailFromServerRow = (row: UsageDetailRow): UsageDetail | null => {
  const timestamp = typeof row.timestamp === 'string' ? row.timestamp : '';
  if (!timestamp) return null;
  const tokens = row.tokens ?? {};
  const timestampMs = parseTimestampMs(timestamp);
  return {
    timestamp,
    api: typeof row.api === 'string' ? row.api : '',
    client_ip: typeof row.client_ip === 'string' ? row.client_ip : '',
    source: typeof row.source === 'string' ? row.source : '',
    auth_id: typeof row.auth_id === 'string' ? row.auth_id : '',
    auth_index: row.auth_index ?? null,
    proxy_mode: typeof row.proxy_mode === 'string' ? row.proxy_mode : '',
    proxy_source: typeof row.proxy_source === 'string' ? row.proxy_source : '',
    proxy_protocol: typeof row.proxy_protocol === 'string' ? row.proxy_protocol : '',
    proxy_endpoint: typeof row.proxy_endpoint === 'string' ? row.proxy_endpoint : '',
    tokens: {
      input_tokens: Math.max(toNumber(tokens.input_tokens), 0),
      output_tokens: Math.max(toNumber(tokens.output_tokens), 0),
      reasoning_tokens: Math.max(toNumber(tokens.reasoning_tokens), 0),
      cached_tokens: Math.max(toNumber(tokens.cached_tokens), 0),
      cache_tokens: Math.max(toNumber(tokens.cache_tokens), 0),
      total_tokens: Math.max(toNumber(tokens.total_tokens), 0),
    },
    failed: row.failed === true,
    reasoning_effort: typeof row.reasoning_effort === 'string' ? row.reasoning_effort : '',
    service_tier: typeof row.service_tier === 'string' ? row.service_tier : '',
    applied_service_tier:
      typeof row.applied_service_tier === 'string' ? row.applied_service_tier : '',
    response_service_tier:
      typeof row.response_service_tier === 'string' ? row.response_service_tier : '',
    __modelName: typeof row.model === 'string' ? row.model : '',
    __timestampMs: Number.isNaN(timestampMs) ? 0 : timestampMs,
  };
};

export function RequestEventsDetailsCard({
  usage,
  loading,
  geminiKeys,
  claudeConfigs,
  codexConfigs,
  vertexConfigs,
  openaiProviders,
  apiKeyEntries = [],
  apiKeyRemarks = {}
}: RequestEventsDetailsCardProps) {
  const { t, i18n } = useTranslation();

  const [modelFilter, setModelFilter] = useState(ALL_FILTER);
  const [sourceFilter, setSourceFilter] = useState(ALL_FILTER);
  const [authIndexFilter, setAuthIndexFilter] = useState(ALL_FILTER);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [authFileMap, setAuthFileMap] = useState<Map<string, CredentialInfo>>(new Map());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [serverDetails, setServerDetails] = useState<UsageDetail[]>([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [detailsMode, setDetailsMode] = useState<'server' | 'fallback'>('server');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authFilesApi
      .list()
      .then((res) => {
        if (cancelled) return;
        const files = Array.isArray(res) ? res : (res as { files?: AuthFileItem[] })?.files;
        if (!Array.isArray(files)) return;
        const map = new Map<string, CredentialInfo>();
        files.forEach((file) => {
          const key = normalizeAuthIndex(file['auth_index'] ?? file.authIndex);
          if (!key) return;
          map.set(key, {
            name: file.name || key,
            type: (file.type || file.provider || '').toString()
          });
        });
        setAuthFileMap(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const sourceInfoMap = useMemo(
    () =>
      buildSourceInfoMap({
        geminiApiKeys: geminiKeys,
        claudeApiKeys: claudeConfigs,
        codexApiKeys: codexConfigs,
        vertexApiKeys: vertexConfigs,
        openaiCompatibility: openaiProviders,
      }),
    [claudeConfigs, codexConfigs, geminiKeys, openaiProviders, vertexConfigs]
  );

  const downstreamSourceLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    apiKeyEntries.forEach((entry) => {
      const apiKey = String(entry.apiKey ?? '').trim();
      if (!apiKey) return;
      const label = formatUsageApiKeyLabel(apiKey, apiKeyRemarks);
      buildCandidateUsageSourceIds({ apiKey }).forEach((sourceId) => {
        map.set(sourceId, label);
      });
    });
    return map;
  }, [apiKeyEntries, apiKeyRemarks]);

  const detailQuery = useMemo(
    () => ({
      page,
      page_size: pageSize,
      model: modelFilter !== ALL_FILTER ? modelFilter : undefined,
      auth_index: authIndexFilter !== ALL_FILTER ? authIndexFilter : undefined,
      search: searchKeyword.trim() || undefined,
    }),
    [authIndexFilter, modelFilter, page, pageSize, searchKeyword]
  );

  useEffect(() => {
    let cancelled = false;
    const loadingTimer = window.setTimeout(() => {
      if (!cancelled) setDetailLoading(true);
    }, 0);
    usageApi
      .getUsageDetails(detailQuery)
      .then((response) => {
        if (cancelled) return;
        const details = Array.isArray(response.items)
          ? response.items.map(usageDetailFromServerRow).filter((item): item is UsageDetail => item !== null)
          : [];
        setServerDetails(details);
        setServerTotal(Math.max(toNumber(response.total), 0));
        setDetailsMode('server');
        setDetailError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setServerDetails([]);
        setServerTotal(0);
        setDetailsMode('fallback');
        setDetailError(error instanceof Error ? error.message : t('usage_stats.loading_error'));
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false);
        }
      });
    return () => {
      cancelled = true;
      window.clearTimeout(loadingTimer);
    };
  }, [detailQuery, t]);

  const rows = useMemo<RequestEventRow[]>(() => {
    const details = detailsMode === 'server' ? serverDetails : collectUsageDetails(usage);

    const baseRows = details.map((detail, index) => {
      const timestamp = detail.timestamp;
      const timestampMs =
        typeof detail.__timestampMs === 'number' && detail.__timestampMs > 0
          ? detail.__timestampMs
          : parseTimestampMs(timestamp);
      const date = Number.isNaN(timestampMs) ? null : new Date(timestampMs);
      const sourceQuery = String(detail.source ?? '').trim();
      const sourceLookup = normalizeSourceForLookup(sourceQuery);
      const authIndexRaw = detail.auth_index as unknown;
      const authIndex =
        authIndexRaw === null || authIndexRaw === undefined || authIndexRaw === ''
          ? '-'
          : String(authIndexRaw);
      const authID = String(detail.auth_id ?? '').trim();
      const sourceInfo = resolveSourceDisplay(sourceLookup, authIndexRaw, sourceInfoMap, authFileMap);
      const downstreamSource =
        sourceQuery && apiKeyRemarks[sourceQuery]
          ? formatUsageApiKeyLabel(sourceQuery, apiKeyRemarks)
          : downstreamSourceLabelMap.get(sourceLookup);
      const source = downstreamSource || sourceInfo.displayName;
      const sourceKey = sourceInfo.identityKey ?? `source:${sourceLookup || source}`;
      const sourceType = sourceInfo.type;
      const model = String(detail.__modelName ?? '').trim() || '-';
      const reasoningEffort = String(detail.reasoning_effort ?? '').trim();
      const serviceTier = String(detail.service_tier ?? '').trim();
      const appliedServiceTier = String(detail.applied_service_tier ?? '').trim();
      const responseServiceTier = String(detail.response_service_tier ?? '').trim();
      const clientIP = String(detail.client_ip ?? '').trim() || '-';
      const proxyMode = String(detail.proxy_mode ?? '').trim();
      const proxySource = String(detail.proxy_source ?? '').trim();
      const proxyProtocol = String(detail.proxy_protocol ?? '').trim();
      const proxyEndpoint = String(detail.proxy_endpoint ?? '').trim();
      const proxyDisplay = formatProxyDisplay(proxyMode, proxySource, proxyProtocol, proxyEndpoint, {
        auth: t('usage_stats.request_events_proxy_source_auth'),
        global: t('usage_stats.request_events_proxy_source_global'),
        direct: t('usage_stats.request_events_proxy_direct'),
        directAuth: t('usage_stats.request_events_proxy_direct_auth'),
      });
      const apiKey = String(detail.api ?? '').trim();
      const apiKeyLabel = formatRequestApiKeyLabel(apiKey, apiKeyRemarks);
      const inputTokens = Math.max(toNumber(detail.tokens?.input_tokens), 0);
      const outputTokens = Math.max(toNumber(detail.tokens?.output_tokens), 0);
      const reasoningTokens = Math.max(toNumber(detail.tokens?.reasoning_tokens), 0);
      const cachedTokens = Math.max(
        Math.max(toNumber(detail.tokens?.cached_tokens), 0),
        Math.max(toNumber(detail.tokens?.cache_tokens), 0)
      );
      const totalTokens = Math.max(
        toNumber(detail.tokens?.total_tokens),
        extractTotalTokens(detail)
      );

      return {
        id: `${timestamp}-${model}-${apiKey}-${sourceKey}-${authIndex}-${index}`,
        timestamp,
        timestampMs: Number.isNaN(timestampMs) ? 0 : timestampMs,
        timestampLabel: date ? date.toLocaleString(i18n.language) : timestamp || '-',
        model,
        reasoningEffort,
        serviceTier,
        appliedServiceTier,
        responseServiceTier,
        clientIP,
        apiKey,
        apiKeyLabel,
        sourceKey,
        sourceQuery,
        sourceRaw: downstreamSource ? appendApiKeyRemark(sourceLookup || '-', sourceQuery, apiKeyRemarks) : sourceLookup || '-',
        source,
        sourceType,
        authID,
        authIndex,
        proxyMode,
        proxySource,
        proxyProtocol,
        proxyEndpoint,
        proxyDisplay,
        failed: detail.failed === true,
        inputTokens,
        outputTokens,
        reasoningTokens,
        cachedTokens,
        totalTokens
      };
    });

    const sourceLabelKeyMap = new Map<string, Set<string>>();
    baseRows.forEach((row) => {
      const keys = sourceLabelKeyMap.get(row.source) ?? new Set<string>();
      keys.add(row.sourceKey);
      sourceLabelKeyMap.set(row.source, keys);
    });

    const buildDisambiguatedSourceLabel = (row: RequestEventRow) => {
      const labelKeyCount = sourceLabelKeyMap.get(row.source)?.size ?? 0;
      if (labelKeyCount <= 1) {
        return row.source;
      }

      if (row.authIndex !== '-') {
        return `${row.source} · ${row.authIndex}`;
      }

      if (row.sourceRaw !== '-' && row.sourceRaw !== row.source) {
        return `${row.source} · ${row.sourceRaw}`;
      }

      if (row.sourceType) {
        return `${row.source} · ${row.sourceType}`;
      }

      return `${row.source} · ${row.sourceKey}`;
    };

    return baseRows
      .map((row) => ({
        ...row,
        source: buildDisambiguatedSourceLabel(row),
      }))
      .sort((a, b) => b.timestampMs - a.timestampMs);
  }, [apiKeyRemarks, authFileMap, detailsMode, downstreamSourceLabelMap, i18n.language, serverDetails, sourceInfoMap, t, usage]);

  const modelOptions = useMemo(() => {
    const models = new Set<string>(getModelNamesFromUsage(usage));
    rows.forEach((row) => models.add(row.model));
    if (modelFilter !== ALL_FILTER) models.add(modelFilter);
    return [
      { value: ALL_FILTER, label: t('usage_stats.filter_all') },
      ...Array.from(models).filter(Boolean).map((model) => ({ value: model, label: model }))
    ];
  }, [modelFilter, rows, t, usage]);

  const sourceOptions = useMemo(() => {
    const optionMap = new Map<string, string>();
    rows.forEach((row) => {
      if (!row.sourceKey || optionMap.has(row.sourceKey)) return;
      optionMap.set(row.sourceKey, row.source);
    });
    if (sourceFilter !== ALL_FILTER && !optionMap.has(sourceFilter)) {
      optionMap.set(sourceFilter, sourceFilter);
    }

    return [
      { value: ALL_FILTER, label: t('usage_stats.filter_all') },
      ...Array.from(optionMap.entries()).map(([value, label]) => ({ value, label }))
    ];
  }, [rows, sourceFilter, t]);

  const authIndexOptions = useMemo(() => {
    const authIndexes = new Set(rows.map((row) => row.authIndex));
    if (authIndexFilter !== ALL_FILTER) authIndexes.add(authIndexFilter);
    return [
      { value: ALL_FILTER, label: t('usage_stats.filter_all') },
      ...Array.from(authIndexes).filter(Boolean).map((authIndex) => ({
        value: authIndex,
        label: authIndex
      }))
    ];
  }, [authIndexFilter, rows, t]);

  const effectiveModelFilter = modelFilter;
  const effectiveSourceFilter = sourceFilter;
  const effectiveAuthIndexFilter = authIndexFilter;
  const normalizedSearchKeyword = searchKeyword.trim().toLowerCase();

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const modelMatched = effectiveModelFilter === ALL_FILTER || row.model === effectiveModelFilter;
        const sourceMatched =
          effectiveSourceFilter === ALL_FILTER || row.sourceKey === effectiveSourceFilter;
        const authIndexMatched =
          effectiveAuthIndexFilter === ALL_FILTER || row.authIndex === effectiveAuthIndexFilter;
        const keywordMatched =
          !normalizedSearchKeyword ||
          row.model.toLowerCase().includes(normalizedSearchKeyword) ||
          row.serviceTier.toLowerCase().includes(normalizedSearchKeyword) ||
          row.appliedServiceTier.toLowerCase().includes(normalizedSearchKeyword) ||
          row.responseServiceTier.toLowerCase().includes(normalizedSearchKeyword) ||
          row.clientIP.toLowerCase().includes(normalizedSearchKeyword) ||
          row.apiKey.toLowerCase().includes(normalizedSearchKeyword) ||
          row.apiKeyLabel.toLowerCase().includes(normalizedSearchKeyword) ||
          row.sourceType.toLowerCase().includes(normalizedSearchKeyword) ||
          row.source.toLowerCase().includes(normalizedSearchKeyword) ||
          row.sourceRaw.toLowerCase().includes(normalizedSearchKeyword) ||
          row.authID.toLowerCase().includes(normalizedSearchKeyword) ||
          row.authIndex.toLowerCase().includes(normalizedSearchKeyword) ||
          row.proxyDisplay.toLowerCase().includes(normalizedSearchKeyword) ||
          row.proxyMode.toLowerCase().includes(normalizedSearchKeyword) ||
          row.proxySource.toLowerCase().includes(normalizedSearchKeyword) ||
          row.proxyProtocol.toLowerCase().includes(normalizedSearchKeyword) ||
          row.proxyEndpoint.toLowerCase().includes(normalizedSearchKeyword);
        return modelMatched && sourceMatched && authIndexMatched && keywordMatched;
      }),
    [effectiveAuthIndexFilter, effectiveModelFilter, effectiveSourceFilter, normalizedSearchKeyword, rows]
  );

  const serverPaging = detailsMode === 'server';
  const totalItems = serverPaging ? serverTotal : filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const renderedRows = useMemo(
    () => (serverPaging ? filteredRows : filteredRows.slice(pageStart, pageStart + pageSize)),
    [filteredRows, pageSize, pageStart, serverPaging]
  );
  const shouldEnableTableScroll = renderedRows.length > 10;

  const hasActiveFilters =
    effectiveModelFilter !== ALL_FILTER ||
    effectiveSourceFilter !== ALL_FILTER ||
    effectiveAuthIndexFilter !== ALL_FILTER ||
    normalizedSearchKeyword.length > 0;

  const handleClearFilters = () => {
    setModelFilter(ALL_FILTER);
    setSourceFilter(ALL_FILTER);
    setAuthIndexFilter(ALL_FILTER);
    setSearchKeyword('');
    setPage(1);
  };


  const handlePageSizeChange = (size: number) => {
    if (!Number.isFinite(size) || size < 1) return;
    setPageSize(Math.floor(size));
    setPage(1);
  };

  const exportRowsAsCsv = (rowsToExport: RequestEventRow[]) => {
    const csvHeader = [
      'timestamp',
      'model',
      'client_ip',
      'api_key',
      'reasoning_effort',
      'service_tier',
      'applied_service_tier',
      'response_service_tier',
      'source_type',
      'source',
      'source_raw',
      'auth_id',
      'auth_index',
      'proxy_mode',
      'proxy_source',
      'proxy_protocol',
      'proxy_endpoint',
      'result',
      'input_tokens',
      'output_tokens',
      'reasoning_tokens',
      'cached_tokens',
      'total_tokens'
    ];

    const csvRows = rowsToExport.map((row) =>
      [
        row.timestamp,
        row.model,
        row.clientIP,
        row.apiKeyLabel,
        row.reasoningEffort,
        row.serviceTier,
        row.appliedServiceTier,
        row.responseServiceTier,
        row.sourceType,
        row.source,
        row.sourceRaw,
        row.authID,
        row.authIndex,
        row.proxyMode,
        row.proxySource,
        row.proxyProtocol,
        row.proxyEndpoint,
        row.failed ? 'failed' : 'success',
        row.inputTokens,
        row.outputTokens,
        row.reasoningTokens,
        row.cachedTokens,
        row.totalTokens
      ]
        .map((value) => encodeCsv(value))
        .join(',')
    );

    const content = [csvHeader.join(','), ...csvRows].join('\n');
    const fileTime = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob({
      filename: `usage-events-${fileTime}.csv`,
      blob: new Blob([content], { type: 'text/csv;charset=utf-8' })
    });
  };

  const exportRowsAsJson = (rowsToExport: RequestEventRow[]) => {
    const payload = rowsToExport.map((row) => ({
      timestamp: row.timestamp,
      model: row.model,
      client_ip: row.clientIP,
      api_key: row.apiKeyLabel,
      reasoning_effort: row.reasoningEffort,
      service_tier: row.serviceTier,
      applied_service_tier: row.appliedServiceTier,
      response_service_tier: row.responseServiceTier,
      source_type: row.sourceType,
      source: row.source,
      source_raw: row.sourceRaw,
      auth_id: row.authID,
      auth_index: row.authIndex,
      proxy_mode: row.proxyMode,
      proxy_source: row.proxySource,
      proxy_protocol: row.proxyProtocol,
      proxy_endpoint: row.proxyEndpoint,
      failed: row.failed,
      tokens: {
        input_tokens: row.inputTokens,
        output_tokens: row.outputTokens,
        reasoning_tokens: row.reasoningTokens,
        cached_tokens: row.cachedTokens,
        total_tokens: row.totalTokens
      }
    }));

    const content = JSON.stringify(payload, null, 2);
    const fileTime = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob({
      filename: `usage-events-${fileTime}.json`,
      blob: new Blob([content], { type: 'application/json;charset=utf-8' })
    });
  };

  const handleExportCsv = () => {
    if (!filteredRows.length) return;
    exportRowsAsCsv(filteredRows);
  };

  const handleExportJson = () => {
    if (!filteredRows.length) return;
    exportRowsAsJson(filteredRows);
  };

  return (
    <Card title={t('usage_stats.request_events_title')}>
      <div className={styles.requestEventsTopBar}>
        <div className={styles.requestEventsToolbar}>
          <div className={`${styles.requestEventsFilterItem} ${styles.requestEventsSearchItem}`}>
            <input
              className={`input ${styles.requestEventsSearchInput}`}
              value={searchKeyword}
              onChange={(event) => {
                setSearchKeyword(event.target.value);
                setPage(1);
              }}
              placeholder={t('usage_stats.request_events_search_placeholder', {
                defaultValue: '搜索模型 / IP / API Key / 类型 / 账号 / 认证索引 / 代理出口'
              })}
              aria-label={t('usage_stats.request_events_search_placeholder', {
                defaultValue: '搜索模型 / IP / API Key / 类型 / 账号 / 认证索引 / 代理出口'
              })}
            />
          </div>
          <div className={styles.requestEventsFilterItem}>
            <Select
              value={effectiveModelFilter}
              options={modelOptions}
              onChange={(value) => {
                setModelFilter(value);
                setPage(1);
              }}
              className={styles.requestEventsSelect}
              ariaLabel={t('usage_stats.request_events_filter_model')}
              fullWidth={false}
            />
          </div>
          <div className={styles.requestEventsFilterItem}>
            <Select
              value={effectiveSourceFilter}
              options={sourceOptions}
              onChange={(value) => {
                setSourceFilter(value);
                setPage(1);
              }}
              className={styles.requestEventsSelect}
              ariaLabel={t('usage_stats.request_events_filter_source')}
              fullWidth={false}
            />
          </div>
          <div className={styles.requestEventsFilterItem}>
            <Select
              value={effectiveAuthIndexFilter}
              options={authIndexOptions}
              onChange={(value) => {
                setAuthIndexFilter(value);
                setPage(1);
              }}
              className={styles.requestEventsSelect}
              ariaLabel={t('usage_stats.request_events_filter_auth_index')}
              fullWidth={false}
            />
          </div>
        </div>
        <div className={styles.requestEventsActions}>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            disabled={!hasActiveFilters}
          >
            {t('usage_stats.clear_filters')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCsv}
            disabled={filteredRows.length === 0 || detailLoading}
          >
            {t('usage_stats.export_csv')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportJson}
            disabled={filteredRows.length === 0 || detailLoading}
          >
            {t('usage_stats.export_json')}
          </Button>
        </div>
      </div>

      {(loading || detailLoading) && rows.length === 0 ? (
        <div className={styles.hint}>{t('common.loading')}</div>
      ) : detailError && detailsMode === 'fallback' && rows.length === 0 ? (
        <div className={styles.hint}>{detailError}</div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={t(hasActiveFilters ? 'usage_stats.request_events_no_result_title' : 'usage_stats.request_events_empty_title')}
          description={t(hasActiveFilters ? 'usage_stats.request_events_no_result_desc' : 'usage_stats.request_events_empty_desc')}
        />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          title={t('usage_stats.request_events_no_result_title')}
          description={t('usage_stats.request_events_no_result_desc')}
        />
      ) : (
        <>
          <div className={styles.requestEventsMeta}>
            <span>{t('usage_stats.request_events_count', { count: totalItems })}</span>
          </div>

          <div
            className={`${styles.requestEventsTableWrapper} ${shouldEnableTableScroll ? styles.requestEventsTableWrapperScrollable : ''}`.trim()}
          >
            <table className={`${styles.table} ${styles.requestEventsTable}`}>
              <colgroup>
                <col className={styles.requestEventsColTime} />
                <col className={styles.requestEventsColModel} />
                <col className={styles.requestEventsColSpeed} />
                <col className={styles.requestEventsColClientIP} />
                <col className={styles.requestEventsColAPIKey} />
                <col className={styles.requestEventsColSourceType} />
                <col className={styles.requestEventsColSourceAccount} />
                <col className={styles.requestEventsColProxy} />
                <col className={styles.requestEventsColAuthIndex} />
                <col className={styles.requestEventsColResult} />
                <col className={styles.requestEventsColToken} />
                <col className={styles.requestEventsColToken} />
                <col className={styles.requestEventsColToken} />
                <col className={styles.requestEventsColToken} />
                <col className={styles.requestEventsColToken} />
              </colgroup>
              <thead>
                <tr>
                  <th>{t('usage_stats.request_events_timestamp')}</th>
                  <th>{t('usage_stats.model_name')}</th>
                  <th>{t('usage_stats.request_events_speed')}</th>
                  <th>{t('usage_stats.request_events_client_ip')}</th>
                  <th>{t('usage_stats.request_events_api_key')}</th>
                  <th>{t('usage_stats.request_events_source_type')}</th>
                  <th>{t('usage_stats.request_events_source_account')}</th>
                  <th>{t('usage_stats.request_events_proxy')}</th>
                  <th>{t('usage_stats.request_events_auth_index')}</th>
                  <th>{t('usage_stats.request_events_result')}</th>
                  <th>{t('usage_stats.input_tokens')}</th>
                  <th>{t('usage_stats.output_tokens')}</th>
                  <th>{t('usage_stats.reasoning_tokens')}</th>
                  <th>{t('usage_stats.cached_tokens')}</th>
                  <th>{t('usage_stats.total_tokens')}</th>
                </tr>
              </thead>
              <tbody>
                {renderedRows.map((row) => (
                  <tr key={row.id}>
                    <td title={row.timestamp} className={`${styles.requestEventsTimestamp} ${styles.tableCellMono}`}>
                      {row.timestampLabel}
                    </td>
                    <td
                      className={`${styles.modelCell} ${styles.tableCellLeft}`}
                      title={[
                        row.model,
                        row.reasoningEffort
                          ? `${t('usage_stats.request_events_reasoning')}: ${row.reasoningEffort}`
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    >
                      <span className={styles.modelCellStack}>
                        <span className={styles.truncateText}>{row.model}</span>
                        <span className={styles.requestMetadataBadges}>
                          {row.reasoningEffort && (
                            <span className={styles.reasoningEffortBadge}>{row.reasoningEffort}</span>
                          )}
                        </span>
                      </span>
                    </td>
                    <ServiceTierCell
                      requested={row.serviceTier}
                      applied={row.appliedServiceTier}
                      response={row.responseServiceTier}
                      requestedLabel={t('usage_stats.request_events_requested_tier')}
                      appliedLabel={t('usage_stats.request_events_applied_tier')}
                      responseLabel={t('usage_stats.request_events_response_tier')}
                      noResponseLabel={t('usage_stats.request_events_speed_no_response')}
                    />
                    <td
                      className={`${styles.requestEventsClientIP} ${styles.tableCellMono}`}
                      title={row.clientIP}
                    >
                      {row.clientIP}
                    </td>
                    <td
                      className={`${styles.requestEventsAPIKey} ${styles.tableCellMono}`}
                      title={row.apiKeyLabel}
                    >
                      {row.apiKeyLabel}
                    </td>
                    <td className={styles.tableCellStatus} title={row.sourceType || '-'}>
                      {row.sourceType ? (
                        <span className={styles.requestEventsSourceTypeBadge}>{row.sourceType}</span>
                      ) : (
                        <span className={styles.requestEventsSourceTypeEmpty}>-</span>
                      )}
                    </td>
                    <td className={`${styles.requestEventsSourceCell} ${styles.tableCellLeft}`}>
                      {row.source && row.source !== '-' ? (
                        <CountTooltipCell
                          items={[row.source]}
                          triggerLabel={<span className={styles.requestEventsSourceText}>{row.source}</span>}
                          triggerClassName={styles.requestEventsSourceTrigger}
                          triggerAriaLabel={t('usage_stats.request_events_source_account')}
                        />
                      ) : (
                        <span className={styles.requestEventsSourceText}>-</span>
                      )}
                    </td>
                    <td
                      className={`${styles.requestEventsProxy} ${styles.tableCellMono}`}
                      title={row.proxyDisplay}
                    >
                      {row.proxyDisplay}
                    </td>
                    <td className={`${styles.requestEventsAuthIndex} ${styles.tableCellMono}`} title={row.authIndex}>
                      {row.authIndex}
                    </td>
                    <td className={styles.tableCellStatus}>
                      <span
                        className={row.failed ? styles.requestEventsResultFailed : styles.requestEventsResultSuccess}
                      >
                        {row.failed ? t('stats.failure') : t('stats.success')}
                      </span>
                    </td>
                    <td className={styles.tableCellMono}>{row.inputTokens.toLocaleString()}</td>
                    <td className={styles.tableCellMono}>{row.outputTokens.toLocaleString()}</td>
                    <td className={styles.tableCellMono}>{row.reasoningTokens.toLocaleString()}</td>
                    <td className={styles.tableCellMono}>{row.cachedTokens.toLocaleString()}</td>
                    <td className={styles.tableCellMono}>{row.totalTokens.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.usageTablePagination}>
            <UsageTablePagination
              totalItems={totalItems}
              currentPage={currentPage}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={handlePageSizeChange}
              disabled={detailLoading}
            />
          </div>
        </>
      )}
    </Card>
  );
}



