import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { IconRefreshCw } from '@/components/ui/icons';
import { authFilesApi } from '@/services/api';
import { useNotificationStore } from '@/stores';

type Props = {
  authIndex: string;
  name: string;
  disabled: boolean;
  onReset: () => Promise<void>;
};

export function AuthFileCooldownReset({ authIndex, name, disabled, onReset }: Props) {
  const { t } = useTranslation();
  const { showConfirmation, showNotification } = useNotificationStore();
  const [resetting, setResetting] = useState(false);
  const pending = useRef(false);

  const handleReset = () => {
    if (disabled || pending.current || !authIndex) return;
    showConfirmation({
      title: t('auth_files.cooldown_reset_button'),
      message: t('auth_files.cooldown_reset_confirm', { name }),
      confirmText: t('auth_files.cooldown_reset_button'),
      variant: 'primary',
      onConfirm: async () => {
        if (pending.current) return;
        pending.current = true;
        setResetting(true);
        try {
          await authFilesApi.resetCooldown(authIndex);
          showNotification(t('auth_files.cooldown_reset_success'), 'success');
        } catch (error: unknown) {
          showNotification(
            `${t('auth_files.cooldown_reset_failed')}: ${error instanceof Error ? error.message : String(error)}`,
            'error'
          );
          return;
        } finally {
          pending.current = false;
          setResetting(false);
        }
        await onReset();
      },
    });
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={disabled || resetting || !authIndex}
      loading={resetting}
      onClick={handleReset}
      title={t('auth_files.cooldown_reset_hint')}
    >
      {!resetting && <IconRefreshCw size={14} aria-hidden="true" />}
      {t('auth_files.cooldown_reset_button')}
    </Button>
  );
}
