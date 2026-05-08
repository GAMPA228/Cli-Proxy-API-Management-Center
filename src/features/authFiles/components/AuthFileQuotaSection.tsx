import { useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  ANTIGRAVITY_CONFIG,
  CLAUDE_CONFIG,
  CODEX_CONFIG,
  GEMINI_CLI_CONFIG,
  KIMI_CONFIG
} from '@/components/quota';
import { useNotificationStore, useQuotaStore } from '@/stores';
import type {
  AntigravityQuotaState,
  AuthFileItem,
  ClaudeQuotaState,
  CodexQuotaState,
  GeminiCliQuotaState,
  KimiQuotaState
} from '@/types';
import { getStatusFromError } from '@/utils/quota';
import {
  isRuntimeOnlyAuthFile,
  resolveQuotaErrorMessage,
  type QuotaProviderType
} from '@/features/authFiles/constants';
import { QuotaProgressBar } from '@/features/authFiles/components/QuotaProgressBar';
import styles from '@/pages/AuthFilesPage.module.scss';

type QuotaState = { status?: string; error?: string; errorStatus?: number } | undefined;

const getQuotaConfig = (type: QuotaProviderType) => {
  if (type === 'antigravity') return ANTIGRAVITY_CONFIG;
  if (type === 'claude') return CLAUDE_CONFIG;
  if (type === 'codex') return CODEX_CONFIG;
  if (type === 'kimi') return KIMI_CONFIG;
  return GEMINI_CLI_CONFIG;
};

export type AuthFileQuotaSectionProps = {
  file: AuthFileItem;
  quotaType: QuotaProviderType;
  disableControls: boolean;
  compact?: boolean;
};

export function AuthFileQuotaSection(props: AuthFileQuotaSectionProps) {
  const { file, quotaType, disableControls, compact = false } = props;
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const quota = useQuotaStore((state) => {
    if (quotaType === 'antigravity') return state.antigravityQuota[file.name] as QuotaState;
    if (quotaType === 'claude') return state.claudeQuota[file.name] as QuotaState;
    if (quotaType === 'codex') return state.codexQuota[file.name] as QuotaState;
    if (quotaType === 'kimi') return state.kimiQuota[file.name] as QuotaState;
    return state.geminiCliQuota[file.name] as QuotaState;
  });

  const updateQuotaState = useQuotaStore((state) => {
    if (quotaType === 'antigravity') return state.setAntigravityQuota as unknown as (updater: unknown) => void;
    if (quotaType === 'claude') return state.setClaudeQuota as unknown as (updater: unknown) => void;
    if (quotaType === 'codex') return state.setCodexQuota as unknown as (updater: unknown) => void;
    if (quotaType === 'kimi') return state.setKimiQuota as unknown as (updater: unknown) => void;
    return state.setGeminiCliQuota as unknown as (updater: unknown) => void;
  });

  const refreshQuotaForFile = useCallback(async () => {
    if (disableControls) return;
    if (isRuntimeOnlyAuthFile(file)) return;
    if (file.disabled) return;
    if (quota?.status === 'loading') return;

    const config = getQuotaConfig(quotaType) as unknown as {
      i18nPrefix: string;
      fetchQuota: (file: AuthFileItem, t: TFunction) => Promise<unknown>;
      buildLoadingState: () => unknown;
      buildSuccessState: (data: unknown) => unknown;
      buildErrorState: (message: string, status?: number) => unknown;
      renderQuotaItems: (quota: unknown, t: TFunction, helpers: unknown) => unknown;
    };

    updateQuotaState((prev: Record<string, unknown>) => ({
      ...prev,
      [file.name]: config.buildLoadingState()
    }));

    try {
      const data = await config.fetchQuota(file, t);
      updateQuotaState((prev: Record<string, unknown>) => ({
        ...prev,
        [file.name]: config.buildSuccessState(data)
      }));
      showNotification(t('auth_files.quota_refresh_success', { name: file.name }), 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('common.unknown_error');
      const status = getStatusFromError(err);
      updateQuotaState((prev: Record<string, unknown>) => ({
        ...prev,
        [file.name]: config.buildErrorState(message, status)
      }));
      showNotification(t('auth_files.quota_refresh_failed', { name: file.name, message }), 'error');
    }
  }, [disableControls, file, quota?.status, quotaType, showNotification, t, updateQuotaState]);

  const config = getQuotaConfig(quotaType) as unknown as {
    i18nPrefix: string;
    renderQuotaItems: (quota: unknown, t: TFunction, helpers: unknown) => unknown;
  };

  const quotaStatus = quota?.status ?? 'idle';
  const canRefreshQuota = !disableControls && !file.disabled;
  const quotaErrorMessage = resolveQuotaErrorMessage(
    t,
    quota?.errorStatus,
    quota?.error || t('common.unknown_error')
  );

  const renderCompactQuota = () => {
    type CompactRow = { id: string; label: string; percent: number | null };
    const rows: CompactRow[] = [];

    if (quotaType === 'codex') {
      const state = quota as CodexQuotaState | undefined;
      const windows = state?.windows ?? [];
      const fiveHour =
        windows.find((window) => window.id === 'five-hour') ??
        windows.find((window) => window.id.includes('five-hour') && !window.id.includes('code-review')) ??
        null;
      const weekly =
        windows.find((window) => window.id === 'weekly') ??
        windows.find((window) => window.id.includes('weekly') && !window.id.includes('code-review')) ??
        null;
      const toPercent = (used: number | null | undefined) =>
        used === null || used === undefined ? null : Math.max(0, Math.min(100, 100 - used));

      rows.push(
        {
          id: 'five-hour',
          label: t('codex_quota.primary_window', { defaultValue: '5 小时限额' }),
          percent: toPercent(fiveHour?.usedPercent)
        },
        {
          id: 'weekly',
          label: t('codex_quota.secondary_window', { defaultValue: '周限额' }),
          percent: toPercent(weekly?.usedPercent)
        }
      );
    } else if (quotaType === 'claude') {
      const state = quota as ClaudeQuotaState | undefined;
      const windows = state?.windows ?? [];
      const first = windows.find((window) => window.id === 'five-hour') ?? windows[0] ?? null;
      const second =
        windows.find((window) => window.id === 'seven-day') ??
        windows.find((window) => window.id.includes('seven-day')) ??
        windows[1] ??
        null;
      const toPercent = (used: number | null | undefined) =>
        used === null || used === undefined ? null : Math.max(0, Math.min(100, 100 - used));

      rows.push(
        {
          id: first?.id ?? 'first',
          label: first?.label ?? t('claude_quota.five_hour', { defaultValue: '5 小时限额' }),
          percent: toPercent(first?.usedPercent)
        },
        {
          id: second?.id ?? 'second',
          label: second?.label ?? t('claude_quota.seven_day', { defaultValue: '7 天限额' }),
          percent: toPercent(second?.usedPercent)
        }
      );
    } else if (quotaType === 'gemini-cli') {
      const state = quota as GeminiCliQuotaState | undefined;
      const buckets = state?.buckets ?? [];
      rows.push(
        ...buckets.slice(0, 2).map((bucket) => ({
          id: bucket.id,
          label: bucket.label,
          percent:
            bucket.remainingFraction === null || bucket.remainingFraction === undefined
              ? null
              : Math.max(0, Math.min(100, Math.round(bucket.remainingFraction * 100)))
        }))
      );
    } else if (quotaType === 'kimi') {
      const state = quota as KimiQuotaState | undefined;
      const sourceRows = state?.rows ?? [];
      rows.push(
        ...sourceRows.slice(0, 2).map((row) => {
          const label = row.labelKey
            ? t(row.labelKey, (row.labelParams ?? {}) as Record<string, string | number>)
            : row.label ?? '-';
          const percent =
            row.limit > 0
              ? Math.max(0, Math.min(100, Math.round(((row.limit - row.used) / row.limit) * 100)))
              : null;
          return {
            id: row.id,
            label,
            percent
          };
        })
      );
    } else if (quotaType === 'antigravity') {
      const state = quota as AntigravityQuotaState | undefined;
      const groups = state?.groups ?? [];
      const lowestRemainingGroup = [...groups].sort((left, right) => left.remainingFraction - right.remainingFraction)[0] ?? null;
      rows.push({
        id: lowestRemainingGroup?.id ?? 'lowest',
        label: t('quota_management.detail_col_lowest_remaining', { defaultValue: '最低剩余' }),
        percent:
          lowestRemainingGroup === null
            ? null
            : Math.max(0, Math.min(100, Math.round(lowestRemainingGroup.remainingFraction * 100)))
      });
    }

    const effectiveRows = rows.filter((row, index, source) => row.label && source.findIndex((item) => item.id === row.id) === index);

    if (effectiveRows.length === 0) {
      return <div className={styles.authTableQuotaEmpty}>-</div>;
    }

    return (
      <div className={styles.authTableQuotaCell}>
        {effectiveRows.map((row) => (
          <div key={row.id} className={styles.authTableQuotaItem}>
            <div className={styles.authTableQuotaMeta}>
              <span className={styles.authTableQuotaLabel} title={row.label}>
                {row.label}
              </span>
              <span className={styles.authTableQuotaValue}>
                {row.percent === null ? '--' : `${Math.round(row.percent)}%`}
              </span>
            </div>
            <QuotaProgressBar
              percent={row.percent}
              highThreshold={quotaType === 'codex' || quotaType === 'claude' ? 80 : 60}
              mediumThreshold={quotaType === 'codex' || quotaType === 'claude' ? 50 : 20}
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={styles.quotaSection}>
      {quotaStatus === 'loading' ? (
        <div className={compact ? styles.authTableQuotaHint : styles.quotaMessage}>
          {t(`${config.i18nPrefix}.loading`)}
        </div>
      ) : quotaStatus === 'idle' ? (
        <button
          type="button"
          className={`${compact ? styles.authTableQuotaHint : styles.quotaMessage} ${styles.quotaMessageAction}`}
          onClick={() => void refreshQuotaForFile()}
          disabled={!canRefreshQuota}
        >
          {t(`${config.i18nPrefix}.idle`)}
        </button>
      ) : quotaStatus === 'error' ? (
        <div className={compact ? styles.authTableQuotaError : styles.quotaError}>
          {t(`${config.i18nPrefix}.load_failed`, {
            message: quotaErrorMessage
          })}
        </div>
      ) : quota ? (
        compact ? (
          renderCompactQuota()
        ) : (
          config.renderQuotaItems(quota, t, { styles, QuotaProgressBar }) as ReactNode
        )
      ) : (
        <div className={compact ? styles.authTableQuotaHint : styles.quotaMessage}>
          {t(`${config.i18nPrefix}.idle`)}
        </div>
      )}
    </div>
  );
}
