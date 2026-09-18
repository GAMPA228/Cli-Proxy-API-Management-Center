import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
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
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const changing = useRef(false);
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
  const dirty = status && (enabled !== status.enabled || value !== status.max_chars);
  const save = async () => {
    if (!status || !valid || busy || changing.current) return;
    changing.current = true;
    const current = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const next = await turnStateAutoRulesApi.save({ enabled, max_chars: value });
      if (current !== generation.current) return;
      setStatus(next);
      setEnabled(next.enabled);
      setMaxChars(String(next.max_chars));
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
      <Button
        variant="ghost"
        size="sm"
        className={styles.settingsButton}
        loading={busy}
        disabled={busy || (status ? !valid || !dirty : false)}
        title={t(status ? 'common.save' : 'usage_stats.capture_refresh')}
        aria-label={t(status ? 'common.save' : 'usage_stats.capture_refresh')}
        onClick={() => void (status ? save() : load())}
      >
        {!busy && (status ? <IconCheck size={16} /> : <IconRefreshCw size={16} />)}
      </Button>
      {(error || !valid || Boolean(status?.storage_errors)) && (
        <span className={styles.settingsError} role="alert">
          {error ||
            t(
              !valid
                ? 'usage_stats.auto_turn_state_invalid'
                : 'usage_stats.auto_turn_state_storage_errors',
              { count: status?.storage_errors }
            )}
        </span>
      )}
    </div>
  );
}
