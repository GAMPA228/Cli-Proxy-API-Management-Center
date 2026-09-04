import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import {
  authFilesApi,
  usageApi,
  type QuotaEstimatorAccount,
  type QuotaEstimatorWindow,
} from '@/services/api';
import { useAuthStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import { loadModelPrices } from '@/utils/usage';
import styles from './QuotaEstimatorPage.module.scss';

const BUILT_IN_PRICES = {
  'gpt-5.6': { prompt: 4, completion: 20, cache: 0.4 },
  'gpt-5.6-sol': { prompt: 4, completion: 20, cache: 0.4 },
  'gpt-5.6-terra': { prompt: 2, completion: 12, cache: 0.2 },
  'gpt-5.6-luna': { prompt: 0.2, completion: 1.2, cache: 0.02 },
};

interface DisplayAccount {
  key: string;
  title: string;
  subtitle: string;
  searchText: string;
  planType: string;
  account?: QuotaEstimatorAccount;
}

function normalize(value: unknown): string {
  return String(value ?? '').trim();
}

function authIndexOf(file: AuthFileItem): string {
  return normalize(file['auth_index'] ?? file.authIndex);
}

function isCodexFile(file: AuthFileItem): boolean {
  return [file.type, file.provider].some((value) => normalize(value).toLowerCase() === 'codex');
}

function accountMatchesFile(account: QuotaEstimatorAccount, file: AuthFileItem): boolean {
  const candidates = new Set(
    [file.id, authIndexOf(file), file.name].map(normalize).filter(Boolean)
  );
  return [account.account, account.auth_id, account.auth_index]
    .map(normalize)
    .some((value) => value && candidates.has(value));
}

function displayName(file?: AuthFileItem, account?: QuotaEstimatorAccount): string {
  return (
    normalize(file?.label || file?.email || file?.account || file?.name || account?.account) || '-'
  );
}

function displaySubtitle(file?: AuthFileItem, account?: QuotaEstimatorAccount): string {
  const values = [
    file?.email,
    file?.name,
    account?.auth_id || account?.auth_index || account?.account,
  ]
    .map(normalize)
    .filter(Boolean);
  return Array.from(new Set(values))
    .filter((value) => value !== displayName(file, account))
    .join(' · ');
}

function formatUSD(value: number): string {
  if (!Number.isFinite(value)) return '--';
  const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
  return `$${value.toFixed(digits)}`;
}

function formatTokens(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '--';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return Math.round(value).toLocaleString();
}

function formatDateTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function confidenceClass(confidence: string): string {
  if (confidence === 'high') return styles.confidenceHigh;
  if (confidence === 'medium') return styles.confidenceMedium;
  if (confidence === 'low') return styles.confidenceLow;
  return styles.confidenceInsufficient;
}

function WindowCell({ window, locale }: { window?: QuotaEstimatorWindow; locale: string }) {
  const { t } = useTranslation();
  if (!window) return <span className={styles.muted}>--</span>;
  return (
    <div className={styles.windowCell}>
      <div className={styles.windowHeadline}>
        <span>{Math.round(window.remaining_percent)}%</span>
        <span className={window.estimate_available ? styles.money : styles.muted}>
          {window.estimate_available
            ? formatUSD(window.remaining_cost_usd)
            : t('quota_estimator.awaiting_estimate')}
        </span>
      </div>
      <div className={styles.progressTrack}>
        <span style={{ width: `${Math.max(0, Math.min(100, window.remaining_percent))}%` }} />
      </div>
      <div className={styles.windowMeta}>
        {t('quota_estimator.reset_at', { time: formatDateTime(window.reset_at, locale) })}
      </div>
    </div>
  );
}

export function QuotaEstimatorPage() {
  const { t, i18n } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const [accounts, setAccounts] = useState<QuotaEstimatorAccount[]>([]);
  const [authFiles, setAuthFiles] = useState<AuthFileItem[]>([]);
  const [missingModels, setMissingModels] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (connectionStatus !== 'connected') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const prices = { ...BUILT_IN_PRICES, ...loadModelPrices() };
      const [overview, files] = await Promise.all([
        usageApi.getQuotaEstimator({ prices, fast_multiplier: 2.5, apply_fast: true }),
        authFilesApi.list().catch(() => ({ files: [] })),
      ]);
      setAccounts(Array.isArray(overview.accounts) ? overview.accounts : []);
      setMissingModels(
        Array.isArray(overview.missing_price_models) ? overview.missing_price_models : []
      );
      setAuthFiles(Array.isArray(files.files) ? files.files.filter(isCodexFile) : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('notification.refresh_failed'));
    } finally {
      setLoading(false);
    }
  }, [connectionStatus, t]);

  useHeaderRefresh(load);
  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo<DisplayAccount[]>(() => {
    const used = new Set<AuthFileItem>();
    const result: DisplayAccount[] = accounts.map((account) => {
      const file = authFiles.find((item) => accountMatchesFile(account, item));
      if (file) used.add(file);
      const title = displayName(file, account);
      const subtitle = displaySubtitle(file, account);
      return {
        key: account.account,
        title,
        subtitle,
        searchText: `${title} ${subtitle} ${account.account}`.toLowerCase(),
        planType: normalize(account.plan_type) || '--',
        account,
      };
    });
    authFiles.forEach((file) => {
      if (used.has(file)) return;
      const title = displayName(file);
      const subtitle = displaySubtitle(file);
      result.push({
        key: normalize(file.id || authIndexOf(file) || file.name),
        title,
        subtitle,
        searchText: `${title} ${subtitle}`.toLowerCase(),
        planType: normalize(file.accountType) || '--',
      });
    });
    return result;
  }, [accounts, authFiles]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? rows.filter((row) => row.searchText.includes(query)) : rows;
  }, [rows, search]);

  const summary = useMemo(() => {
    const estimated = accounts.filter((item) => item.primary.estimate_available);
    return {
      total: rows.length,
      estimated: estimated.length,
      remaining: estimated.reduce((sum, item) => sum + item.primary.remaining_cost_usd, 0),
    };
  }, [accounts, rows.length]);

  return (
    <div className={styles.container}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>{t('quota_estimator.title')}</h1>
          <p className={styles.description}>{t('quota_estimator.description')}</p>
        </div>
        <Button onClick={() => void load()} disabled={loading || connectionStatus !== 'connected'}>
          {t('common.refresh')}
        </Button>
      </header>

      {error && <div className={styles.errorBox}>{error}</div>}
      <div className={styles.notice}>{t('quota_estimator.disclaimer')}</div>

      <section className={styles.statsGrid}>
        <Card>
          <span>{t('quota_estimator.total_accounts')}</span>
          <strong>{summary.total}</strong>
        </Card>
        <Card>
          <span>{t('quota_estimator.estimated_accounts')}</span>
          <strong>{summary.estimated}</strong>
        </Card>
        <Card>
          <span>{t('quota_estimator.total_remaining')}</span>
          <strong>{formatUSD(summary.remaining)}</strong>
        </Card>
      </section>

      <Card className={styles.tableCard}>
        <div className={styles.toolbar}>
          <div>
            <h2>{t('quota_estimator.account_overview')}</h2>
            <p>{t('quota_estimator.passive_hint')}</p>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('quota_estimator.search_placeholder')}
            className={styles.searchInput}
          />
        </div>

        {missingModels.length > 0 && (
          <div className={styles.warning}>
            {t('quota_estimator.missing_prices', { models: missingModels.join(', ') })}
          </div>
        )}

        {loading ? (
          <div className={styles.loading}>
            <LoadingSpinner />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className={styles.empty}>
            {t(search ? 'quota_estimator.search_empty' : 'quota_estimator.empty')}
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table>
              <thead>
                <tr>
                  <th>{t('quota_estimator.account')}</th>
                  <th>{t('quota_estimator.plan')}</th>
                  <th>{t('quota_estimator.primary_window')}</th>
                  <th>{t('quota_estimator.weekly_window')}</th>
                  <th>{t('quota_estimator.cycle_usage')}</th>
                  <th>{t('quota_estimator.full_capacity')}</th>
                  <th>{t('quota_estimator.confidence')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const primary = row.account?.primary;
                  return (
                    <tr key={row.key}>
                      <td>
                        <div className={styles.accountName}>{row.title}</div>
                        {row.subtitle && <div className={styles.accountMeta}>{row.subtitle}</div>}
                      </td>
                      <td>
                        <span className={styles.planBadge}>{row.planType}</span>
                      </td>
                      <td>
                        <WindowCell window={primary} locale={i18n.language} />
                      </td>
                      <td>
                        <WindowCell window={row.account?.secondary} locale={i18n.language} />
                      </td>
                      <td>
                        {primary ? (
                          <>
                            <strong>{formatUSD(primary.current_cycle_cost_usd)}</strong>
                            <small>{formatTokens(primary.current_cycle_tokens)} Tokens</small>
                          </>
                        ) : (
                          <span className={styles.muted}>
                            {t('quota_estimator.awaiting_sample')}
                          </span>
                        )}
                      </td>
                      <td>
                        {primary?.estimate_available ? (
                          <>
                            <strong>{formatUSD(primary.full_window_cost_usd)}</strong>
                            <small>{formatTokens(primary.full_window_tokens)} Tokens</small>
                          </>
                        ) : (
                          <span className={styles.muted}>--</span>
                        )}
                      </td>
                      <td>
                        {primary ? (
                          <span
                            className={`${styles.confidence} ${confidenceClass(primary.confidence)}`}
                          >
                            {t(`quota_estimator.confidence_${primary.confidence}`, {
                              defaultValue: primary.confidence,
                            })}
                          </span>
                        ) : (
                          <span className={styles.muted}>--</span>
                        )}
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
