import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import type { AuthFileCooldown } from '@/types/authFile';
import styles from './AuthFileCooldownStatus.module.scss';

type Props = {
  name: string;
  records?: AuthFileCooldown[] | null;
  observedAt: number;
  now: number;
};

export function AuthFileCooldownStatus({ name, records, observedAt, now }: Props) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  if (records === undefined) return null;
  if (records === null) return <span className={styles.unknown}>{t('auth_files.cooldown_unknown')}</span>;
  if (records.length === 0) return null;

  const elapsed = Math.max(0, (now - observedAt) / 1000);
  const remaining = (record: AuthFileCooldown) => Math.max(0, Math.ceil(record.remaining_seconds - elapsed));
  const credential = records.some((record) => record.scope === 'credential');
  const models = new Set(records.filter((record) => record.scope === 'model').map((record) => record.model_key)).size;
  const label = credential
    ? t('auth_files.cooldown_credential')
    : t('auth_files.cooldown_models', { count: models });
  const duration = (seconds: number) => {
    if (seconds === 0) return t('auth_files.cooldown_pending');
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours ? `${hours}h ` : ''}${minutes}m ${seconds % 60}s`;
  };
  const formatTime = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString(i18n.language);
  };

  return (
    <>
      <button type="button" className={styles.badge} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {label}
      </button>
      <span className={styles.remaining}>{duration(Math.min(...records.map(remaining)))}</span>
      <Modal open={open} onClose={() => setOpen(false)} title={t('auth_files.cooldown_details')} width={640}>
        <p className={styles.name}>{name}</p>
        <div className={styles.list}>
          {records.map((record, index) => (
            <section className={styles.record} key={`${record.scope}:${record.model_key}:${index}`}>
              <strong>{record.scope === 'credential' ? t('auth_files.cooldown_credential') : record.model_key}</strong>
              <span>{t(`auth_files.cooldown_reason_${record.reason}`, { defaultValue: record.reason })}</span>
              {record.http_status !== undefined && <span>HTTP {record.http_status}</span>}
              <span>{t('auth_files.cooldown_retry_at')}: {formatTime(record.retry_at)}</span>
              <span>{t('auth_files.cooldown_remaining')}: {duration(remaining(record))}</span>
            </section>
          ))}
        </div>
        <p className={styles.note}>{t('auth_files.cooldown_note')}</p>
      </Modal>
    </>
  );
}
