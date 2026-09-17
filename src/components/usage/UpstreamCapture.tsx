import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconCopy, IconDownload, IconRefreshCw, IconTrash2 } from '@/components/ui/icons';
import { capturesApi, type CaptureStatus, type UpstreamCapture } from '@/services/api/captures';
import { downloadBlob } from '@/utils/download';
import { copyToClipboard } from '@/utils/clipboard';
import { useNotificationStore } from '@/stores';
import styles from './UpstreamCapture.module.scss';

export function CaptureControls({ onRefresh }: { onRefresh: () => void }) {
  const { t } = useTranslation();
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const previousActive = useRef(0);
  const previousCaptured = useRef(0);
  const mounted = useRef(true);
  const changing = useRef(false);
  const revision = useRef(0);
  useEffect(() => {
    mounted.current = true;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const current = revision.current;
      try {
        if (changing.current) return;
        const value = await capturesApi.status();
        if (stopped || current !== revision.current || changing.current) return;
        if ((previousActive.current > 0 && value.active === 0) || previousCaptured.current !== value.captured) onRefresh();
        previousActive.current = value.active;
        previousCaptured.current = value.captured;
        setStatus(value);
        setError('');
      } catch {
        if (!stopped && current === revision.current)
          setError(t('usage_stats.capture_unavailable'));
      } finally {
        if (!stopped) timer = setTimeout(poll, 2000);
      }
    };
    void poll();
    const clock = setInterval(() => setNow(Date.now()), 500);
    return () => {
      stopped = true;
      mounted.current = false;
      clearTimeout(timer);
      clearInterval(clock);
    };
  }, [onRefresh, t]);
  const seconds = status ? Math.max(0, Math.ceil((Date.parse(status.until) - now) / 1000)) : 0;
  const enabled = Boolean(status?.enabled && seconds > 0);
  const toggle = async (value: boolean) => {
    if (changing.current) return;
    changing.current = true;
    revision.current++;
    setBusy(true);
    setError('');
    try {
      const next = await capturesApi.toggle(value);
      if (mounted.current) {
        setStatus(next);
        setNow(Date.now());
        onRefresh();
      }
    } catch (err) {
      if (mounted.current)
        setError(err instanceof Error ? err.message : t('usage_stats.capture_unavailable'));
    } finally {
      changing.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const requestToggle = (value: boolean) => {
    if (!value) {
      void toggle(false);
      return;
    }
    showConfirmation({
      title: t('usage_stats.capture_toggle'),
      message: t('usage_stats.capture_confirm'),
      onConfirm: () => toggle(true),
    });
  };
  return (
    <div className={styles.controls}>
      <ToggleSwitch
        checked={enabled}
        onChange={requestToggle}
        disabled={busy || !status}
        label={t('usage_stats.capture_toggle')}
      />
      {enabled && <span className={styles.counter}>{seconds}s</span>}
      {status && status.captured > 0 && (
        <span>{t('usage_stats.capture_count', { count: status.captured })}</span>
      )}
      {status && status.active > 0 && (
        <span>{t('usage_stats.capture_active', { count: status.active })}</span>
      )}
      <Button
        variant="ghost"
        size="sm"
        title={t('usage_stats.capture_refresh')}
        aria-label={t('usage_stats.capture_refresh')}
        onClick={onRefresh}
      >
        <IconRefreshCw size={16} />
      </Button>
      {(error || (status && (status.dropped > 0 || status.storage_errors > 0))) && (
        <span className={styles.error} role="status">
          {error || t('usage_stats.capture_limited')}
        </span>
      )}
    </div>
  );
}

function rawBytes(base64: string | null | undefined): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64 || ''), (char) => char.charCodeAt(0));
}
const decode = (data: string | null | undefined) => new TextDecoder().decode(rawBytes(data));
const previewLimit = 256 * 1024;

function formatBody(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    /* SSE and non-JSON bodies remain inspectable. */
  }
  if (/^(data|event):/m.test(raw)) {
    const events = raw
      .split(/\r?\n\r?\n/)
      .filter(Boolean)
      .map((event) => {
        const fields: Record<string, string> = {};
        const dataLines: string[] = [];
        for (const line of event.split(/\r?\n/)) {
          if (!line || line.startsWith(':')) continue;
          const separator = line.indexOf(':');
          const name = separator < 0 ? line : line.slice(0, separator);
          const value = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /, '');
          if (name === 'data') dataLines.push(value);
          else if (name === 'event' || name === 'id' || name === 'retry') fields[name] = value;
        }
        const data = dataLines.join('\n');
        try {
          return { ...fields, data: JSON.parse(data) };
        } catch {
          return { ...fields, data };
        }
      });
    return JSON.stringify(events, null, 2);
  }
  return raw;
}

type Tab = 'request' | 'headers' | 'response';

export function CaptureViewer({
  captureID,
  onClose,
}: {
  captureID: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<UpstreamCapture[]>([]);
  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState<Tab>('request');
  const [formatted, setFormatted] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const confirmationOpen = useNotificationStore((state) => state.confirmation.isOpen);
  const generation = useRef(0);
  const load = useCallback(async () => {
    if (!captureID) return;
    const current = ++generation.current;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const response = await capturesApi.get(captureID);
      if (generation.current === current) setItems(response.items || []);
    } catch (err) {
      if (generation.current === current) {
        setItems([]);
        setError(err instanceof Error ? err.message : t('usage_stats.capture_unavailable'));
      }
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, [captureID, t]);
  useEffect(() => {
    setItems([]);
    setIndex(0);
    setTab('request');
    setNotice('');
    void load();
    const requestGeneration = generation;
    return () => {
      requestGeneration.current++;
    };
  }, [load]);
  const item = items[Math.min(index, items.length - 1)];
  const raw = useMemo(() => {
    if (!item) return '';
    if (tab === 'headers')
      return JSON.stringify(
        {
          status: item.status,
          handshake_reused: item.handshake_reused,
          transport_decompressed: item.transport_decompressed ?? false,
          headers: item.response_headers,
          trailers: item.response_trailers,
        },
        null,
        2
      );
    if (tab === 'request') return decode(item.request_body);
    if (item.protocol === 'websocket' && item.frames?.length) {
      return item.frames.map((frame) => decode(frame.body)).join('\n');
    }
    return decode(item.response_body);
  }, [item, tab]);
  const text = useMemo(() => {
    if (raw.length > previewLimit) return raw.slice(0, previewLimit);
    if (!formatted || !item) return raw;
    if (tab === 'response' && item.protocol === 'websocket' && item.frames?.length) {
      return JSON.stringify(
        item.frames.map((frame) => {
          const value = decode(frame.body);
          try {
            return { at: frame.at, data: JSON.parse(value) };
          } catch {
            return { at: frame.at, data: value };
          }
        }),
        null,
        2
      );
    }
    return formatBody(raw);
  }, [formatted, item, raw, tab]);
  const download = () => {
    if (!item) return;
    const websocket = tab === 'response' && item.protocol === 'websocket' && item.frames?.length;
    const body =
      tab === 'headers' || websocket
        ? raw
        : rawBytes(tab === 'request' ? item.request_body : item.response_body);
    downloadBlob({
      filename: `capture-${item.id}-${tab}.${websocket ? 'ndjson' : 'txt'}`,
      blob: new Blob([body], { type: 'application/octet-stream' }),
    });
  };
  const remove = () => {
    if (!captureID) return;
    showConfirmation({
      title: t('usage_stats.capture_delete'),
      message: t('usage_stats.capture_delete_confirm'),
      variant: 'danger',
      onConfirm: async () => {
        try {
          await capturesApi.remove(captureID);
          onClose();
        } catch (err) {
          setError(err instanceof Error ? err.message : t('usage_stats.capture_unavailable'));
        }
      },
    });
  };
  return (
    <Modal
      open={Boolean(captureID)}
      title={t('usage_stats.capture_title')}
      onClose={onClose}
      width={1080}
      closeDisabled={confirmationOpen}
    >
      <div className={styles.viewer}>
        <div className={styles.toolbar}>
          <select
            aria-label={t('usage_stats.capture_attempt')}
            value={Math.min(index, Math.max(items.length - 1, 0))}
            onChange={(event) => setIndex(Number(event.target.value))}
            disabled={!items.length || loading}
          >
            {items.map((entry, i) => (
              <option key={entry.id} value={i}>
                {i + 1}. {entry.auth_id || entry.provider} · {entry.status || '-'} ·{' '}
                {new Date(entry.started_at).toLocaleTimeString()}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="ghost"
            disabled={loading}
            title={t('usage_stats.capture_refresh')}
            aria-label={t('usage_stats.capture_refresh')}
            onClick={() => void load()}
          >
            <IconRefreshCw size={16} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!item}
            title={t('usage_stats.capture_copy')}
            aria-label={t('usage_stats.capture_copy')}
            onClick={() =>
              void copyToClipboard(text).then((ok) =>
                ok
                  ? setNotice(t('usage_stats.capture_copied'))
                  : setError(t('usage_stats.capture_copy_failed'))
              )
            }
          >
            <IconCopy size={16} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!item}
            title={t('usage_stats.capture_download')}
            aria-label={t('usage_stats.capture_download')}
            onClick={download}
          >
            <IconDownload size={16} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!items.length || items.some((entry) => !entry.finished_at)}
            title={t('usage_stats.capture_delete')}
            aria-label={t('usage_stats.capture_delete')}
            onClick={() => void remove()}
          >
            <IconTrash2 size={16} />
          </Button>
        </div>
        {error && (
          <div role="alert" className={styles.error}>
            {error}
          </div>
        )}
        {notice && <div role="status">{notice}</div>}
        {loading ? (
          <div role="status">{t('common.loading')}</div>
        ) : !item ? (
          <div>{t('usage_stats.capture_empty')}</div>
        ) : (
          <>
            <dl className={styles.metadata}>
              <dt>{t('usage_stats.capture_endpoint')}</dt>
              <dd>
                {item.method} {item.url}
              </dd>
              <dt>{t('usage_stats.request_events_source_account')}</dt>
              <dd>{item.auth_id || '-'}</dd>
              <dt>{t('usage_stats.request_events_proxy')}</dt>
              <dd>{item.proxy || '-'}</dd>
              <dt>{t('usage_stats.capture_state')}</dt>
              <dd>
                {!item.finished_at
                  ? t('usage_stats.capture_recording')
                  : item.truncated
                    ? t('usage_stats.capture_truncated')
                    : t('usage_stats.capture_complete')}
                {item.reason ? ` · ${item.reason}` : ''}
                {item.handshake_reused ? ` · ${t('usage_stats.capture_reused')}` : ''}
              </dd>
            </dl>
            <div className={styles.tabs} role="tablist">
              {(['request', 'headers', 'response'] as Tab[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={tab === value}
                  onClick={() => setTab(value)}
                >
                  {t(`usage_stats.capture_${value}`)}
                </button>
              ))}
              <label className={styles.format}>
                <input
                  type="checkbox"
                  checked={formatted}
                  onChange={(event) => setFormatted(event.target.checked)}
                />
                {t('usage_stats.capture_format')}
              </label>
            </div>
            {item.transport_decompressed && (
              <div role="status">{t('usage_stats.capture_decompressed')}</div>
            )}
            {raw.length > previewLimit && (
              <div role="status">{t('usage_stats.capture_preview_limit')}</div>
            )}
            <pre className={styles.body} role="tabpanel">
              {text || '-'}
            </pre>
          </>
        )}
      </div>
    </Modal>
  );
}
