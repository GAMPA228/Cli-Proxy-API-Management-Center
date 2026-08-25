import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { IconExternalLink, IconRefreshCw } from '@/components/ui/icons';
import { useConfigStore } from '@/stores';
import styles from './ProxyNodesPage.module.scss';

function resolveProxyNodesUrl(value?: string): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      parsed.username ||
      parsed.password
    ) {
      return '';
    }
    return parsed.href;
  } catch {
    return '';
  }
}

export function ProxyNodesPage() {
  const { t } = useTranslation();
  const configuredUrl = useConfigStore((state) => state.config?.managementUi?.proxyNodesUrl);
  const proxyNodesUrl = useMemo(() => resolveProxyNodesUrl(configuredUrl), [configuredUrl]);
  const [frameKey, setFrameKey] = useState(0);
  const [loaded, setLoaded] = useState(false);

  if (!proxyNodesUrl) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyTitle}>{t('proxy_nodes.not_configured')}</div>
        <div className={styles.emptyDescription}>{t('proxy_nodes.not_configured_description')}</div>
      </div>
    );
  }

  return (
    <section className={styles.page}>
      <header className={styles.toolbar}>
        <div className={styles.heading}>
          <h1>{t('proxy_nodes.title')}</h1>
          <span title={proxyNodesUrl}>{proxyNodesUrl}</span>
        </div>
        <div className={styles.actions}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setLoaded(false);
              setFrameKey((current) => current + 1);
            }}
            title={t('proxy_nodes.refresh')}
            aria-label={t('proxy_nodes.refresh')}
          >
            <IconRefreshCw size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open(proxyNodesUrl, '_blank', 'noopener,noreferrer')}
            title={t('proxy_nodes.open_external')}
            aria-label={t('proxy_nodes.open_external')}
          >
            <IconExternalLink size={16} />
          </Button>
        </div>
      </header>
      <div className={styles.frameShell}>
        {!loaded && <div className={styles.loading}>{t('proxy_nodes.loading')}</div>}
        <iframe
          key={frameKey}
          className={styles.frame}
          src={proxyNodesUrl}
          title={t('proxy_nodes.title')}
          referrerPolicy="strict-origin-when-cross-origin"
          allow="clipboard-read; clipboard-write"
          onLoad={() => setLoaded(true)}
        />
      </div>
    </section>
  );
}
