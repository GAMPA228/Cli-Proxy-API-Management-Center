import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ConfigSection } from '@/components/config/ConfigSection';
import { useAuthStore, useNotificationStore } from '@/stores';
import { MAX_REQUEST_TIMEOUT_SECONDS, MIN_REQUEST_TIMEOUT_SECONDS } from '@/utils/constants';
import { parseRequestTimeoutSeconds, requestTimeoutMsToSeconds } from '@/utils/requestTimeout';
import styles from './VisualConfigEditor.module.scss';

export function FrontendRequestTimeoutSection() {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const requestTimeoutMs = useAuthStore((state) => state.requestTimeoutMs);
  const setRequestTimeoutMs = useAuthStore((state) => state.setRequestTimeoutMs);

  const [requestTimeoutDraft, setRequestTimeoutDraft] = useState(() =>
    requestTimeoutMsToSeconds(requestTimeoutMs)
  );

  const savedRequestTimeoutSeconds = useMemo(
    () => requestTimeoutMsToSeconds(requestTimeoutMs),
    [requestTimeoutMs]
  );
  const parsedRequestTimeout = useMemo(
    () => parseRequestTimeoutSeconds(requestTimeoutDraft),
    [requestTimeoutDraft]
  );
  const requestTimeoutError = useMemo(
    () =>
      parsedRequestTimeout.isValid
        ? ''
        : t('config_management.visual.sections.frontend_timeout.invalid', {
            min: MIN_REQUEST_TIMEOUT_SECONDS,
            max: MAX_REQUEST_TIMEOUT_SECONDS,
          }),
    [parsedRequestTimeout.isValid, t]
  );
  const requestTimeoutDirty = requestTimeoutDraft.trim() !== savedRequestTimeoutSeconds;

  useEffect(() => {
    setRequestTimeoutDraft(savedRequestTimeoutSeconds);
  }, [savedRequestTimeoutSeconds]);

  const handleRequestTimeoutSave = useCallback(() => {
    if (!parsedRequestTimeout.isValid) {
      showNotification(requestTimeoutError, 'error');
      return;
    }

    setRequestTimeoutMs(parsedRequestTimeout.timeoutMs);
    showNotification(t('notification.request_timeout_updated'), 'success');
  }, [parsedRequestTimeout, requestTimeoutError, setRequestTimeoutMs, showNotification, t]);

  const handleRequestTimeoutReset = useCallback(() => {
    setRequestTimeoutDraft('');
    setRequestTimeoutMs(null);
    showNotification(t('notification.request_timeout_updated'), 'success');
  }, [setRequestTimeoutMs, showNotification, t]);

  return (
    <ConfigSection
      title={t('config_management.visual.sections.frontend_timeout.title')}
      description={t('config_management.visual.sections.frontend_timeout.description')}
    >
      <div className={styles.sectionStack}>
        <Input
          label={t('config_management.visual.sections.frontend_timeout.label')}
          value={requestTimeoutDraft}
          onChange={(event) => setRequestTimeoutDraft(event.target.value)}
          placeholder={t('config_management.visual.sections.frontend_timeout.placeholder')}
          hint={t('config_management.visual.sections.frontend_timeout.hint')}
          error={requestTimeoutError || undefined}
          inputMode="numeric"
          type="number"
          min={MIN_REQUEST_TIMEOUT_SECONDS}
          max={MAX_REQUEST_TIMEOUT_SECONDS}
        />
        <div className={styles.localConfigActions}>
          <Button
            variant="secondary"
            onClick={handleRequestTimeoutReset}
            disabled={!requestTimeoutMs && !requestTimeoutDraft}
          >
            {t('config_management.visual.sections.frontend_timeout.reset')}
          </Button>
          <Button
            onClick={handleRequestTimeoutSave}
            disabled={!requestTimeoutDirty || !parsedRequestTimeout.isValid}
          >
            {t('config_management.visual.sections.frontend_timeout.save')}
          </Button>
        </div>
      </div>
    </ConfigSection>
  );
}
