import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { IconPencil } from '@/components/ui/icons';
import { authFilesApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import { authDisplayName } from '@/utils/authDisplay';
import type { AuthFileItem } from '@/types/authFile';
import styles from './AuthFileName.module.scss';

export function AuthFileName({
  file,
  disabled,
  editable,
  onSaved,
}: {
  file: AuthFileItem;
  disabled: boolean;
  editable: boolean;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (disabled || pending.current) return;
    pending.current = true;
    setSaving(true);
    setError('');
    try {
      await authFilesApi.patchFields(file.name, { note: value.trim() });
      showNotification(t('auth_files.display_name_saved'), 'success');
      setOpen(false);
      await onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('auth_files.display_name_failed'));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  return (
    <>
      <div className={styles.row}>
        <span className={styles.name} title={`${authDisplayName(file)}\n${file.name}`}>
          {authDisplayName(file)}
        </span>
        {editable && (
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled || saving}
            title={t('auth_files.display_name_edit')}
            aria-label={t('auth_files.display_name_edit')}
            onClick={() => {
              setValue(typeof file.note === 'string' ? file.note : '');
              setError('');
              setOpen(true);
            }}
          >
            <IconPencil size={14} />
          </Button>
        )}
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        closeDisabled={saving}
        title={t('auth_files.display_name_edit')}
        footer={
          <>
            <Button variant="secondary" disabled={saving} onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button disabled={disabled} loading={saving} onClick={() => void save()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <p className={styles.original}>{file.name}</p>
        <Input
          label={t('auth_files.display_name')}
          value={value}
          disabled={saving}
          onChange={(event) => setValue(event.target.value)}
          error={error}
        />
      </Modal>
    </>
  );
}
