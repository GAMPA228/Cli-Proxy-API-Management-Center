import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { apiKeyQuotasApi } from '@/services/api/apiKeyQuotas';
import { useAuthStore, useNotificationStore } from '@/stores';
import type { ApiKeyQuotaStatus, ApiKeyQuotaUpdate } from '@/types/apiKeyQuota';
import { formatDateTime, maskApiKey } from '@/utils/format';
import styles from './ApiKeyQuotasPage.module.scss';

const UNIT_MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  g: 1_000_000_000,
  t: 1_000_000_000_000,
};

function parseQuotaInput(value: string): number | null {
  const text = value.trim();
  if (!text) return 0;
  const match = text.match(/^(\d+(?:\.\d+)?)\s*([kmgt])?$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const unit = (match[2] || '').toLowerCase();
  const multiplier = unit ? UNIT_MULTIPLIERS[unit] : 1;
  return Math.trunc(amount * multiplier);
}

function formatQuotaInput(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value % 1_000_000 === 0) return `${value / 1_000_000}M`;
  if (value % 1_000 === 0) return `${value / 1_000}K`;
  return String(value);
}

function formatTokens(value: number, locale?: string): string {
  const normalized = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (normalized >= 1_000_000) return `${(normalized / 1_000_000).toFixed(2)}M`;
  if (normalized >= 1_000) return `${(normalized / 1_000).toFixed(2)}K`;
  return normalized.toLocaleString(locale);
}

function quotaKey(item: ApiKeyQuotaStatus): string {
  return item['api-key'];
}

export function ApiKeyQuotasPage() {
  const { t, i18n } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const { showNotification } = useNotificationStore();

  const [items, setItems] = useState<ApiKeyQuotaStatus[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [bulkValue, setBulkValue] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const disabled = connectionStatus !== 'connected';

  const loadQuotas = useCallback(async () => {
    if (disabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await apiKeyQuotasApi.list();
      const nextItems = Array.isArray(response.items) ? response.items : [];
      setItems(nextItems);
      setDrafts(
        Object.fromEntries(
          nextItems.map((item) => [quotaKey(item), formatQuotaInput(item['daily-token-limit'] || 0)])
        )
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('notification.refresh_failed');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [disabled, t]);

  useHeaderRefresh(loadQuotas);

  useEffect(() => {
    void loadQuotas();
  }, [loadQuotas]);

  const parsedDrafts = useMemo(() => {
    const parsed: Record<string, number | null> = {};
    items.forEach((item) => {
      const key = quotaKey(item);
      parsed[key] = parseQuotaInput(drafts[key] ?? '');
    });
    return parsed;
  }, [drafts, items]);

  const bulkParsed = useMemo(() => parseQuotaInput(bulkValue), [bulkValue]);
  const bulkInvalid = bulkValue.trim() !== '' && bulkParsed === null;
  const normalizedSearch = activeSearch.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    if (!normalizedSearch) return items;
    return items.filter((item) => {
      const apiKey = quotaKey(item).toLowerCase();
      const remark = (item.remark || '').toLowerCase();
      return apiKey.includes(normalizedSearch) || remark.includes(normalizedSearch);
    });
  }, [items, normalizedSearch]);
  const hasInvalidInput = Object.values(parsedDrafts).some((value) => value === null);
  const dirty = items.some((item) => {
    const key = quotaKey(item);
    const parsed = parsedDrafts[key];
    return parsed !== null && parsed !== (item['daily-token-limit'] || 0);
  });

  const totals = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.used += item['used-tokens'] || 0;
        acc.limit += item['daily-token-limit'] || 0;
        if (item.exceeded) acc.exceeded += 1;
        if (item.limited) acc.limited += 1;
        return acc;
      },
      { used: 0, limit: 0, exceeded: 0, limited: 0 }
    );
  }, [items]);

  const handleDraftChange = (apiKey: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [apiKey]: value }));
  };

  const handleApplyBulkLimit = () => {
    if (bulkParsed === null) return;
    const normalized = formatQuotaInput(bulkParsed);
    setDrafts(Object.fromEntries(items.map((item) => [quotaKey(item), normalized])));
  };

  const handleSearch = () => {
    setActiveSearch(searchValue.trim());
  };

  const handleClearSearch = () => {
    setSearchValue('');
    setActiveSearch('');
  };

  const handleSave = async () => {
    if (disabled || saving || hasInvalidInput) return;
    const updates: ApiKeyQuotaUpdate[] = items.map((item) => {
      const key = quotaKey(item);
      return {
        'api-key': key,
        'daily-token-limit': parsedDrafts[key] ?? 0,
      };
    });

    setSaving(true);
    try {
      await apiKeyQuotasApi.save(updates);
      showNotification(t('api_key_quotas.save_success'), 'success');
      await loadQuotas();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('notification.update_failed');
      showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetDrafts = () => {
    setDrafts(
      Object.fromEntries(
        items.map((item) => [quotaKey(item), formatQuotaInput(item['daily-token-limit'] || 0)])
      )
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>{t('api_key_quotas.title')}</h1>
          <p className={styles.description}>{t('api_key_quotas.description')}</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="secondary" onClick={loadQuotas} disabled={disabled || loading || saving}>
            {t('common.refresh')}
          </Button>
          <Button variant="secondary" onClick={resetDrafts} disabled={!dirty || saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!dirty || hasInvalidInput || disabled} loading={saving}>
            {t('common.save')}
          </Button>
        </div>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      <Card className={styles.bulkCard}>
        <div className={styles.bulkPanel}>
          <label className={styles.bulkLabel} htmlFor="api-key-quota-bulk">
            {t('api_key_quotas.bulk_title')}
          </label>
          <div className={styles.bulkActions}>
            <div className={styles.bulkInputGroup}>
              <input
                id="api-key-quota-bulk"
                className={`${styles.bulkInput} ${bulkInvalid ? styles.limitInputInvalid : ''}`}
                value={bulkValue}
                placeholder={t('api_key_quotas.bulk_placeholder')}
                disabled={loading || saving || disabled}
                onChange={(event) => setBulkValue(event.target.value)}
              />
              {bulkInvalid && <div className={styles.inputError}>{t('api_key_quotas.invalid_limit')}</div>}
            </div>
            <Button
              variant="secondary"
              onClick={handleApplyBulkLimit}
              disabled={loading || saving || disabled || items.length === 0 || bulkInvalid}
            >
              {t('api_key_quotas.apply_to_all')}
            </Button>
          </div>
        </div>
      </Card>

      <Card className={styles.searchCard}>
        <div className={styles.searchPanel}>
          <label className={styles.searchLabel} htmlFor="api-key-quota-search">
            {t('api_key_quotas.search_title')}
          </label>
          <div className={styles.searchActions}>
            <input
              id="api-key-quota-search"
              className={styles.searchInput}
              value={searchValue}
              placeholder={t('api_key_quotas.search_placeholder')}
              disabled={loading || disabled}
              onChange={(event) => setSearchValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSearch();
              }}
            />
            <Button
              variant="secondary"
              onClick={handleSearch}
              disabled={loading || disabled}
            >
              {t('api_key_quotas.search_button')}
            </Button>
            <Button
              variant="secondary"
              onClick={handleClearSearch}
              disabled={loading || disabled || (!searchValue && !activeSearch)}
            >
              {t('api_key_quotas.clear_search')}
            </Button>
          </div>
        </div>
      </Card>

      <div className={styles.statsGrid}>
        <Card className={styles.statCard}>
          <span className={styles.statLabel}>{t('api_key_quotas.total_used')}</span>
          <strong className={styles.statValue}>{formatTokens(totals.used, i18n.language)}</strong>
        </Card>
        <Card className={styles.statCard}>
          <span className={styles.statLabel}>{t('api_key_quotas.total_limit')}</span>
          <strong className={styles.statValue}>
            {totals.limit > 0 ? formatTokens(totals.limit, i18n.language) : t('api_key_quotas.unlimited')}
          </strong>
        </Card>
        <Card className={styles.statCard}>
          <span className={styles.statLabel}>{t('api_key_quotas.limited_keys')}</span>
          <strong className={styles.statValue}>{totals.limited.toLocaleString(i18n.language)}</strong>
        </Card>
        <Card className={styles.statCard}>
          <span className={styles.statLabel}>{t('api_key_quotas.exceeded_keys')}</span>
          <strong className={styles.statValue}>{totals.exceeded.toLocaleString(i18n.language)}</strong>
        </Card>
      </div>

      <Card
        title={t('api_key_quotas.table_title')}
        extra={
          <span className={styles.tableCount}>
            {normalizedSearch ? `${filteredItems.length}/${items.length}` : items.length}
          </span>
        }
      >
        {loading ? (
          <div className={styles.loadingState}>
            <LoadingSpinner size={22} />
            <span>{t('common.loading')}</span>
          </div>
        ) : items.length === 0 ? (
          <div className={styles.emptyState}>{t('api_key_quotas.empty')}</div>
        ) : filteredItems.length === 0 ? (
          <div className={styles.emptyState}>{t('api_key_quotas.search_empty')}</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('common.api_key')}</th>
                  <th>{t('api_key_quotas.daily_limit')}</th>
                  <th>{t('api_key_quotas.today_used')}</th>
                  <th>{t('api_key_quotas.remaining')}</th>
                  <th>{t('api_key_quotas.reset_at')}</th>
                  <th>{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const key = quotaKey(item);
                  const parsed = parsedDrafts[key];
                  const invalid = parsed === null;
                  return (
                    <tr key={key}>
                      <td>
                        <div className={styles.keyCell}>
                          <span className={styles.maskedKey}>{maskApiKey(key)}</span>
                          {item.remark && <span className={styles.remark}>{item.remark}</span>}
                        </div>
                      </td>
                      <td>
                        <input
                          className={`${styles.limitInput} ${invalid ? styles.limitInputInvalid : ''}`}
                          value={drafts[key] ?? ''}
                          placeholder={t('api_key_quotas.unlimited')}
                          disabled={saving || disabled}
                          onChange={(event) => handleDraftChange(key, event.target.value)}
                        />
                        {invalid && <div className={styles.inputError}>{t('api_key_quotas.invalid_limit')}</div>}
                      </td>
                      <td>{formatTokens(item['used-tokens'] || 0, i18n.language)}</td>
                      <td>
                        {item.limited
                          ? formatTokens(item['remaining-tokens'] || 0, i18n.language)
                          : t('api_key_quotas.unlimited')}
                      </td>
                      <td>{item['reset-at'] ? formatDateTime(item['reset-at'], i18n.language) : '-'}</td>
                      <td>
                        <span className={`${styles.statusBadge} ${item.exceeded ? styles.statusExceeded : styles.statusOk}`}>
                          {item.exceeded
                            ? t('api_key_quotas.status_exceeded')
                            : item.limited
                              ? t('api_key_quotas.status_limited')
                              : t('api_key_quotas.status_unlimited')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
