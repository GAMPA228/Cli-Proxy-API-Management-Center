import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfigSection } from '@/components/config/ConfigSection';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import type { VisualConfigValues } from '@/types/visualConfig';
import type { ModelInfo } from '@/utils/models';
import { ApiKeyGroupSelector, ApiKeysCardEditor, StringListEditor } from './VisualConfigEditorBlocks';
import styles from './VisualConfigEditor.module.scss';

interface ServiceTierPolicySectionProps {
  values: VisualConfigValues;
  modelOptions: ModelInfo[];
  disabled: boolean;
  onChange: (values: Partial<VisualConfigValues>) => void;
}

export function ServiceTierPolicySection({
  values,
  modelOptions,
  disabled,
  onChange,
}: ServiceTierPolicySectionProps) {
  const { t } = useTranslation();
  const authorizedModeLabelId = useId();
  const unauthorizedActionLabelId = useId();
  const systemModelOptions = useMemo(() => {
    const seen = new Set<string>();
    return modelOptions
      .map((model) => {
        const value = model.name.trim();
        return {
          value,
          label: model.alias && model.alias !== value ? `${value} (${model.alias})` : value,
        };
      })
      .filter((option) => {
        const key = option.value.toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [modelOptions]);

  return (
    <ConfigSection
      title={t('config_management.visual.sections.service_tier_policy.title')}
      description={t('config_management.visual.sections.service_tier_policy.description')}
    >
      <div className={styles.sectionStack}>
        <div className={styles.toggleRow}>
          <div className={styles.toggleText}>
            <div className={styles.toggleTitle}>
              {t('config_management.visual.sections.service_tier_policy.codex_enable')}
            </div>
            <div className={styles.toggleDescription}>
              {t('config_management.visual.sections.service_tier_policy.codex_enable_desc')}
            </div>
          </div>
          <ToggleSwitch
            checked={values.serviceTierPolicyCodexEnabled}
            disabled={disabled}
            ariaLabel={t('config_management.visual.sections.service_tier_policy.codex_enable')}
            onChange={(serviceTierPolicyCodexEnabled) => onChange({ serviceTierPolicyCodexEnabled })}
          />
        </div>

        <div className={styles.serviceTierNotice}>
          {t('config_management.visual.sections.service_tier_policy.notice')}
        </div>

        <div className={styles.sectionGrid}>
          <div className={styles.fullWidthGridItem}>
            <div className="form-group">
              <label>
                {t('config_management.visual.sections.service_tier_policy.allowed_models', {
                  count: values.serviceTierPolicyCodexAllowedModels.length,
                })}
              </label>
              <StringListEditor
                value={values.serviceTierPolicyCodexAllowedModels}
                disabled={disabled}
                placeholder={t('config_management.visual.sections.service_tier_policy.allowed_model_placeholder')}
                inputAriaLabel={t('config_management.visual.sections.service_tier_policy.allowed_models_label')}
                options={systemModelOptions}
                selectPlaceholder={t('config_management.visual.sections.service_tier_policy.model_select_placeholder')}
                emptyOptionsLabel={t('config_management.visual.sections.service_tier_policy.model_select_empty')}
                onChange={(serviceTierPolicyCodexAllowedModels) =>
                  onChange({ serviceTierPolicyCodexAllowedModels })
                }
              />
              <div className="hint">
                {t('config_management.visual.sections.service_tier_policy.allowed_models_hint')}
              </div>
            </div>
          </div>

          <div className={styles.fullWidthGridItem}>
            <ApiKeyGroupSelector
              value={values.serviceTierPolicyCodexAllowedGroups}
              groups={values.apiKeyGroups}
              label={t('config_management.visual.sections.service_tier_policy.allowed_groups')}
              hint={t('config_management.visual.sections.service_tier_policy.allowed_groups_hint')}
              disabled={disabled}
              onChange={(serviceTierPolicyCodexAllowedGroups) =>
                onChange({ serviceTierPolicyCodexAllowedGroups })
              }
            />
          </div>

          <div className={styles.fullWidthGridItem}>
            <ApiKeysCardEditor
              value={values.serviceTierPolicyCodexAllowedApiKeysText}
              disabled={disabled}
              onChange={(serviceTierPolicyCodexAllowedApiKeysText) =>
                onChange({ serviceTierPolicyCodexAllowedApiKeysText })
              }
              label={t('config_management.visual.sections.service_tier_policy.allowed_api_keys')}
              addLabel={t('config_management.visual.sections.service_tier_policy.allowed_api_keys_add')}
              emptyLabel={t('config_management.visual.sections.service_tier_policy.allowed_api_keys_empty')}
              hint={t('config_management.visual.sections.service_tier_policy.allowed_api_keys_hint')}
              editTitle={t('config_management.visual.sections.service_tier_policy.allowed_api_keys_edit_title')}
              addTitle={t('config_management.visual.sections.service_tier_policy.allowed_api_keys_add_title')}
              inputLabel={t('config_management.visual.sections.service_tier_policy.allowed_api_keys_input_label')}
              inputPlaceholder={t('config_management.visual.sections.service_tier_policy.allowed_api_keys_placeholder')}
              inputHint={t('config_management.visual.sections.service_tier_policy.allowed_api_keys_input_hint')}
              selectEntries={values.apiKeyEntries}
              emptySelectLabel={t('config_management.visual.sections.service_tier_policy.allowed_api_keys_no_options')}
              showGenerate={false}
              showEdit={false}
            />
          </div>

          <div className="form-group">
            <label id={authorizedModeLabelId} htmlFor={`${authorizedModeLabelId}-select`}>
              {t('config_management.visual.sections.service_tier_policy.authorized_mode')}
            </label>
            <Select
              id={`${authorizedModeLabelId}-select`}
              value={values.serviceTierPolicyCodexAuthorizedMode}
              options={[
                {
                  value: 'request-only',
                  label: t('config_management.visual.sections.service_tier_policy.authorized_request_only'),
                },
                {
                  value: 'force-priority',
                  label: t('config_management.visual.sections.service_tier_policy.authorized_force_priority'),
                },
              ]}
              disabled={disabled}
              ariaLabelledBy={authorizedModeLabelId}
              onChange={(mode) =>
                onChange({
                  serviceTierPolicyCodexAuthorizedMode:
                    mode === 'force-priority' ? 'force-priority' : 'request-only',
                })
              }
            />
            <div className="hint">
              {t('config_management.visual.sections.service_tier_policy.authorized_mode_hint')}
            </div>
          </div>

          <div className="form-group">
            <label id={unauthorizedActionLabelId} htmlFor={`${unauthorizedActionLabelId}-select`}>
              {t('config_management.visual.sections.service_tier_policy.unauthorized_action')}
            </label>
            <Select
              id={`${unauthorizedActionLabelId}-select`}
              value={values.serviceTierPolicyCodexUnauthorizedAction}
              options={[
                {
                  value: 'strip',
                  label: t('config_management.visual.sections.service_tier_policy.unauthorized_strip'),
                },
                {
                  value: 'reject',
                  label: t('config_management.visual.sections.service_tier_policy.unauthorized_reject'),
                },
              ]}
              disabled={disabled}
              ariaLabelledBy={unauthorizedActionLabelId}
              onChange={(action) =>
                onChange({
                  serviceTierPolicyCodexUnauthorizedAction: action === 'reject' ? 'reject' : 'strip',
                })
              }
            />
            <div className="hint">
              {t('config_management.visual.sections.service_tier_policy.unauthorized_action_hint')}
            </div>
          </div>
        </div>

        {values.serviceTierPolicyCodexUnauthorizedAction === 'reject' && (
          <Input
            label={t('config_management.visual.sections.service_tier_policy.reject_message')}
            value={values.serviceTierPolicyCodexRejectMessage}
            disabled={disabled}
            hint={t('config_management.visual.sections.service_tier_policy.reject_message_hint')}
            onChange={(event) => onChange({ serviceTierPolicyCodexRejectMessage: event.target.value })}
          />
        )}
      </div>
    </ConfigSection>
  );
}
