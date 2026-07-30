import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { ConfigSection } from '@/components/config/ConfigSection';
import { IconTrash2 } from '@/components/ui/icons';
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

export function ApiKeyGroupsSection({ values, disabled, onChange }: ApiKeyGroupsSectionProps) {
  const { t } = useTranslation();

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
        { id: makeClientId(), groupId, name: '', description: '', apiKeys: [] },
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
