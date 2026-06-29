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
  extractTotalTokens,
  getModelNamesFromUsage,
  normalizeAuthIndex,
  normalizeUsageSourceId,
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
  sourceKey: string;
  sourceQuery: string;
  sourceRaw: string;
  source: string;
  sourceType: string;
  authIndex: string;
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

const usageDetailFromServerRow = (row: UsageDetailRow): UsageDetail | null => {
  const timestamp = typeof row.timestamp === 'string' ? row.timestamp : '';
  if (!timestamp) return null;
  const tokens = row.tokens ?? {};
  const timestampMs = parseTimestampMs(timestamp);
  return {
    timestamp,
    source: typeof row.source === 'string' ? row.source : '',
    auth_index: row.auth_index ?? null,
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
  openaiProviders
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
      const sourceInfo = resolveSourceDisplay(sourceLookup, authIndexRaw, sourceInfoMap, authFileMap);
      const source = sourceInfo.displayName;
      const sourceKey = sourceInfo.identityKey ?? `source:${sourceLookup || source}`;
      const sourceType = sourceInfo.type;
      const model = String(detail.__modelName ?? '').trim() || '-';
      const reasoningEffort = String(detail.reasoning_effort ?? '').trim();
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
        id: `${timestamp}-${model}-${sourceKey}-${authIndex}-${index}`,
        timestamp,
        timestampMs: Number.isNaN(timestampMs) ? 0 : timestampMs,
        timestampLabel: date ? date.toLocaleString(i18n.language) : timestamp || '-',
        model,
        reasoningEffort,
        sourceKey,
        sourceQuery,
        sourceRaw: sourceLookup || '-',
        source,
        sourceType,
        authIndex,
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
  }, [authFileMap, detailsMode, i18n.language, serverDetails, sourceInfoMap, usage]);

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
          row.sourceType.toLowerCase().includes(normalizedSearchKeyword) ||
          row.source.toLowerCase().includes(normalizedSearchKeyword) ||
          row.sourceRaw.toLowerCase().includes(normalizedSearchKeyword) ||
          row.authIndex.toLowerCase().includes(normalizedSearchKeyword);
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
      'reasoning_effort',
      'source_type',
      'source',
      'source_raw',
      'auth_index',
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
        row.reasoningEffort,
        row.sourceType,
        row.source,
        row.sourceRaw,
        row.authIndex,
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
      reasoning_effort: row.reasoningEffort,
      source_type: row.sourceType,
      source: row.source,
      source_raw: row.sourceRaw,
      auth_index: row.authIndex,
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
                defaultValue: '搜索模型 / 类型 / 账号 / 认证索引'
              })}
              aria-label={t('usage_stats.request_events_search_placeholder', {
                defaultValue: '搜索模型 / 类型 / 账号 / 认证索引'
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
                <col className={styles.requestEventsColSourceType} />
                <col className={styles.requestEventsColSourceAccount} />
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
                  <th>{t('usage_stats.request_events_source_type')}</th>
                  <th>{t('usage_stats.request_events_source_account')}</th>
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
                      title={row.reasoningEffort ? `${row.model} · ${row.reasoningEffort}` : row.model}
                    >
                      <span className={styles.modelCellStack}>
                        <span className={styles.truncateText}>{row.model}</span>
                        {row.reasoningEffort && (
                          <span className={styles.reasoningEffortBadge}>{row.reasoningEffort}</span>
                        )}
                      </span>
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




