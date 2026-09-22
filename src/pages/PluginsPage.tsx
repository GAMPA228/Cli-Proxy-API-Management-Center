import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { AutoTurnStateControls } from '@/components/usage/AutoTurnStateControls';
import { RequestHeaderRulesPage } from '@/pages/RequestHeaderRulesPage';
import {
  IconCheck,
  IconDownload,
  IconExternalLink,
  IconRefreshCw,
  IconSettings,
  IconSidebarPlugins,
  IconTrash2,
} from '@/components/ui/icons';
import {
  pluginsApi,
  requireEnabledPlugin,
  type PluginEntry,
  type PluginList,
  type PluginStore,
  type StorePlugin,
} from '@/services/api/plugins';
import { useAuthStore, useNotificationStore } from '@/stores';
import { normalizeApiBase } from '@/utils/connection';
import styles from './PluginsPage.module.scss';

function resourcePath(id: string, path: string): string | null {
  const prefix = `/v0/resource/plugins/${encodeURIComponent(id)}/`;
  return path.startsWith(prefix) &&
    !path.includes('..') &&
    !path.includes('?') &&
    !path.includes('#')
    ? path
    : null;
}

function pluginVersion(value?: string): string {
  const version = value?.trim();
  return version ? (/^v/i.test(version) ? version : `v${version}`) : '';
}

export function PluginsPage() {
  const { t } = useTranslation();
  const { pluginId } = useParams<{ pluginId?: string }>();
  const navigate = useNavigate();
  const apiBase = useAuthStore((state) => state.apiBase);
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [list, setList] = useState<PluginList | null>(null);
  const [store, setStore] = useState<PluginStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeRequested, setStoreRequested] = useState(false);
  const [listError, setListError] = useState('');
  const [storeError, setStoreError] = useState('');
  const [busy, setBusy] = useState('');
  const [view, setView] = useState<'installed' | 'store'>('installed');
  const [query, setQuery] = useState('');
  const [configId, setConfigId] = useState('');
  const [configText, setConfigText] = useState('');
  const [configError, setConfigError] = useState('');
  const [removeId, setRemoveId] = useState('');
  const [menuIndex, setMenuIndex] = useState(0);
  const configPlugin = list?.plugins.find((plugin) => plugin.id === configId);
  const configReadOnly =
    loading || !!listError || !configPlugin?.registered || !configPlugin.effective_enabled;
  const codexSettings = configId === 'codex-headers';

  const load = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      setList(await pluginsApi.list());
    } catch {
      setListError(t('plugins.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);
  const loadStore = useCallback(async () => {
    setStoreRequested(true);
    setStoreLoading(true);
    setStoreError('');
    try {
      setStore(await pluginsApi.store());
    } catch {
      setStoreError(t('plugins.store_failed'));
    } finally {
      setStoreLoading(false);
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (view === 'store' && !storeRequested) void loadStore();
  }, [view, storeRequested, loadStore]);
  useEffect(() => setMenuIndex(0), [pluginId]);

  const run = async (key: string, action: () => Promise<unknown>, message: string) => {
    if (busy) return false;
    setBusy(key);
    try {
      const result = await action();
      await load();
      if (store) await loadStore();
      const restartRequired =
        result &&
        typeof result === 'object' &&
        'restart_required' in result &&
        result.restart_required;
      showNotification(
        restartRequired ? t('plugins.restart_required') : message,
        restartRequired ? 'warning' : 'success'
      );
      return true;
    } catch (error) {
      showNotification(
        error instanceof Error ? error.message : t('plugins.action_failed'),
        'error'
      );
      return false;
    } finally {
      setBusy('');
    }
  };

  const openConfig = async (id: string) => {
    if (busy) return;
    setConfigId(id);
    setConfigError('');
    setConfigText('');
    setBusy('config:' + id);
    try {
      setList(await pluginsApi.list());
      setListError('');
      if (id !== 'codex-headers') {
        setConfigText(JSON.stringify(await pluginsApi.config(id), null, 2));
      }
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : t('plugins.load_failed'));
    } finally {
      setBusy('');
    }
  };
  const saveConfig = async () => {
    if (configReadOnly || codexSettings || busy) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(configText);
    } catch {
      setConfigError(t('plugins.invalid_json'));
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setConfigError(t('plugins.invalid_json'));
      return;
    }
    if (
      await run(
        'config:' + configId,
        async () => {
          await requireEnabledPlugin(configId);
          return pluginsApi.saveConfig(configId, parsed as Record<string, unknown>);
        },
        t('plugins.saved')
      )
    ) {
      setConfigId('');
    }
  };
  const activePlugin = list?.plugins.find((plugin) => plugin.id === pluginId);
  const activeMenu = activePlugin?.menus[menuIndex] ?? activePlugin?.menus[0];
  const path = activeMenu && activePlugin ? resourcePath(activePlugin.id, activeMenu.path) : null;
  const panelUrl = path
    ? new URL(path, normalizeApiBase(apiBase) || window.location.origin).href
    : '';
  const installed = useMemo(
    () =>
      (list?.plugins ?? []).filter((plugin) =>
        (plugin.metadata?.name || plugin.id).toLowerCase().includes(query.trim().toLowerCase())
      ),
    [list, query]
  );
  const available = useMemo(
    () =>
      (store?.plugins ?? []).filter((plugin) =>
        (plugin.name || plugin.id).toLowerCase().includes(query.trim().toLowerCase())
      ),
    [store, query]
  );

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1>{pluginId ? activePlugin?.metadata?.name || pluginId : t('plugins.title')}</h1>
        <div className={styles.headerActions}>
          {pluginId && (
            <Button variant="secondary" size="sm" onClick={() => navigate('/plugins')}>
              {t('plugins.back')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            title={t('plugins.refresh')}
            aria-label={t('plugins.refresh')}
            disabled={loading || !!busy}
            onClick={() => void (pluginId || view === 'installed' ? load() : loadStore())}
          >
            <IconRefreshCw size={16} />
          </Button>
        </div>
      </header>

      {listError && (
        <div className={styles.error} role="alert">
          {listError}{' '}
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            {t('plugins.retry')}
          </Button>
        </div>
      )}
      {loading && !list && <div className={styles.state}>{t('plugins.loading')}</div>}

      {pluginId ? (
        !loading && (!activePlugin || !activePlugin.effective_enabled || !path) ? (
          <div className={styles.state}>{t('plugins.panel_unavailable')}</div>
        ) : panelUrl ? (
          <div className={styles.panel}>
            {activePlugin && activePlugin.menus.length > 1 && (
              <div className={styles.menuTabs}>
                {activePlugin.menus.map((menu, index) => (
                  <button
                    type="button"
                    key={menu.path}
                    className={index === menuIndex ? styles.activeTab : ''}
                    onClick={() => setMenuIndex(index)}
                  >
                    {menu.menu}
                  </button>
                ))}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className={styles.external}
              title={t('plugins.open_external')}
              aria-label={t('plugins.open_external')}
              onClick={() => window.open(panelUrl, '_blank', 'noopener,noreferrer')}
            >
              <IconExternalLink size={16} />
            </Button>
            <iframe
              key={panelUrl}
              src={panelUrl}
              title={activeMenu?.menu || pluginId}
              className={styles.frame}
            />
          </div>
        ) : null
      ) : (
        list && (
          <>
            <div className={styles.statusBar}>
              <span className={list.plugins_supported ? styles.ready : styles.unsupported}>
                {t(list.plugins_supported ? 'plugins.loader_ready' : 'plugins.loader_unavailable')}
              </span>
              <ToggleSwitch
                checked={list.plugins_enabled}
                disabled={(!list.plugins_supported && !list.plugins_enabled) || !!busy}
                label={t('plugins.global_switch')}
                onChange={(enabled) =>
                  void run('global', () => pluginsApi.setGlobal(enabled), t('plugins.saved'))
                }
              />
              <span className={styles.directory} title={list.plugins_dir}>
                {list.plugins_dir}
              </span>
            </div>
            <div className={styles.toolbar}>
              <div className={styles.tabs} role="tablist" aria-label={t('plugins.title')}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'installed'}
                  className={view === 'installed' ? styles.activeTab : ''}
                  onClick={() => setView('installed')}
                >
                  {t('plugins.installed')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'store'}
                  className={view === 'store' ? styles.activeTab : ''}
                  onClick={() => setView('store')}
                >
                  {t('plugins.store')}
                </button>
              </div>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className={styles.search}
                placeholder={t('plugins.search')}
                aria-label={t('plugins.search')}
              />
            </div>
            {view === 'installed' ? (
              installed.length ? (
                <div className={styles.list}>
                  {installed.map((plugin: PluginEntry) => (
                    <article className={styles.card} key={plugin.id}>
                      <div className={styles.cardHeader}>
                        <span className={styles.pluginIcon} aria-hidden="true">
                          <IconSidebarPlugins size={22} />
                        </span>
                        <div className={styles.info}>
                          <h2>{plugin.metadata?.name || plugin.id}</h2>
                          <span className={styles.pluginId}>{plugin.id}</span>
                        </div>
                      </div>
                      <div className={styles.badges}>
                        {pluginVersion(plugin.metadata?.version) && (
                          <span className={styles.badge}>
                            {pluginVersion(plugin.metadata?.version)}
                          </span>
                        )}
                        <span
                          className={`${styles.badge} ${plugin.effective_enabled ? styles.successBadge : ''}`}
                        >
                          {t(
                            plugin.effective_enabled
                              ? 'plugins.running'
                              : plugin.registered
                                ? 'plugins.inactive'
                                : 'plugins.not_loaded'
                          )}
                        </span>
                      </div>
                      <div className={styles.cardFooter}>
                        <div className={styles.actions}>
                          {plugin.menus.length > 0 && plugin.effective_enabled && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => navigate(`/plugins/${encodeURIComponent(plugin.id)}`)}
                            >
                              {t('plugins.open')}
                            </Button>
                          )}
                          <ToggleSwitch
                            checked={plugin.enabled}
                            disabled={!!busy || (!list.plugins_supported && !plugin.enabled)}
                            ariaLabel={t('plugins.enable_one', {
                              name: plugin.metadata?.name || plugin.id,
                            })}
                            onChange={(enabled) =>
                              void run(
                                plugin.id,
                                () => pluginsApi.setEnabled(plugin.id, enabled),
                                t('plugins.saved')
                              )
                            }
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            title={t('plugins.configure')}
                            aria-label={t('plugins.configure')}
                            disabled={!!busy}
                            onClick={() => void openConfig(plugin.id)}
                          >
                            <IconSettings size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title={t('plugins.remove')}
                            aria-label={t('plugins.remove')}
                            disabled={!!busy}
                            onClick={() => setRemoveId(plugin.id)}
                          >
                            <IconTrash2 size={16} />
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.state}>{t('plugins.no_plugins')}</div>
              )
            ) : (
              <>
                {storeError && (
                  <div className={styles.error} role="alert">
                    {storeError}{' '}
                    <Button variant="ghost" size="sm" onClick={() => void loadStore()}>
                      {t('plugins.retry')}
                    </Button>
                  </div>
                )}
                {storeLoading && !store ? (
                  <div className={styles.state}>{t('plugins.loading')}</div>
                ) : available.length ? (
                  <div className={styles.list}>
                    {available.map((plugin: StorePlugin) => (
                      <article className={styles.card} key={`${plugin.source_id}:${plugin.id}`}>
                        <div className={styles.cardHeader}>
                          <span className={styles.pluginIcon} aria-hidden="true">
                            <IconSidebarPlugins size={22} />
                          </span>
                          <div className={styles.info}>
                            <h2>{plugin.name || plugin.id}</h2>
                            <span className={styles.pluginId}>{plugin.id}</span>
                          </div>
                        </div>
                        <div className={styles.badges}>
                          <span className={styles.badge}>{plugin.source_id}</span>
                          {pluginVersion(plugin.version) && (
                            <span className={styles.badge}>{pluginVersion(plugin.version)}</span>
                          )}
                          {plugin.installed && (
                            <span className={`${styles.badge} ${styles.successBadge}`}>
                              {t('plugins.installed')}
                            </span>
                          )}
                        </div>
                        <p className={styles.description}>{plugin.description}</p>
                        <div className={styles.cardFooter}>
                          <span className={styles.author}>{plugin.author}</span>
                          <div className={styles.actions}>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={
                                !list.plugins_supported ||
                                !!busy ||
                                (plugin.installed && !plugin.update_available)
                              }
                              loading={busy === plugin.id}
                              onClick={() =>
                                void run(
                                  plugin.id,
                                  () => pluginsApi.install(plugin),
                                  t(
                                    plugin.installed
                                      ? 'plugins.update_started'
                                      : 'plugins.install_started'
                                  )
                                )
                              }
                            >
                              {plugin.installed && !plugin.update_available ? (
                                <IconCheck size={16} />
                              ) : plugin.update_available ? (
                                <IconRefreshCw size={16} />
                              ) : (
                                <IconDownload size={16} />
                              )}
                              {t(
                                plugin.installed
                                  ? plugin.update_available
                                    ? 'plugins.update'
                                    : 'plugins.installed'
                                  : 'plugins.install'
                              )}
                            </Button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  !storeError && <div className={styles.state}>{t('plugins.no_store_plugins')}</div>
                )}
                {(store?.source_errors ?? []).map((error) => (
                  <div className={styles.error} key={error.source_name}>
                    {error.source_name}: {error.message}
                  </div>
                ))}
              </>
            )}
          </>
        )
      )}

      <Modal
        open={!!configId}
        title={t('plugins.configure')}
        onClose={() => {
          if (!busy) setConfigId('');
        }}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfigId('')} disabled={!!busy}>
              {t('plugins.cancel')}
            </Button>
            {!codexSettings && !configReadOnly && (
              <Button
                onClick={() => void saveConfig()}
                disabled={!!busy || !!configError || !configText}
                loading={!!busy}
              >
                {t('plugins.save')}
              </Button>
            )}
          </>
        }
        width={codexSettings ? 1120 : 620}
      >
        {codexSettings ? (
          <div className={styles.codexSettings}>
            {configError && (
              <span role="alert" className={styles.error}>
                {configError}
              </span>
            )}
            {busy ? (
              <span>{t('plugins.loading')}</span>
            ) : (
              <>
                {!configReadOnly && !configError ? (
                  <AutoTurnStateControls />
                ) : (
                  <span>
                    {t('usage_stats.auto_turn_state_toggle')}:{' '}
                    {t(configPlugin?.registered ? 'plugins.inactive' : 'plugins.not_loaded')}
                  </span>
                )}
                <RequestHeaderRulesPage readOnly={configReadOnly || !!configError} />
              </>
            )}
          </div>
        ) : (
          <div className={styles.editor}>
            <span>{configId}</span>
            {configReadOnly && (
              <span>{t(configPlugin?.registered ? 'plugins.inactive' : 'plugins.not_loaded')}</span>
            )}
            <textarea
              readOnly={configReadOnly || codexSettings || !!busy}
              spellCheck={false}
              value={configText}
              onChange={(event) => {
                setConfigText(event.target.value);
                setConfigError('');
              }}
              aria-label={t('plugins.configure')}
              rows={14}
            />
            {configError && (
              <span role="alert" className={styles.error}>
                {configError}
              </span>
            )}
          </div>
        )}
      </Modal>
      <Modal
        open={!!removeId}
        title={t('plugins.remove')}
        onClose={() => {
          if (!busy) setRemoveId('');
        }}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoveId('')} disabled={!!busy}>
              {t('plugins.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={!!busy}
              onClick={() => {
                const id = removeId;
                void run(id, () => pluginsApi.remove(id), t('plugins.removed')).then((success) => {
                  if (success) setRemoveId('');
                });
              }}
            >
              {t('plugins.remove')}
            </Button>
          </>
        }
      >
        <p>{t('plugins.remove_confirm', { name: removeId })}</p>
      </Modal>
    </section>
  );
}
