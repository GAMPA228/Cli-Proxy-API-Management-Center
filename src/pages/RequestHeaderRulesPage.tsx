import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { IconPencil, IconRefreshCw, IconTimer, IconTrash2, IconX } from '@/components/ui/icons';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useAuthStore, useNotificationStore } from '@/stores';
import { validateRequestHeaderRules } from '@/features/authFiles/requestHeaderRules';
import {
  requestHeaderRulesApi,
  type HeaderRule,
  type HeaderRuleAccount,
  type HeaderRuleMutation,
} from '@/services/api/requestHeaderRules';
import styles from './RequestHeaderRulesPage.module.scss';

type Editor = {
  authId: string;
  revision: string;
  rule: HeaderRule;
};
const emptyRule = (): HeaderRule => ({
  id: '',
  name: '',
  operation: 'override',
  value: '',
  models: [],
  duration_minutes: 0,
});

export function RequestHeaderRulesPage() {
  const { t } = useTranslation();
  const connected = useAuthStore((state) => state.connectionStatus === 'connected');
  const { showNotification, showConfirmation } = useNotificationStore();
  const [accounts, setAccounts] = useState<HeaderRuleAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorError, setEditorError] = useState('');
  const [clock, setClock] = useState({ time: Date.now(), tick: performance.now() });
  const [tick, setTick] = useState(performance.now());
  const now = clock.time + Math.max(0, tick - clock.tick);
  const syncClock = (serverTime: string) => {
    setClock({ time: Date.parse(serverTime), tick: performance.now() });
    setTick(performance.now());
  };
  useEffect(() => {
    const timer = window.setInterval(() => setTick(performance.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const load = useCallback(async () => {
    if (!connected) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await requestHeaderRulesApi.list();
      setAccounts(response.accounts);
      syncClock(response.server_time);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('header_rules.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [connected, t]);
  useEffect(() => {
    void load();
  }, [load]);
  useHeaderRefresh(load);

  const label = (account: HeaderRuleAccount) =>
    account.note ? account.name + ' (' + account.note + ')' : account.name;
  const expired = (rule: HeaderRule) =>
    Boolean(rule.expires_at && Date.parse(rule.expires_at) <= now);
  const ruleStatus = (rule: HeaderRule) =>
    expired(rule) ? 'expired' : rule.active === false ? 'disabled' : 'active';
  const remaining = (rule: HeaderRule) => {
    if (!rule.expires_at) return t('header_rules.permanent');
    const seconds = Math.max(0, Math.ceil((Date.parse(rule.expires_at) - now) / 1000));
    if (!seconds) return t('header_rules.expired');
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  };
  const account = accounts.find((item) => item.auth_id === editor?.authId);
  const modelOptions = useMemo(
    () =>
      [...new Set(accounts.flatMap((item) => [...item.models, ...item.rules.flatMap((rule) => rule.models ?? [])]))]
        .sort()
        .map((value) => ({ value, label: value })),
    [accounts]
  );
  const rows = accounts
    .flatMap((item) => item.rules.map((rule) => ({ account: item, rule })))
    .filter(
      ({ account: item, rule }) =>
        (!accountFilter || item.auth_id === accountFilter) &&
        (!modelFilter || !rule.models?.length || rule.models.includes(modelFilter)) &&
        (!statusFilter || ruleStatus(rule) === statusFilter)
    );
  const ruleError = editor ? validateRequestHeaderRules([editor.rule]) : null;
  const disabled = !connected || busy || loading;
  const updateRule = (patch: Partial<HeaderRule>) => {
    setEditor((previous) =>
      previous ? { ...previous, rule: { ...previous.rule, ...patch } } : null
    );
    setEditorError('');
  };
  const mutate = async (input: HeaderRuleMutation) => {
    setBusy(true);
    setEditorError('');
    try {
      const response = await requestHeaderRulesApi.mutate(input);
      setAccounts((items) =>
        items.map((item) => (item.auth_id === response.account.auth_id ? response.account : item))
      );
      syncClock(response.server_time);
      setEditor(null);
      showNotification(t('header_rules.saved'), 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('header_rules.save_failed');
      setEditorError(message);
      showNotification(message, 'error');
      // Keep the edit's original revision: stale drafts must never silently overwrite new rules.
      await load();
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    if (!editor || !account || ruleError || editor.rule.source === 'turn-state-auto') return;
    const { name, operation, value, models, duration_minutes } = editor.rule;
    void mutate({
      auth_id: editor.authId,
      revision: editor.revision,
      action: 'save',
      id: editor.rule.id,
      rule: {
        name,
        operation,
        value: operation === 'delete' ? '' : value,
        models,
        duration_minutes,
      },
    });
  };
  const confirmAction = (
    account: HeaderRuleAccount,
    rule: HeaderRule,
    action: 'delete' | 'restart'
  ) => {
    if (rule.source === 'turn-state-auto') return;
    showConfirmation({
      title: t('header_rules.' + action),
      message: t('header_rules.' + action + '_confirm', {
        name: rule.name,
        account: label(account),
      }),
      variant: action === 'delete' ? 'danger' : 'primary',
      onConfirm: () =>
        mutate({ auth_id: account.auth_id, revision: account.revision, action, id: rule.id }),
    });
  };
  const open = (account?: HeaderRuleAccount, rule?: HeaderRule) => {
    if (rule?.source === 'turn-state-auto') return;
    const selected =
      account ?? accounts.find((item) => item.auth_id === accountFilter) ?? accounts[0];
    setEditorError('');
    setEditor({
      authId: selected?.auth_id ?? '',
      revision: selected?.revision ?? '',
      rule: rule ? { ...rule, models: [...(rule.models ?? [])] } : emptyRule(),
    });
  };
  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <h1>{t('header_rules.title')}</h1>
        <div className={styles.actions}>
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() => void load()}
            title={t('header_rules.refresh')}
            aria-label={t('header_rules.refresh')}
          >
            <IconRefreshCw size={18} />
          </Button>
          <Button disabled={disabled || !accounts.length} onClick={() => open()}>
            {t('header_rules.add')}
          </Button>
        </div>
      </div>
      <div className={styles.filters}>
        <Select
          ariaLabel={t('header_rules.account')}
          value={accountFilter}
          onChange={setAccountFilter}
          options={[
            { value: '', label: t('header_rules.all_accounts') },
            ...accounts.map((item) => ({ value: item.auth_id, label: label(item) })),
          ]}
        />
        <Select
          ariaLabel={t('header_rules.models')}
          value={modelFilter}
          onChange={setModelFilter}
          options={[{ value: '', label: t('header_rules.all_models') }, ...modelOptions]}
        />
        <Select
          ariaLabel={t('header_rules.status')}
          value={statusFilter}
          onChange={setStatusFilter}
          options={['', 'active', 'disabled', 'expired'].map((value) => ({
            value,
            label: t('header_rules.' + (value || 'all_status')),
          }))}
        />
      </div>
      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}
      {loading ? (
        <div className={styles.empty}>
          <LoadingSpinner />
        </div>
      ) : !rows.length ? (
        <div className={styles.empty}>
          {t(accounts.length ? 'header_rules.empty' : 'header_rules.no_accounts')}
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {['account', 'models', 'header', 'operation', 'value', 'status', 'actions'].map(
                  (key) => (
                    <th key={key}>{t('header_rules.' + key)}</th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ account, rule }) => (
                <tr key={account.auth_id + '/' + rule.id}>
                  <td>
                    {account.name}
                    {account.note && <div className={styles.note}>{account.note}</div>}
                  </td>
                  <td>
                    {rule.models?.length ? rule.models.join(', ') : t('header_rules.all_models')}
                  </td>
                  <td>
                    {rule.name}
                    {rule.source === 'turn-state-auto' && (
                      <span className={styles.sourceBadge}>{t('header_rules.auto_generated')}</span>
                    )}
                  </td>
                  <td>{t('auth_files.request_headers_' + rule.operation)}</td>
                  <td>
                    <div className={styles.value}>
                      {rule.operation === 'delete' ? '-' : rule.value || '-'}
                    </div>
                  </td>
                  <td
                    className={ruleStatus(rule) === 'active' ? styles.active : styles.expired}
                    title={rule.expires_at ? new Date(rule.expires_at).toLocaleString() : undefined}
                  >
                    {remaining(rule)}
                    {!expired(rule) && (rule.expires_at || rule.active === false) && (
                      <div className={styles.note}>
                        {t(
                          rule.source === 'turn-state-auto' &&
                            rule.active === false &&
                            rule.account_enabled === false
                            ? 'header_rules.account_disabled'
                            : 'header_rules.' + ruleStatus(rule)
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    {rule.source !== 'turn-state-auto' && (
                      <div className={styles.actions}>
                        <Button
                          variant="ghost"
                          className={styles.rowButton}
                          title={t('header_rules.edit')}
                          aria-label={t('header_rules.edit')}
                          disabled={disabled}
                          onClick={() => open(account, rule)}
                        >
                          <IconPencil size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          className={styles.rowButton}
                          title={t('header_rules.restart')}
                          aria-label={t('header_rules.restart')}
                          disabled={disabled || !rule.duration_minutes}
                          onClick={() => confirmAction(account, rule, 'restart')}
                        >
                          <IconTimer size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          className={styles.rowButton}
                          title={t('header_rules.delete')}
                          aria-label={t('header_rules.delete')}
                          disabled={disabled}
                          onClick={() => confirmAction(account, rule, 'delete')}
                        >
                          <IconTrash2 size={16} />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal
        open={Boolean(editor)}
        title={t(editor?.rule.id ? 'header_rules.edit' : 'header_rules.add')}
        width={720}
        onClose={() => setEditor(null)}
        closeDisabled={busy}
        footer={
          <div className={styles.actions}>
            <Button variant="secondary" disabled={busy} onClick={() => setEditor(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={disabled || !account || Boolean(ruleError)}
              loading={busy}
              onClick={save}
            >
              {t('common.save')}
            </Button>
          </div>
        }
      >
        {editor && (
          <div className={styles.form}>
            <div className={styles.field}>
              <label>{t('header_rules.account')}</label>
              <Select
                ariaLabel={t('header_rules.account')}
                value={editor.authId}
                disabled={busy || Boolean(editor.rule.id)}
                options={accounts.map((item) => ({ value: item.auth_id, label: label(item) }))}
                onChange={(authId) => {
                  const selected = accounts.find((item) => item.auth_id === authId);
                  setEditor({
                    ...editor,
                    authId,
                    revision: selected?.revision ?? '',
                    rule: { ...editor.rule, models: [] },
                  });
                }}
              />
            </div>
            <div className={styles.field}>
              <label>{t('header_rules.models')}</label>
              <div className={styles.models}>
                {editor.rule.models?.map((model) => (
                  <div key={model} className={styles.model}>
                    <span>{model}</span>
                    <Button
                      variant="ghost"
                      className={styles.rowButton}
                      disabled={busy}
                      aria-label={t('header_rules.remove_model', { model })}
                      title={t('header_rules.remove_model', { model })}
                      onClick={() =>
                        updateRule({ models: editor.rule.models?.filter((item) => item !== model) })
                      }
                    >
                      <IconX size={14} />
                    </Button>
                  </div>
                ))}
              </div>
              <Select
                ariaLabel={t('header_rules.models')}
                value=""
                disabled={busy}
                placeholder={t(
                  editor.rule.models?.length ? 'header_rules.add_model' : 'header_rules.all_models'
                )}
                options={(account?.models ?? [])
                  .filter((model) => !editor.rule.models?.includes(model))
                  .map((value) => ({ value, label: value }))}
                onChange={(model) => updateRule({ models: [...(editor.rule.models ?? []), model] })}
              />
            </div>
            <Input
              label={t('header_rules.header')}
              value={editor.rule.name}
              disabled={busy}
              onChange={(e) => updateRule({ name: e.target.value })}
            />
            <div className={styles.pair}>
              <div className={styles.field}>
                <label>{t('header_rules.operation')}</label>
                <Select
                  ariaLabel={t('header_rules.operation')}
                  value={editor.rule.operation}
                  disabled={busy}
                  options={['override', 'default', 'delete'].map((value) => ({
                    value,
                    label: t('auth_files.request_headers_' + value),
                  }))}
                  onChange={(operation) =>
                    updateRule({ operation: operation as HeaderRule['operation'] })
                  }
                />
              </div>
              <div className={styles.field}>
                <label>{t('header_rules.duration')}</label>
                <Select
                  ariaLabel={t('header_rules.duration')}
                  value={String(editor.rule.duration_minutes ?? 0)}
                  disabled={busy}
                  options={[0, 10, 20, 30, 40, 50, 60].map((value) => ({
                    value: String(value),
                    label: value
                      ? t('header_rules.minutes', { count: value })
                      : t('header_rules.permanent'),
                  }))}
                  onChange={(value) => updateRule({ duration_minutes: Number(value) })}
                />
              </div>
            </div>
            <Input
              label={t('header_rules.value')}
              value={editor.rule.operation === 'delete' ? '' : (editor.rule.value ?? '')}
              disabled={busy || editor.rule.operation === 'delete'}
              onChange={(e) => updateRule({ value: e.target.value })}
            />
            {editor.rule.expires_at && (
              <div className={styles.note}>
                {t('header_rules.expires_at')}: {new Date(editor.rule.expires_at).toLocaleString()}{' '}
                ({remaining(editor.rule)})
              </div>
            )}
            {ruleError && (
              <div role="alert" className={styles.error}>
                {t('auth_files.request_headers_' + ruleError.key, { row: ruleError.row })}
              </div>
            )}
            {editorError && (
              <div role="alert" className={styles.error}>
                {editorError}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
