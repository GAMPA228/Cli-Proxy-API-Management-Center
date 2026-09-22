import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { Select } from '@/components/ui/Select';
import { UpstreamAuthSelector } from '@/components/config/ApiKeyGroupsSection';
import { authFilesApi } from '@/services/api/authFiles';
import type { AuthFileItem } from '@/types/authFile';
import { IconCheck, IconRefreshCw } from '@/components/ui/icons';
import { turnStateAutoRulesApi, type TurnStateAutoRules } from '@/services/api/turnStateAutoRules';
import { useNotificationStore } from '@/stores';
import styles from './UpstreamCapture.module.scss';

export function AutoTurnStateControls() {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [status, setStatus] = useState<TurnStateAutoRules | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [maxChars, setMaxChars] = useState('292');
  const [lifetimeSeconds, setLifetimeSeconds] = useState('3600');
  const [accountScope, setAccountScope] = useState<TurnStateAutoRules['account_scope']>('all');
  const [authIds, setAuthIds] = useState<string[]>([]);
  const [authFiles, setAuthFiles] = useState<AuthFileItem[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsFailed, setAccountsFailed] = useState(false);
  const accountsGeneration = useRef(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const changing = useRef(false);
  const loadAccounts = useCallback(async () => {
    const current = ++accountsGeneration.current;
    setAccountsLoading(true);
    setAccountsFailed(false);
    try {
      const response = await authFilesApi.list();
      if (current !== accountsGeneration.current) return;
      const files = Array.isArray(response) ? response : response.files;
      setAuthFiles(
        (Array.isArray(files) ? files : []).filter(
          (file: AuthFileItem) =>
            String(file.provider ?? file.type ?? '')
              .trim()
              .toLowerCase() === 'codex' &&
            String(file.account_type ?? file.accountType ?? '')
              .trim()
              .toLowerCase() !== 'api_key'
        )
      );
    } catch {
      if (current === accountsGeneration.current) setAccountsFailed(true);
    } finally {
      if (current === accountsGeneration.current) setAccountsLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadAccounts();
    const requestGeneration = accountsGeneration;
    return () => {
      requestGeneration.current++;
    };
  }, [loadAccounts]);
  const load = useCallback(async () => {
    const current = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const next = await turnStateAutoRulesApi.get();
      if (current !== generation.current) return;
      setStatus(next);
      setEnabled(next.enabled);
      setMaxChars(String(next.max_chars));
      setLifetimeSeconds(String(next.lifetime_seconds));
      setAccountScope(next.account_scope);
      setAuthIds(next.auth_ids);
    } catch {
      if (current === generation.current) setError(t('usage_stats.auto_turn_state_load_failed'));
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }, [t]);
  useEffect(() => {
    void load();
    const requestGeneration = generation;
    return () => {
      requestGeneration.current++;
    };
  }, [load]);
  const value = Number(maxChars);
  const valid = maxChars.trim() !== '' && Number.isInteger(value) && value >= 1 && value <= 8192;
  const lifetime = Number(lifetimeSeconds);
  const validLifetime = lifetimeSeconds.trim() !== '' && Number.isInteger(lifetime) && lifetime >= 60 && lifetime <= 3600;
  const dirty =
    status &&
    (enabled !== status.enabled ||
      value !== status.max_chars ||
      lifetime !== status.lifetime_seconds ||
      accountScope !== status.account_scope ||
      authIds.length !== status.auth_ids.length ||
      authIds.some((id) => !status.auth_ids.includes(id)));
  const save = async () => {
    if (!status || !valid || !validLifetime || busy || changing.current) return;
    changing.current = true;
    const current = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const next = await turnStateAutoRulesApi.save({
        enabled,
        max_chars: value,
        lifetime_seconds: lifetime,
        account_scope: accountScope,
        auth_ids: authIds,
      });
      if (current !== generation.current) return;
      setStatus(next);
      setEnabled(next.enabled);
      setMaxChars(String(next.max_chars));
      setLifetimeSeconds(String(next.lifetime_seconds));
      setAccountScope(next.account_scope);
      setAuthIds(next.auth_ids);
      showNotification(t('usage_stats.auto_turn_state_saved'), 'success');
    } catch {
      if (current === generation.current) setError(t('usage_stats.auto_turn_state_save_failed'));
    } finally {
      changing.current = false;
      if (current === generation.current) setBusy(false);
    }
  };
  return (
    <div className={styles.autoControls} aria-busy={busy}>
      <ToggleSwitch
        checked={enabled}
        onChange={setEnabled}
        disabled={busy || !status}
        label={t('usage_stats.auto_turn_state_toggle')}
      />
      <label className={styles.maxChars}>
        <span>{t('usage_stats.auto_turn_state_max_chars')}</span>
        <input
          type="number"
          min={1}
          max={8192}
          step={1}
          value={maxChars}
          disabled={busy || !status}
          aria-invalid={!valid}
          onChange={(event) => setMaxChars(event.target.value)}
        />
      </label>
      <label className={styles.maxChars}>
        <span>{t('usage_stats.auto_turn_state_lifetime')}</span>
        <input
          type="number"
          min={60}
          max={3600}
          step={1}
          value={lifetimeSeconds}
          disabled={busy || !status}
          aria-invalid={!validLifetime}
          onChange={(event) => setLifetimeSeconds(event.target.value)}
        />
      </label>
      <Select
        className={styles.accountScope}
        ariaLabel={t('usage_stats.auto_turn_state_scope')}
        value={accountScope}
        disabled={busy || !status}
        onChange={(scope) => setAccountScope(scope as TurnStateAutoRules['account_scope'])}
        options={[
          { value: 'all', label: t('usage_stats.auto_turn_state_all_accounts') },
          { value: 'selected', label: t('usage_stats.auto_turn_state_selected_accounts') },
        ]}
      />
      <Button
        variant="ghost"
        size="sm"
        className={styles.settingsButton}
        loading={busy}
        disabled={busy || (status ? !valid || !validLifetime || !dirty : false)}
        title={t(status ? 'common.save' : 'usage_stats.capture_refresh')}
        aria-label={t(status ? 'common.save' : 'usage_stats.capture_refresh')}
        onClick={() => void (status ? save() : load())}
      >
        {!busy && (status ? <IconCheck size={16} /> : <IconRefreshCw size={16} />)}
      </Button>
      {accountScope === 'selected' && (
        <div className={styles.accountPicker}>
          <UpstreamAuthSelector
            compact
            summary={t('usage_stats.auto_turn_state_selected_count', { count: authIds.length })}
            label={t('usage_stats.auto_turn_state_accounts')}
            value={authIds}
            files={authFiles}
            loading={accountsLoading}
            loadFailed={accountsFailed}
            disabled={busy || !status}
            onChange={setAuthIds}
            emptyLabel={t('usage_stats.auto_turn_state_no_accounts')}
            missingLabel={t('usage_stats.auto_turn_state_missing_account')}
            showHint={false}
          />
          {accountsFailed && (
            <Button
              variant="ghost"
              size="sm"
              disabled={accountsLoading}
              onClick={() => void loadAccounts()}
              title={t('usage_stats.auto_turn_state_retry_accounts')}
              aria-label={t('usage_stats.auto_turn_state_retry_accounts')}
            >
              <IconRefreshCw size={16} />
            </Button>
          )}
        </div>
      )}
      {(error || !valid || !validLifetime || Boolean(status?.storage_errors)) && (
        <span className={styles.settingsError} role="alert">
          {error ||
            t(
              !valid
                ? 'usage_stats.auto_turn_state_invalid'
                : !validLifetime
                  ? 'usage_stats.auto_turn_state_lifetime_invalid'
                  : 'usage_stats.auto_turn_state_storage_errors',
              { count: status?.storage_errors }
            )}
        </span>
      )}
    </div>
  );
}
