export type PayloadParamValueType = 'string' | 'number' | 'boolean' | 'json';
export type PayloadParamValidationErrorCode =
  | 'payload_invalid_number'
  | 'payload_invalid_boolean'
  | 'payload_invalid_json';

export type VisualConfigFieldPath =
  | 'port'
  | 'logsMaxTotalSizeMb'
  | 'requestRetry'
  | 'maxRetryInterval'
  | 'streaming.keepaliveSeconds'
  | 'streaming.bootstrapRetries'
  | 'streaming.nonstreamKeepaliveInterval';

export type VisualConfigValidationErrorCode = 'port_range' | 'non_negative_integer';

export type VisualConfigValidationErrors = Partial<
  Record<VisualConfigFieldPath, VisualConfigValidationErrorCode>
>;

export type PayloadParamEntry = {
  id: string;
  path: string;
  valueType: PayloadParamValueType;
  value: string;
};

export type PayloadModelEntry = {
  id: string;
  name: string;
  protocol?: 'openai' | 'openai-response' | 'gemini' | 'claude' | 'codex' | 'antigravity';
};

export type PayloadRule = {
  id: string;
  models: PayloadModelEntry[];
  params: PayloadParamEntry[];
};

export type PayloadFilterRule = {
  id: string;
  models: PayloadModelEntry[];
  params: string[];
};

export type ModelRewriteRule = {
  id: string;
  matchModels: string[];
  targetModel: string;
  targetThinkingEffort: string;
  bypassApiKeys: string[];
  bypassGroups: string[];
};

export type VisualApiKeyGroup = {
  id: string;
  groupId: string;
  name: string;
  description: string;
  apiKeys: string[];
};

export type VisualApiKeyEntry = {
  id: string;
  apiKey: string;
  remark: string;
};

export interface StreamingConfig {
  keepaliveSeconds: string;
  bootstrapRetries: string;
  nonstreamKeepaliveInterval: string;
}

export type CodexThinkingDefaultEffort = 'low' | 'medium' | 'high';
export type CodexServiceTierAuthorizedMode = 'request-only' | 'force-priority';
export type CodexServiceTierUnauthorizedAction = 'strip' | 'reject';

export const DEFAULT_CODEX_SERVICE_TIER_REJECT_MESSAGE = 'Fast 模式未授权，请联系管理员';

export type VisualConfigValues = {
  host: string;
  port: string;
  tlsEnable: boolean;
  tlsCert: string;
  tlsKey: string;
  rmAllowRemote: boolean;
  rmSecretKey: string;
  rmDisableControlPanel: boolean;
  rmPanelRepo: string;
  authDir: string;
  apiKeysText: string;
  apiKeyEntries: VisualApiKeyEntry[];
  apiKeyGroups: VisualApiKeyGroup[];
  debug: boolean;
  commercialMode: boolean;
  loggingToFile: boolean;
  logsMaxTotalSizeMb: string;
  usageStatisticsEnabled: boolean;
  proxyUrl: string;
  forceModelPrefix: boolean;
  requestRetry: string;
  maxRetryInterval: string;
  quotaSwitchProject: boolean;
  quotaSwitchPreviewModel: boolean;
  routingStrategy: 'round-robin' | 'fill-first';
  wsAuth: boolean;
  thinkingPolicyCodexEnabled: boolean;
  thinkingPolicyCodexDefaultEffort: CodexThinkingDefaultEffort;
  thinkingPolicyCodexXhighApiKeysText: string;
  thinkingPolicyCodexXhighGroups: string[];
  serviceTierPolicyCodexEnabled: boolean;
  serviceTierPolicyCodexAllowedModels: string[];
  serviceTierPolicyCodexAllowedApiKeysText: string;
  serviceTierPolicyCodexAllowedGroups: string[];
  serviceTierPolicyCodexAuthorizedMode: CodexServiceTierAuthorizedMode;
  serviceTierPolicyCodexUnauthorizedAction: CodexServiceTierUnauthorizedAction;
  serviceTierPolicyCodexRejectMessage: string;
  modelRewriteEnabled: boolean;
  modelRewriteRules: ModelRewriteRule[];
  payloadDefaultRules: PayloadRule[];
  payloadOverrideRules: PayloadRule[];
  payloadFilterRules: PayloadFilterRule[];
  streaming: StreamingConfig;
};

export const makeClientId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

export const DEFAULT_VISUAL_VALUES: VisualConfigValues = {
  host: '',
  port: '',
  tlsEnable: false,
  tlsCert: '',
  tlsKey: '',
  rmAllowRemote: false,
  rmSecretKey: '',
  rmDisableControlPanel: false,
  rmPanelRepo: '',
  authDir: '',
  apiKeysText: '',
  apiKeyEntries: [],
  apiKeyGroups: [],
  debug: false,
  commercialMode: false,
  loggingToFile: false,
  logsMaxTotalSizeMb: '',
  usageStatisticsEnabled: false,
  proxyUrl: '',
  forceModelPrefix: false,
  requestRetry: '',
  maxRetryInterval: '',
  quotaSwitchProject: true,
  quotaSwitchPreviewModel: true,
  routingStrategy: 'round-robin',
  wsAuth: false,
  thinkingPolicyCodexEnabled: false,
  thinkingPolicyCodexDefaultEffort: 'high',
  thinkingPolicyCodexXhighApiKeysText: '',
  thinkingPolicyCodexXhighGroups: [],
  serviceTierPolicyCodexEnabled: false,
  serviceTierPolicyCodexAllowedModels: [],
  serviceTierPolicyCodexAllowedApiKeysText: '',
  serviceTierPolicyCodexAllowedGroups: [],
  serviceTierPolicyCodexAuthorizedMode: 'request-only',
  serviceTierPolicyCodexUnauthorizedAction: 'strip',
  serviceTierPolicyCodexRejectMessage: DEFAULT_CODEX_SERVICE_TIER_REJECT_MESSAGE,
  modelRewriteEnabled: false,
  modelRewriteRules: [],
  payloadDefaultRules: [],
  payloadOverrideRules: [],
  payloadFilterRules: [],
  streaming: {
    keepaliveSeconds: '',
    bootstrapRetries: '',
    nonstreamKeepaliveInterval: '',
  },
};
