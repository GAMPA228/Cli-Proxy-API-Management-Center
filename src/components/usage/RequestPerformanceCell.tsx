import { useTranslation } from 'react-i18next';
import { getRequestOutputTps, latencySeverity } from '@/utils/usage/requestPerformance';
import styles from './RequestPerformanceCell.module.scss';

type Props = Parameters<typeof getRequestOutputTps>[0] & { firstTokenMs: number | null };

export function RequestPerformanceCell(props: Props) {
  const { t, i18n } = useTranslation();
  const firstSeverity = latencySeverity(props.firstTokenMs, true);
  const totalSeverity = latencySeverity(props.latencyMs);
  const rate = getRequestOutputTps(props);
  const duration = (ms: number | null) => {
    if (ms === null) return '\u2014';
    return ms < 1000
      ? `${ms.toLocaleString(i18n.language)} ms`
      : `${(ms / 1000).toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s`;
  };
  return (
    <td>
      <div className={styles.performance}>
        <span
          className={styles.bar}
          aria-hidden="true"
          style={{
            background: `linear-gradient(to bottom, var(--performance-${firstSeverity}) 40%, var(--performance-${totalSeverity}) 60%)`,
          }}
        />
        <div className={styles.metrics}>
          <span className={styles.label}>{t('usage_stats.request_events_first_token_short')}</span>
          <span className={styles[firstSeverity]}>{duration(props.firstTokenMs)}</span>
          <span className={styles.label}>{t('usage_stats.request_events_duration_short')}</span>
          <span className={styles[totalSeverity]}>{duration(props.latencyMs)}</span>
          <span className={styles.label} title={t('usage_stats.request_events_output_tps_hint')}>
            TPS
          </span>
          <span title={t('usage_stats.request_events_output_tps_hint')}>
            {rate === null
              ? '\u2014'
              : `${rate.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} tok/s`}
          </span>
        </div>
      </div>
    </td>
  );
}
