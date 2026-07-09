import { memo, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { IconCopy, IconPencil, IconTrash2 } from '@/components/ui/icons';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { useNotificationStore } from '@/stores';
import styles from './VisualConfigEditor.module.scss';
import { copyToClipboard } from '@/utils/clipboard';
import type {
  ModelRewriteRule,
  PayloadFilterRule,
  PayloadModelEntry,
  PayloadParamEntry,
  PayloadParamValidationErrorCode,
  PayloadParamValueType,
  PayloadRule,
  VisualApiKeyEntry,
} from '@/types/visualConfig';
import { makeClientId } from '@/types/visualConfig';
import {
  getPayloadParamValidationError,
  VISUAL_CONFIG_PAYLOAD_VALUE_TYPE_OPTIONS,
  VISUAL_CONFIG_PROTOCOL_OPTIONS,
} from '@/hooks/useVisualConfig';
import { maskApiKey } from '@/utils/format';
import { isValidApiKeyCharset } from '@/utils/validation';

function getValidationMessage(
  t: ReturnType<typeof useTranslation>['t'],
  errorCode?: PayloadParamValidationErrorCode
) {
  if (!errorCode) return undefined;
  return t(`config_management.visual.validation.${errorCode}`);
}

function formatApiKeySelectLabel(apiKey: string, remark?: string): string {
  const maskedKey = maskApiKey(apiKey);
  const trimmedRemark = remark?.trim();
  return trimmedRemark ? `${maskedKey}(${trimmedRemark})` : maskedKey;
}

export const ApiKeysCardEditor = memo(function ApiKeysCardEditor({
  value,
  entries,
  disabled,
  onChange,
  onEntriesChange,
  label,
  addLabel,
  emptyLabel,
  hint,
  editTitle,
  addTitle,
  inputLabel,
  inputPlaceholder,
  inputHint,
  showGenerate = true,
  showRemark = false,
}: {
  value: string;
  entries?: VisualApiKeyEntry[];
  disabled?: boolean;
  onChange: (nextValue: string) => void;
  onEntriesChange?: (nextEntries: VisualApiKeyEntry[]) => void;
  label?: string;
  addLabel?: string;
  emptyLabel?: string;
  hint?: string;
  editTitle?: string;
  addTitle?: string;
  inputLabel?: string;
  inputPlaceholder?: string;
  inputHint?: string;
  showGenerate?: boolean;
  showRemark?: boolean;
}) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const apiKeys = useMemo(
    () =>
      value
        .split('\n')
        .map((key) => key.trim())
        .filter(Boolean),
    [value]
  );
  const apiKeyEntries = useMemo<VisualApiKeyEntry[]>(
    () =>
      showRemark
        ? (entries ?? []).map((entry) => ({
            id: entry.id || makeClientId(),
            apiKey: entry.apiKey.trim(),
            remark: entry.remark.trim(),
          })).filter((entry) => entry.apiKey)
        : apiKeys.map((apiKey) => ({
            id: '',
            apiKey,
            remark: '',
          })),
    [apiKeys, entries, showRemark]
  );
  const [apiKeyIds, setApiKeyIds] = useState(() => apiKeys.map(() => makeClientId()));
  const renderApiKeyIds = useMemo(() => {
    if (showRemark) return apiKeyEntries.map((entry) => entry.id || makeClientId());
    if (apiKeyIds.length === apiKeyEntries.length) return apiKeyIds;
    if (apiKeyIds.length > apiKeyEntries.length) return apiKeyIds.slice(0, apiKeyEntries.length);
    return [...apiKeyIds, ...Array.from({ length: apiKeyEntries.length - apiKeyIds.length }, () => makeClientId())];
  }, [apiKeyEntries, apiKeyIds, showRemark]);

  const apiKeyInputId = useId();
  const apiKeyHintId = `${apiKeyInputId}-hint`;
  const apiKeyErrorId = `${apiKeyInputId}-error`;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingApiKeyId, setEditingApiKeyId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [inputRemark, setInputRemark] = useState('');
  const [formError, setFormError] = useState('');

  function generateSecureApiKey(): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const array = new Uint8Array(17);
    crypto.getRandomValues(array);
    return 'sk-' + Array.from(array, (b) => charset[b % charset.length]).join('');
  }

  const openAddModal = () => {
    setEditingApiKeyId(null);
    setInputValue('');
    setInputRemark('');
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (apiKeyId: string) => {
    const editingIndex = renderApiKeyIds.findIndex((id) => id === apiKeyId);
    setEditingApiKeyId(apiKeyId);
    setInputValue(apiKeyEntries[editingIndex]?.apiKey ?? '');
    setInputRemark(apiKeyEntries[editingIndex]?.remark ?? '');
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setInputValue('');
    setInputRemark('');
    setEditingApiKeyId(null);
    setFormError('');
  };

  const updateApiKeyEntries = (nextEntries: VisualApiKeyEntry[]) => {
    if (showRemark && onEntriesChange) {
      onEntriesChange(nextEntries);
      return;
    }
    onChange(nextEntries.map((entry) => entry.apiKey).join('\n'));
  };

  const handleDelete = (apiKeyId: string) => {
    const index = renderApiKeyIds.findIndex((id) => id === apiKeyId);
    if (index < 0) return;
    setApiKeyIds(renderApiKeyIds.filter((id) => id !== apiKeyId));
    updateApiKeyEntries(apiKeyEntries.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setFormError(t('config_management.visual.api_keys.error_empty'));
      return;
    }
    if (!isValidApiKeyCharset(trimmed)) {
      setFormError(t('config_management.visual.api_keys.error_invalid'));
      return;
    }

    const editingIndex = editingApiKeyId ? renderApiKeyIds.findIndex((id) => id === editingApiKeyId) : -1;
    const nextEntry: VisualApiKeyEntry = {
      id: editingApiKeyId ?? makeClientId(),
      apiKey: trimmed,
      remark: showRemark ? inputRemark.trim() : '',
    };
    const nextEntries =
      editingApiKeyId === null
        ? [...apiKeyEntries, nextEntry]
        : apiKeyEntries.map((entry, idx) => (idx === editingIndex ? { ...entry, ...nextEntry, id: entry.id } : entry));
    if (editingApiKeyId === null) {
      setApiKeyIds([...renderApiKeyIds, makeClientId()]);
    }
    updateApiKeyEntries(nextEntries);
    closeModal();
  };

  const handleCopy = async (apiKey: string) => {
    const copied = await copyToClipboard(apiKey);
    showNotification(
      t(copied ? 'notification.link_copied' : 'notification.copy_failed'),
      copied ? 'success' : 'error'
    );
  };

  const handleGenerate = () => {
    setInputValue(generateSecureApiKey());
    setFormError('');
  };

  return (
    <div className={`form-group ${styles.compactFormGroup}`}>
      <div className={styles.apiKeysHeader}>
        <div className={styles.apiKeysMeta}>
          <label className={styles.apiKeysLabel}>
            <span>{label ?? t('config_management.visual.api_keys.label')}</span>
          </label>
          <span className={styles.apiKeysCount}>{apiKeyEntries.length}</span>
        </div>
        <Button size="sm" onClick={openAddModal} disabled={disabled}>
          {addLabel ?? t('config_management.visual.api_keys.add')}
        </Button>
      </div>

      {apiKeyEntries.length === 0 ? (
        <div className={styles.apiKeysEmpty}>{emptyLabel ?? t('config_management.visual.api_keys.empty')}</div>
      ) : (
        <div className={styles.apiKeysList}>
          {apiKeyEntries.map((entry, index) => {
            const maskedKey = maskApiKey(String(entry.apiKey || ''));
            const displayLabel = entry.remark ? `${maskedKey}(${entry.remark})` : maskedKey;
            return (
            <div key={renderApiKeyIds[index] ?? `${entry.apiKey}-${index}`} className={styles.apiKeyRow}>
              <div className={styles.apiKeyLine}>
                <span className={styles.apiKeyIndex}>#{index + 1}</span>
                <div className={styles.apiKeyValueWrap}>
                  <div className={styles.apiKeyValue} title={displayLabel}>
                    {displayLabel}
                  </div>
                  {showRemark && entry.remark ? (
                    <div className={styles.apiKeyRemark} title={entry.remark}>
                      {entry.remark}
                    </div>
                  ) : null}
                </div>
                <div className={styles.apiKeyActions}>
                  <Button
                    variant="secondary"
                    size="sm"
                    className={styles.iconActionButton}
                    onClick={() => handleCopy(entry.apiKey)}
                    disabled={disabled}
                    title={t('common.copy')}
                    aria-label={t('common.copy')}
                  >
                    <IconCopy size={16} />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className={styles.iconActionButton}
                    onClick={() => openEditModal(renderApiKeyIds[index] ?? '')}
                    disabled={disabled}
                    title={t('config_management.visual.common.edit')}
                    aria-label={t('config_management.visual.common.edit')}
                  >
                    <IconPencil size={16} />
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    className={styles.iconActionButton}
                    onClick={() => handleDelete(renderApiKeyIds[index] ?? '')}
                    disabled={disabled}
                    title={t('config_management.visual.common.delete')}
                    aria-label={t('config_management.visual.common.delete')}
                  >
                    <IconTrash2 size={16} />
                  </Button>
                </div>
              </div>
            </div>
          );
          })}
        </div>
      )}

      <div className="hint">{hint ?? t('config_management.visual.api_keys.hint')}</div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        className={styles.apiKeyModal}
        title={
          editingApiKeyId !== null
            ? (editTitle ?? t('config_management.visual.api_keys.edit_title'))
            : (addTitle ?? t('config_management.visual.api_keys.add_title'))
        }
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={disabled}>
              {t('config_management.visual.common.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={disabled}>
              {editingApiKeyId !== null ? t('config_management.visual.common.update') : t('config_management.visual.common.add')}
            </Button>
          </>
        }
      >
        <div className="form-group">
          <label htmlFor={apiKeyInputId}>{inputLabel ?? t('config_management.visual.api_keys.input_label')}</label>
          <div className={styles.apiKeyModalInputRow}>
            <input
              id={apiKeyInputId}
              className="input"
              placeholder={inputPlaceholder ?? t('config_management.visual.api_keys.input_placeholder')}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={disabled}
              aria-describedby={formError ? `${apiKeyErrorId} ${apiKeyHintId}` : apiKeyHintId}
              aria-invalid={Boolean(formError)}
            />
            {showGenerate && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleGenerate}
                disabled={disabled}
              >
                {t('config_management.visual.api_keys.generate')}
              </Button>
            )}
          </div>
          <div id={apiKeyHintId} className="hint">
            {inputHint ?? t('config_management.visual.api_keys.input_hint')}
          </div>
          {formError && (
            <div id={apiKeyErrorId} className="error-box">
              {formError}
            </div>
          )}
        </div>
        {showRemark && (
          <div className="form-group">
            <label htmlFor={`${apiKeyInputId}-remark`}>
              {t('config_management.visual.api_keys.remark_label')}
            </label>
            <input
              id={`${apiKeyInputId}-remark`}
              className="input"
              placeholder={t('config_management.visual.api_keys.remark_placeholder')}
              value={inputRemark}
              onChange={(e) => setInputRemark(e.target.value)}
              disabled={disabled}
            />
            <div className="hint">
              {t('config_management.visual.api_keys.remark_hint')}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
});

const StringListEditor = memo(function StringListEditor({
  value,
  disabled,
  placeholder,
  inputAriaLabel,
  options,
  selectPlaceholder,
  emptyOptionsLabel,
  onChange,
}: {
  value: string[];
  disabled?: boolean;
  placeholder?: string;
  inputAriaLabel?: string;
  options?: ReadonlyArray<{ value: string; label: string }>;
  selectPlaceholder?: string;
  emptyOptionsLabel?: string;
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  const items = value.length ? value : [];
  const [selectedOption, setSelectedOption] = useState('');
  const optionList = useMemo(() => {
    if (!options?.length) return [];
    const selected = new Set(items.map((item) => item.trim()).filter(Boolean));
    return options.filter((option) => !selected.has(option.value));
  }, [items, options]);
  const [itemIds, setItemIds] = useState(() => items.map(() => makeClientId()));
  const renderItemIds = useMemo(() => {
    if (itemIds.length === items.length) return itemIds;
    if (itemIds.length > items.length) return itemIds.slice(0, items.length);
    return [...itemIds, ...Array.from({ length: items.length - itemIds.length }, () => makeClientId())];
  }, [itemIds, items.length]);

  const updateItem = (index: number, nextValue: string) =>
    onChange(items.map((item, i) => (i === index ? nextValue : item)));
  const addSelectedOption = (nextValue: string) => {
    const trimmed = nextValue.trim();
    if (!trimmed) return;
    if (items.some((item) => item.trim() === trimmed)) {
      setSelectedOption('');
      return;
    }
    setItemIds([...renderItemIds, makeClientId()]);
    onChange([...items, trimmed]);
    setSelectedOption('');
  };
  const addItem = () => {
    setItemIds([...renderItemIds, makeClientId()]);
    onChange([...items, '']);
  };
  const removeItem = (index: number) => {
    setItemIds(renderItemIds.filter((_, i) => i !== index));
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className={styles.ruleGroupBody}>
      {options ? (
        <div className={styles.selectAddRow}>
          <Select
            value={selectedOption}
            options={optionList}
            onChange={addSelectedOption}
            placeholder={
              optionList.length > 0
                ? ''
                : (emptyOptionsLabel ?? selectPlaceholder ?? placeholder)
            }
            disabled={disabled || optionList.length === 0}
            ariaLabel={inputAriaLabel ?? placeholder}
          />
        </div>
      ) : null}
      {items.map((item, index) => (
        <div key={renderItemIds[index] ?? `item-${index}`} className={styles.stringRow}>
          <input
            className={`input ${styles.stringInput}`}
            placeholder={placeholder}
            aria-label={inputAriaLabel ?? placeholder}
            value={item}
            onChange={(e) => updateItem(index, e.target.value)}
            disabled={disabled}
          />
          <Button
            variant="ghost"
            size="sm"
            className={styles.payloadRowActionButton}
            onClick={() => removeItem(index)}
            disabled={disabled}
            title={t('config_management.visual.common.delete')}
            aria-label={t('config_management.visual.common.delete')}
          >
            <IconTrash2 size={16} />
          </Button>
        </div>
      ))}
      <div className={styles.actionsEnd}>
        <Button variant="secondary" size="sm" onClick={addItem} disabled={disabled}>
          {t('config_management.visual.common.add')}
        </Button>
      </div>
    </div>
  );
});

export const ModelRewriteRulesEditor = memo(function ModelRewriteRulesEditor({
  value,
  apiKeyEntries,
  disabled,
  onChange,
}: {
  value: ModelRewriteRule[];
  apiKeyEntries?: VisualApiKeyEntry[];
  disabled?: boolean;
  onChange: (next: ModelRewriteRule[]) => void;
}) {
  const { t } = useTranslation();
  const rules = value.length ? value : [];
  const apiKeyOptions = useMemo(
    () =>
      (apiKeyEntries ?? [])
        .map((entry) => ({
          value: entry.apiKey.trim(),
          label: formatApiKeySelectLabel(entry.apiKey, entry.remark),
        }))
        .filter((option) => option.value),
    [apiKeyEntries]
  );

  const addRule = () =>
    onChange([
      ...rules,
      { id: makeClientId(), matchModels: [''], targetModel: '', bypassApiKeys: [] },
    ]);
  const removeRule = (ruleIndex: number) => onChange(rules.filter((_, i) => i !== ruleIndex));
  const updateRule = (ruleIndex: number, patch: Partial<ModelRewriteRule>) =>
    onChange(rules.map((rule, i) => (i === ruleIndex ? { ...rule, ...patch } : rule)));

  return (
    <div className={styles.ruleEditor}>
      {rules.map((rule, ruleIndex) => (
        <div key={rule.id} className={styles.ruleCard}>
          <div className={styles.ruleHeader}>
            <div className={styles.ruleHeaderMain}>
              <div className={styles.ruleTitle}>
                {t('config_management.visual.model_rewrite.rule')} {ruleIndex + 1}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className={styles.payloadRowActionButton}
              onClick={() => removeRule(ruleIndex)}
              disabled={disabled}
              title={t('config_management.visual.common.delete')}
              aria-label={t('config_management.visual.common.delete')}
            >
              <IconTrash2 size={16} />
            </Button>
          </div>

          <div className={styles.ruleGroup}>
            <div className={styles.ruleGroupHeader}>
              <div className={styles.ruleGroupTitle}>
                <span className={styles.ruleGroupLabel}>
                  {t('config_management.visual.model_rewrite.match_models')}
                </span>
                <span className={styles.ruleGroupCount}>{rule.matchModels.length}</span>
              </div>
            </div>
            <StringListEditor
              value={rule.matchModels}
              disabled={disabled}
              placeholder={t('config_management.visual.model_rewrite.match_model_placeholder')}
              inputAriaLabel={t('config_management.visual.model_rewrite.match_models')}
              onChange={(matchModels) => updateRule(ruleIndex, { matchModels })}
            />
          </div>

          <div className={styles.ruleGroup}>
            <div className={styles.ruleGroupHeader}>
              <div className={styles.ruleGroupTitle}>
                <span className={styles.ruleGroupLabel}>
                  {t('config_management.visual.model_rewrite.target_model')}
                </span>
              </div>
            </div>
            <input
              className="input"
              placeholder={t('config_management.visual.model_rewrite.target_model_placeholder')}
              value={rule.targetModel}
              onChange={(e) => updateRule(ruleIndex, { targetModel: e.target.value })}
              disabled={disabled}
            />
          </div>

          <div className={styles.ruleGroup}>
            <div className={styles.ruleGroupHeader}>
              <div className={styles.ruleGroupTitle}>
                <span className={styles.ruleGroupLabel}>
                  {t('config_management.visual.model_rewrite.bypass_api_keys')}
                </span>
                <span className={styles.ruleGroupCount}>{rule.bypassApiKeys.length}</span>
              </div>
            </div>
            <StringListEditor
              value={rule.bypassApiKeys}
              disabled={disabled}
              placeholder={t('config_management.visual.model_rewrite.bypass_api_key_placeholder')}
              inputAriaLabel={t('config_management.visual.model_rewrite.bypass_api_keys')}
              options={apiKeyOptions}
              selectPlaceholder={t('config_management.visual.model_rewrite.bypass_api_key_select_placeholder')}
              emptyOptionsLabel={t('config_management.visual.model_rewrite.bypass_api_key_no_options')}
              onChange={(bypassApiKeys) => updateRule(ruleIndex, { bypassApiKeys })}
            />
          </div>
        </div>
      ))}

      {rules.length === 0 && (
        <div className={styles.ruleEmpty}>{t('config_management.visual.model_rewrite.no_rules')}</div>
      )}

      <div className={styles.actionsEnd}>
        <Button variant="secondary" size="sm" onClick={addRule} disabled={disabled}>
          {t('config_management.visual.model_rewrite.add_rule')}
        </Button>
      </div>
    </div>
  );
});
export const PayloadRulesEditor = memo(function PayloadRulesEditor({
  value,
  disabled,
  protocolFirst = false,
  onChange,
}: {
  value: PayloadRule[];
  disabled?: boolean;
  protocolFirst?: boolean;
  onChange: (next: PayloadRule[]) => void;
}) {
  const { t } = useTranslation();
  const rules = value.length ? value : [];
  const protocolOptions = useMemo(
    () =>
      VISUAL_CONFIG_PROTOCOL_OPTIONS.map((option) => ({
        value: option.value,
        label: t(option.labelKey, { defaultValue: option.defaultLabel }),
      })),
    [t]
  );
  const payloadValueTypeOptions = useMemo(
    () =>
      VISUAL_CONFIG_PAYLOAD_VALUE_TYPE_OPTIONS.map((option) => ({
        value: option.value,
        label: t(option.labelKey, { defaultValue: option.defaultLabel }),
      })),
    [t]
  );
  const booleanValueOptions = useMemo(
    () => [
      { value: 'true', label: t('config_management.visual.payload_rules.boolean_true') },
      { value: 'false', label: t('config_management.visual.payload_rules.boolean_false') },
    ],
    [t]
  );

  const addRule = () => onChange([...rules, { id: makeClientId(), models: [], params: [] }]);
  const removeRule = (ruleIndex: number) => onChange(rules.filter((_, i) => i !== ruleIndex));

  const updateRule = (ruleIndex: number, patch: Partial<PayloadRule>) =>
    onChange(rules.map((rule, i) => (i === ruleIndex ? { ...rule, ...patch } : rule)));

  const addModel = (ruleIndex: number) => {
    const rule = rules[ruleIndex];
    const nextModel: PayloadModelEntry = { id: makeClientId(), name: '', protocol: undefined };
    updateRule(ruleIndex, { models: [...rule.models, nextModel] });
  };

  const removeModel = (ruleIndex: number, modelIndex: number) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, { models: rule.models.filter((_, i) => i !== modelIndex) });
  };

  const updateModel = (ruleIndex: number, modelIndex: number, patch: Partial<PayloadModelEntry>) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, {
      models: rule.models.map((m, i) => (i === modelIndex ? { ...m, ...patch } : m)),
    });
  };

  const addParam = (ruleIndex: number) => {
    const rule = rules[ruleIndex];
    const nextParam: PayloadParamEntry = {
      id: makeClientId(),
      path: '',
      valueType: 'string',
      value: '',
    };
    updateRule(ruleIndex, { params: [...rule.params, nextParam] });
  };

  const removeParam = (ruleIndex: number, paramIndex: number) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, { params: rule.params.filter((_, i) => i !== paramIndex) });
  };

  const updateParam = (ruleIndex: number, paramIndex: number, patch: Partial<PayloadParamEntry>) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, {
      params: rule.params.map((p, i) => (i === paramIndex ? { ...p, ...patch } : p)),
    });
  };

  const getValuePlaceholder = (valueType: PayloadParamValueType) => {
    switch (valueType) {
      case 'string':
        return t('config_management.visual.payload_rules.value_string');
      case 'number':
        return t('config_management.visual.payload_rules.value_number');
      case 'boolean':
        return t('config_management.visual.payload_rules.value_boolean');
      case 'json':
        return t('config_management.visual.payload_rules.value_json');
      default:
        return t('config_management.visual.payload_rules.value_default');
    }
  };

  const getParamErrorMessage = (param: PayloadParamEntry) => {
    const errorCode = getPayloadParamValidationError(param);
    return getValidationMessage(t, errorCode);
  };

  const renderParamValueEditor = (
    ruleIndex: number,
    paramIndex: number,
    param: PayloadParamEntry
  ) => {
    if (param.valueType === 'boolean') {
      return (
        <Select
          value={param.value.toLowerCase() === 'true' || param.value.toLowerCase() === 'false' ? param.value.toLowerCase() : ''}
          options={booleanValueOptions}
          placeholder={t('config_management.visual.payload_rules.value_boolean')}
          disabled={disabled}
          ariaLabel={t('config_management.visual.payload_rules.param_value')}
          onChange={(nextValue) => updateParam(ruleIndex, paramIndex, { value: nextValue })}
        />
      );
    }

    if (param.valueType === 'json') {
      return (
        <textarea
          className={`input ${styles.payloadJsonInput}`}
          placeholder={getValuePlaceholder(param.valueType)}
          aria-label={t('config_management.visual.payload_rules.param_value')}
          value={param.value}
          onChange={(e) => updateParam(ruleIndex, paramIndex, { value: e.target.value })}
          disabled={disabled}
        />
      );
    }

    return (
      <input
        className="input"
        placeholder={getValuePlaceholder(param.valueType)}
        aria-label={t('config_management.visual.payload_rules.param_value')}
        value={param.value}
        onChange={(e) => updateParam(ruleIndex, paramIndex, { value: e.target.value })}
        disabled={disabled}
      />
    );
  };

  return (
    <div className={styles.ruleEditor}>
      {rules.map((rule, ruleIndex) => (
        <div key={rule.id} className={styles.ruleCard}>
          <div className={styles.ruleHeader}>
            <div className={styles.ruleHeaderMain}>
              <div className={styles.ruleTitle}>
                {t('config_management.visual.payload_rules.rule')} {ruleIndex + 1}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className={styles.payloadRowActionButton}
              onClick={() => removeRule(ruleIndex)}
              disabled={disabled}
              title={t('config_management.visual.common.delete')}
              aria-label={t('config_management.visual.common.delete')}
            >
              <IconTrash2 size={16} />
            </Button>
          </div>

          <div className={styles.ruleGroup}>
            <div className={styles.ruleGroupHeader}>
              <div className={styles.ruleGroupTitle}>
                <span className={styles.ruleGroupLabel}>
                  {t('config_management.visual.payload_rules.models')}
                </span>
                <span className={styles.ruleGroupCount}>{rule.models.length}</span>
              </div>
              <Button variant="secondary" size="sm" onClick={() => addModel(ruleIndex)} disabled={disabled}>
                {t('config_management.visual.payload_rules.add_model')}
              </Button>
            </div>
            <div className={styles.ruleGroupBody}>
              {rule.models.length > 0 && (
                <div
                  className={[
                    styles.groupRowHeader,
                    protocolFirst ? styles.groupRowHeaderModelProtocolFirst : styles.groupRowHeaderModel,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span>
                    {protocolFirst
                      ? t('config_management.visual.payload_rules.provider_type')
                      : t('config_management.visual.payload_rules.model_name')}
                  </span>
                  <span>
                    {protocolFirst
                      ? t('config_management.visual.payload_rules.model_name')
                      : t('config_management.visual.payload_rules.provider_type')}
                  </span>
                  <span className={styles.groupRowHeaderAction} />
                </div>
              )}
              {rule.models.map((model, modelIndex) => (
                <div
                  key={model.id}
                  className={[
                    styles.payloadRuleModelRow,
                    protocolFirst ? styles.payloadRuleModelRowProtocolFirst : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {protocolFirst ? (
                    <>
                      <Select
                        value={model.protocol ?? ''}
                        options={protocolOptions}
                        disabled={disabled}
                        ariaLabel={t('config_management.visual.payload_rules.provider_type')}
                        onChange={(nextValue) =>
                          updateModel(ruleIndex, modelIndex, {
                            protocol: (nextValue || undefined) as PayloadModelEntry['protocol'],
                          })
                        }
                      />
                      <input
                        className="input"
                        placeholder={t('config_management.visual.payload_rules.model_name')}
                        value={model.name}
                        onChange={(e) => updateModel(ruleIndex, modelIndex, { name: e.target.value })}
                        disabled={disabled}
                      />
                    </>
                  ) : (
                    <>
                      <input
                        className="input"
                        placeholder={t('config_management.visual.payload_rules.model_name')}
                        value={model.name}
                        onChange={(e) => updateModel(ruleIndex, modelIndex, { name: e.target.value })}
                        disabled={disabled}
                      />
                      <Select
                        value={model.protocol ?? ''}
                        options={protocolOptions}
                        disabled={disabled}
                        ariaLabel={t('config_management.visual.payload_rules.provider_type')}
                        onChange={(nextValue) =>
                          updateModel(ruleIndex, modelIndex, {
                            protocol: (nextValue || undefined) as PayloadModelEntry['protocol'],
                          })
                        }
                      />
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className={styles.payloadRowActionButton}
                    onClick={() => removeModel(ruleIndex, modelIndex)}
                    disabled={disabled}
                    title={t('config_management.visual.common.delete')}
                    aria-label={t('config_management.visual.common.delete')}
                  >
                    <IconTrash2 size={16} />
                  </Button>
                </div>
              ))}
              {rule.models.length === 0 && (
                <div className={styles.groupEmpty}>{t('config_management.visual.payload_rules.no_models')}</div>
              )}
            </div>
          </div>

          <div className={styles.ruleGroup}>
            <div className={styles.ruleGroupHeader}>
              <div className={styles.ruleGroupTitle}>
                <span className={styles.ruleGroupLabel}>
                  {t('config_management.visual.payload_rules.params')}
                </span>
                <span className={styles.ruleGroupCount}>{rule.params.length}</span>
              </div>
              <Button variant="secondary" size="sm" onClick={() => addParam(ruleIndex)} disabled={disabled}>
                {t('config_management.visual.payload_rules.add_param')}
              </Button>
            </div>
            <div className={styles.ruleGroupBody}>
              {rule.params.length > 0 && (
                <div className={`${styles.groupRowHeader} ${styles.groupRowHeaderParam}`}>
                  <span>{t('config_management.visual.payload_rules.json_path')}</span>
                  <span>{t('config_management.visual.payload_rules.param_type')}</span>
                  <span>{t('config_management.visual.payload_rules.param_value')}</span>
                  <span className={styles.groupRowHeaderAction} />
                </div>
              )}
              {rule.params.map((param, paramIndex) => {
                const paramError = getParamErrorMessage(param);

                return (
                  <div key={param.id} className={styles.payloadRuleParamGroup}>
                    <div className={styles.payloadRuleParamRow}>
                      <input
                        className="input"
                        placeholder={t('config_management.visual.payload_rules.json_path')}
                        aria-label={t('config_management.visual.payload_rules.json_path')}
                        value={param.path}
                        onChange={(e) => updateParam(ruleIndex, paramIndex, { path: e.target.value })}
                        disabled={disabled}
                      />
                      <Select
                        value={param.valueType}
                        options={payloadValueTypeOptions}
                        disabled={disabled}
                        ariaLabel={t('config_management.visual.payload_rules.param_type')}
                        onChange={(nextValue) =>
                          updateParam(ruleIndex, paramIndex, {
                            valueType: nextValue as PayloadParamValueType,
                            value:
                              nextValue === 'boolean'
                                ? 'true'
                                : nextValue === 'json' && param.value.trim() === ''
                                  ? '{}'
                                  : param.value,
                          })
                        }
                      />
                      {renderParamValueEditor(ruleIndex, paramIndex, param)}
                      <Button
                        variant="ghost"
                        size="sm"
                        className={styles.payloadRowActionButton}
                        onClick={() => removeParam(ruleIndex, paramIndex)}
                        disabled={disabled}
                        title={t('config_management.visual.common.delete')}
                        aria-label={t('config_management.visual.common.delete')}
                      >
                        <IconTrash2 size={16} />
                      </Button>
                    </div>
                    {paramError && <div className={`error-box ${styles.payloadParamError}`}>{paramError}</div>}
                  </div>
                );
              })}
              {rule.params.length === 0 && (
                <div className={styles.groupEmpty}>{t('config_management.visual.payload_rules.no_rules')}</div>
              )}
            </div>
          </div>
        </div>
      ))}

      {rules.length === 0 && (
        <div className={styles.ruleEmpty}>{t('config_management.visual.payload_rules.no_rules')}</div>
      )}

      <div className={styles.actionsEnd}>
        <Button variant="secondary" size="sm" onClick={addRule} disabled={disabled}>
          {t('config_management.visual.payload_rules.add_rule')}
        </Button>
      </div>
    </div>
  );
});

export const PayloadFilterRulesEditor = memo(function PayloadFilterRulesEditor({
  value,
  disabled,
  onChange,
}: {
  value: PayloadFilterRule[];
  disabled?: boolean;
  onChange: (next: PayloadFilterRule[]) => void;
}) {
  const { t } = useTranslation();
  const rules = value.length ? value : [];
  const protocolOptions = useMemo(
    () =>
      VISUAL_CONFIG_PROTOCOL_OPTIONS.map((option) => ({
        value: option.value,
        label: t(option.labelKey, { defaultValue: option.defaultLabel }),
      })),
    [t]
  );

  const addRule = () => onChange([...rules, { id: makeClientId(), models: [], params: [] }]);
  const removeRule = (ruleIndex: number) => onChange(rules.filter((_, i) => i !== ruleIndex));

  const updateRule = (ruleIndex: number, patch: Partial<PayloadFilterRule>) =>
    onChange(rules.map((rule, i) => (i === ruleIndex ? { ...rule, ...patch } : rule)));

  const addModel = (ruleIndex: number) => {
    const rule = rules[ruleIndex];
    const nextModel: PayloadModelEntry = { id: makeClientId(), name: '', protocol: undefined };
    updateRule(ruleIndex, { models: [...rule.models, nextModel] });
  };

  const removeModel = (ruleIndex: number, modelIndex: number) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, { models: rule.models.filter((_, i) => i !== modelIndex) });
  };

  const updateModel = (ruleIndex: number, modelIndex: number, patch: Partial<PayloadModelEntry>) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, {
      models: rule.models.map((m, i) => (i === modelIndex ? { ...m, ...patch } : m)),
    });
  };

  return (
    <div className={styles.ruleEditor}>
      {rules.map((rule, ruleIndex) => (
        <div key={rule.id} className={styles.ruleCard}>
          <div className={styles.ruleHeader}>
            <div className={styles.ruleHeaderMain}>
              <div className={styles.ruleTitle}>
                {t('config_management.visual.payload_rules.rule')} {ruleIndex + 1}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className={styles.payloadRowActionButton}
              onClick={() => removeRule(ruleIndex)}
              disabled={disabled}
              title={t('config_management.visual.common.delete')}
              aria-label={t('config_management.visual.common.delete')}
            >
              <IconTrash2 size={16} />
            </Button>
          </div>

          <div className={styles.ruleGroup}>
            <div className={styles.ruleGroupHeader}>
              <div className={styles.ruleGroupTitle}>
                <span className={styles.ruleGroupLabel}>
                  {t('config_management.visual.payload_rules.models')}
                </span>
                <span className={styles.ruleGroupCount}>{rule.models.length}</span>
              </div>
              <Button variant="secondary" size="sm" onClick={() => addModel(ruleIndex)} disabled={disabled}>
                {t('config_management.visual.payload_rules.add_model')}
              </Button>
            </div>
            <div className={styles.ruleGroupBody}>
              {rule.models.length > 0 && (
                <div className={`${styles.groupRowHeader} ${styles.groupRowHeaderFilterModel}`}>
                  <span>{t('config_management.visual.payload_rules.model_name')}</span>
                  <span>{t('config_management.visual.payload_rules.provider_type')}</span>
                  <span className={styles.groupRowHeaderAction} />
                </div>
              )}
              {rule.models.map((model, modelIndex) => (
                <div key={model.id} className={styles.payloadFilterModelRow}>
                  <input
                    className="input"
                    placeholder={t('config_management.visual.payload_rules.model_name')}
                    aria-label={t('config_management.visual.payload_rules.model_name')}
                    value={model.name}
                    onChange={(e) => updateModel(ruleIndex, modelIndex, { name: e.target.value })}
                    disabled={disabled}
                  />
                  <Select
                    value={model.protocol ?? ''}
                    options={protocolOptions}
                    disabled={disabled}
                    ariaLabel={t('config_management.visual.payload_rules.provider_type')}
                    onChange={(nextValue) =>
                      updateModel(ruleIndex, modelIndex, {
                        protocol: (nextValue || undefined) as PayloadModelEntry['protocol'],
                      })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className={styles.payloadRowActionButton}
                    onClick={() => removeModel(ruleIndex, modelIndex)}
                    disabled={disabled}
                    title={t('config_management.visual.common.delete')}
                    aria-label={t('config_management.visual.common.delete')}
                  >
                    <IconTrash2 size={16} />
                  </Button>
                </div>
              ))}
              {rule.models.length === 0 && (
                <div className={styles.groupEmpty}>{t('config_management.visual.payload_rules.no_models')}</div>
              )}
            </div>
          </div>

          <div className={styles.ruleGroup}>
            <div className={styles.ruleGroupHeader}>
              <div className={styles.ruleGroupTitle}>
                <span className={styles.ruleGroupLabel}>
                  {t('config_management.visual.payload_rules.remove_params')}
                </span>
                <span className={styles.ruleGroupCount}>{rule.params.length}</span>
              </div>
            </div>
            <StringListEditor
              value={rule.params}
              disabled={disabled}
              placeholder={t('config_management.visual.payload_rules.json_path_filter')}
              inputAriaLabel={t('config_management.visual.payload_rules.json_path_filter')}
              onChange={(params) => updateRule(ruleIndex, { params })}
            />
          </div>
        </div>
      ))}

      {rules.length === 0 && (
        <div className={styles.ruleEmpty}>{t('config_management.visual.payload_rules.no_rules')}</div>
      )}

      <div className={styles.actionsEnd}>
        <Button variant="secondary" size="sm" onClick={addRule} disabled={disabled}>
          {t('config_management.visual.payload_rules.add_rule')}
        </Button>
      </div>
    </div>
  );
});
