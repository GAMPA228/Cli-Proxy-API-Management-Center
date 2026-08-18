import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { ConfigSection } from '@/components/config/ConfigSection';
import { IconChevronDown, IconTrash2 } from '@/components/ui/icons';
import { authFilesApi } from '@/services/api/authFiles';
import type { AuthFileItem } from '@/types/authFile';
import type { VisualApiKeyGroup, VisualConfigValues } from '@/types/visualConfig';
import { makeClientId } from '@/types/visualConfig';
import { ApiKeysCardEditor } from './VisualConfigEditorBlocks';
import styles from './VisualConfigEditor.module.scss';

interface ApiKeyGroupsSectionProps {
  values: VisualConfigValues;
  disabled?: boolean;
  onChange: (values: Partial<VisualConfigValues>) => void;
}

function createGroupId(): string {
  const suffix = makeClientId()
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 10)
    .toLowerCase();
  return `group-${suffix || Date.now().toString(36)}`;
}

const authFileID = (file: AuthFileItem): string => String(file.id ?? file.name ?? '').trim();

const isCodexAuthFile = (file: AuthFileItem): boolean => {
  const provider = String(file.provider ?? file.type ?? '')
    .trim()
    .toLowerCase();
  return provider === 'codex';
};

const authFileLabel = (file: AuthFileItem): string => {
  const primary = String(
    file.email ?? file.account ?? file.label ?? file.name ?? file.id ?? ''
  ).trim();
  const secondary = [
    file.label,
    file.name,
    file.accountType ?? file['account_type'] ?? file['plan_type'] ?? file['plan'],
  ]
    .map((value) => String(value ?? '').trim())
    .filter(
      (value, index, values) => value && value !== primary && values.indexOf(value) === index
    );
  return [primary || authFileID(file), ...secondary].join(' · ');
};

function UpstreamAuthSelector({
  value,
  files,
  loading,
  loadFailed,
  disabled,
  onChange,
}: {
  value: string[];
  files: AuthFileItem[];
  loading: boolean;
  loadFailed: boolean;
  disabled?: boolean;
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownRect, setDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const selected = useMemo(
    () => Array.from(new Set(value.map((item) => item.trim()).filter(Boolean))),
    [value]
  );
  const fileMap = useMemo(
    () =>
      new Map<string, AuthFileItem>(
        files.map((file) => [authFileID(file), file] as const).filter(([id]) => Boolean(id))
      ),
    [files]
  );
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const normalizedSearch = search.trim().toLowerCase();
  const options = useMemo(
    () =>
      files.filter((file) => {
        const id = authFileID(file);
        if (!id || selectedSet.has(id)) return false;
        if (!normalizedSearch) return true;
        return `${id} ${authFileLabel(file)} ${file.status ?? ''}`
          .toLowerCase()
          .includes(normalizedSearch);
      }),
    [files, normalizedSearch, selectedSet]
  );

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (pickerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setIsOpen(false);
      setSearch('');
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    const updateDropdownPosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 12;
      const gap = 4;
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding - gap;
      const spaceAbove = rect.top - viewportPadding - gap;
      const openAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
      const availableHeight = openAbove ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(72, Math.min(300, availableHeight));
      const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
      const left = Math.min(
        Math.max(viewportPadding, rect.left),
        window.innerWidth - width - viewportPadding
      );
      const top = openAbove
        ? Math.max(viewportPadding, rect.top - gap - maxHeight)
        : rect.bottom + gap;

      setDropdownRect({ top, left, width, maxHeight });
    };

    updateDropdownPosition();
    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, true);
    return () => {
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition, true);
    };
  }, [isOpen]);

  const addAuth = (authID: string) => {
    if (!authID || selectedSet.has(authID)) return;
    onChange([...selected, authID]);
    setSearch('');
  };

  return (
    <div className={`form-group ${styles.compactFormGroup}`}>
      <div className={styles.apiKeysMeta}>
        <label className={styles.apiKeysLabel}>
          {t('config_management.visual.api_key_groups.upstream_accounts')}
        </label>
        <span className={styles.apiKeysCount}>{selected.length}</span>
      </div>
      <div className={styles.upstreamAuthPicker} ref={pickerRef}>
        <button
          ref={triggerRef}
          type="button"
          className={styles.upstreamAuthTrigger}
          onClick={() => {
            setIsOpen((open) => !open);
            setSearch('');
          }}
          disabled={disabled || loading || loadFailed || (options.length === 0 && !isOpen)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span>
            {loading
              ? t('common.loading')
              : t('config_management.visual.api_key_groups.select_upstream_account')}
          </span>
          <IconChevronDown
            size={16}
            className={isOpen ? styles.upstreamAuthChevronOpen : styles.upstreamAuthChevron}
          />
        </button>
        {isOpen && !loading && !loadFailed && dropdownRect && typeof document !== 'undefined'
          ? createPortal(
              <div
                ref={dropdownRef}
                className={styles.upstreamAuthDropdown}
                style={{
                  position: 'fixed',
                  top: `${dropdownRect.top}px`,
                  left: `${dropdownRect.left}px`,
                  width: `${dropdownRect.width}px`,
                  maxHeight: `${dropdownRect.maxHeight}px`,
                }}
              >
                <input
                  className={`input ${styles.upstreamAuthSearch}`}
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setIsOpen(false);
                      setSearch('');
                    }
                  }}
                  placeholder={t(
                    'config_management.visual.api_key_groups.search_upstream_accounts'
                  )}
                  autoFocus
                />
                {options.length > 0 ? (
                  <div className={styles.upstreamAuthOptions} role="listbox">
                    {options.map((file) => {
                      const id = authFileID(file);
                      const unavailable = file.disabled === true || file.unavailable === true;
                      const status = String(file.status ?? '').trim();
                      return (
                        <button
                          key={id}
                          type="button"
                          className={styles.upstreamAuthOption}
                          onClick={() => addAuth(id)}
                          disabled={disabled}
                          role="option"
                          aria-selected="false"
                        >
                          <strong>{authFileLabel(file)}</strong>
                          <span>
                            {id}
                            {status ? ` · ${status}` : ''}
                            {unavailable
                              ? ` · ${t('config_management.visual.api_key_groups.account_unavailable')}`
                              : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.upstreamAuthEmpty}>
                    {t('config_management.visual.api_key_groups.no_matching_accounts')}
                  </div>
                )}
              </div>,
              document.body
            )
          : null}
      </div>
      {loading && <div className="hint">{t('common.loading')}</div>}
      {loadFailed && (
        <div className="hint">
          {t('config_management.visual.api_key_groups.account_load_failed')}
        </div>
      )}
      {selected.length === 0 ? (
        <div className={styles.apiKeysEmpty}>
          {t('config_management.visual.api_key_groups.accounts_unrestricted')}
        </div>
      ) : (
        <div className={styles.apiKeyGroupSelectionList}>
          {selected.map((authID) => {
            const file = fileMap.get(authID);
            const unavailable = file?.disabled === true || file?.unavailable === true;
            const status = String(file?.status ?? '').trim();
            return (
              <div key={authID} className={styles.apiKeyGroupSelectionItem}>
                <div className={styles.apiKeyGroupSelectionText}>
                  <strong>{file ? authFileLabel(file) : authID}</strong>
                  <span>
                    {file
                      ? `${authID}${status ? ` · ${status}` : ''}${unavailable ? ` · ${t('config_management.visual.api_key_groups.account_unavailable')}` : ''}`
                      : t('config_management.visual.api_key_groups.missing_account')}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className={styles.payloadRowActionButton}
                  onClick={() => onChange(selected.filter((item) => item !== authID))}
                  disabled={disabled}
                  title={t('config_management.visual.common.delete')}
                  aria-label={t('config_management.visual.common.delete')}
                >
                  <IconTrash2 size={16} />
                </Button>
              </div>
            );
          })}
        </div>
      )}
      <div className="hint">
        {t('config_management.visual.api_key_groups.upstream_accounts_hint')}
      </div>
    </div>
  );
}

export function ApiKeyGroupsSection({ values, disabled, onChange }: ApiKeyGroupsSectionProps) {
  const { t } = useTranslation();
  const [codexAuthFiles, setCodexAuthFiles] = useState<AuthFileItem[]>([]);
  const [authFilesLoading, setAuthFilesLoading] = useState(true);
  const [authFilesLoadFailed, setAuthFilesLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authFilesApi
      .list()
      .then((response) => {
        if (cancelled) return;
        const files = Array.isArray(response) ? response : response.files;
        setCodexAuthFiles((Array.isArray(files) ? files : []).filter(isCodexAuthFile));
        setAuthFilesLoadFailed(false);
      })
      .catch(() => {
        if (!cancelled) setAuthFilesLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setAuthFilesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateGroup = (index: number, patch: Partial<VisualApiKeyGroup>) => {
    onChange({
      apiKeyGroups: values.apiKeyGroups.map((group, groupIndex) =>
        groupIndex === index ? { ...group, ...patch } : group
      ),
    });
  };

  const addGroup = () => {
    const groupId = createGroupId();
    onChange({
      apiKeyGroups: [
        ...values.apiKeyGroups,
        {
          id: makeClientId(),
          groupId,
          name: '',
          description: '',
          apiKeys: [],
          upstreamAuthIds: [],
        },
      ],
    });
  };

  const removeGroup = (index: number) => {
    const group = values.apiKeyGroups[index];
    if (!group) return;
    const normalizedId = group.groupId.trim().toLowerCase();
    const references =
      values.thinkingPolicyCodexXhighGroups.filter((id) => id.trim().toLowerCase() === normalizedId)
        .length +
      values.serviceTierPolicyCodexAllowedGroups.filter(
        (id) => id.trim().toLowerCase() === normalizedId
      ).length +
      values.modelRewriteRules.reduce(
        (count, rule) =>
          count +
          (rule.bypassGroups ?? []).filter((id) => id.trim().toLowerCase() === normalizedId).length,
        0
      );
    if (
      references > 0 &&
      !window.confirm(
        t('config_management.visual.api_key_groups.delete_referenced_confirm', {
          name: group.name || group.groupId,
          count: references,
        })
      )
    ) {
      return;
    }

    onChange({
      apiKeyGroups: values.apiKeyGroups.filter((_, groupIndex) => groupIndex !== index),
      thinkingPolicyCodexXhighGroups: values.thinkingPolicyCodexXhighGroups.filter(
        (id) => id.trim().toLowerCase() !== normalizedId
      ),
      serviceTierPolicyCodexAllowedGroups: values.serviceTierPolicyCodexAllowedGroups.filter(
        (id) => id.trim().toLowerCase() !== normalizedId
      ),
      modelRewriteRules: values.modelRewriteRules.map((rule) => ({
        ...rule,
        bypassGroups: (rule.bypassGroups ?? []).filter(
          (id) => id.trim().toLowerCase() !== normalizedId
        ),
      })),
    });
  };

  return (
    <ConfigSection
      title={t('config_management.visual.api_key_groups.title')}
      description={t('config_management.visual.api_key_groups.description')}
    >
      <div className={styles.ruleEditor}>
        {values.apiKeyGroups.map((group, index) => (
          <div key={group.id} className={styles.ruleCard}>
            <div className={styles.ruleHeader}>
              <div className={styles.ruleHeaderMain}>
                <div className={styles.ruleTitle}>
                  {group.name || t('config_management.visual.api_key_groups.unnamed_group')}
                </div>
                <div className={styles.ruleMeta}>
                  <span className={styles.ruleMetaItem}>{group.groupId}</span>
                  <span className={styles.ruleMetaItem}>
                    {t('config_management.visual.api_key_groups.member_count', {
                      count: group.apiKeys.length,
                    })}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className={styles.payloadRowActionButton}
                onClick={() => removeGroup(index)}
                disabled={disabled}
                title={t('config_management.visual.common.delete')}
                aria-label={t('config_management.visual.common.delete')}
              >
                <IconTrash2 size={16} />
              </Button>
            </div>

            <div className={styles.apiKeyGroupFields}>
              <div className="form-group">
                <label>{t('config_management.visual.api_key_groups.name')}</label>
                <input
                  className="input"
                  value={group.name}
                  placeholder={t('config_management.visual.api_key_groups.name_placeholder')}
                  onChange={(event) => updateGroup(index, { name: event.target.value })}
                  disabled={disabled}
                />
              </div>
              <div className="form-group">
                <label>{t('config_management.visual.api_key_groups.description_label')}</label>
                <input
                  className="input"
                  value={group.description}
                  placeholder={t('config_management.visual.api_key_groups.description_placeholder')}
                  onChange={(event) => updateGroup(index, { description: event.target.value })}
                  disabled={disabled}
                />
              </div>
            </div>

            <ApiKeysCardEditor
              value={group.apiKeys.join('\n')}
              disabled={disabled}
              onChange={(value) =>
                updateGroup(index, {
                  apiKeys: value
                    .split('\n')
                    .map((key) => key.trim())
                    .filter(Boolean),
                })
              }
              label={t('config_management.visual.api_key_groups.members')}
              addLabel={t('config_management.visual.api_key_groups.add_member')}
              emptyLabel={t('config_management.visual.api_key_groups.no_members')}
              hint={t('config_management.visual.api_key_groups.members_hint')}
              selectEntries={values.apiKeyEntries}
              emptySelectLabel={t('config_management.visual.api_key_groups.no_available_members')}
              showGenerate={false}
              showEdit={false}
            />

            <UpstreamAuthSelector
              value={group.upstreamAuthIds}
              files={codexAuthFiles}
              loading={authFilesLoading}
              loadFailed={authFilesLoadFailed}
              disabled={disabled}
              onChange={(upstreamAuthIds) => updateGroup(index, { upstreamAuthIds })}
            />
          </div>
        ))}

        {values.apiKeyGroups.length === 0 && (
          <div className={styles.ruleEmpty}>
            {t('config_management.visual.api_key_groups.empty')}
          </div>
        )}

        <div className={styles.actionsEnd}>
          <Button variant="secondary" size="sm" onClick={addGroup} disabled={disabled}>
            {t('config_management.visual.api_key_groups.add_group')}
          </Button>
        </div>
      </div>
    </ConfigSection>
  );
}
