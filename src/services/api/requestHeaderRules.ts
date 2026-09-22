import { apiClient } from './client';
import { requireEnabledPlugin } from './plugins';
import type { RequestHeaderRule } from '@/features/authFiles/requestHeaderRules';

export type HeaderRule = RequestHeaderRule & {
  id: string;
  source?: 'turn-state-auto';
  active?: boolean;
  account_enabled?: boolean;
  issued_at?: string;
};
export type HeaderRuleAccount = {
  auth_id: string;
  name: string;
  note: string;
  models: string[];
  rules: HeaderRule[];
  revision: string;
};
export type HeaderRuleMutation = {
  auth_id: string;
  revision: string;
  action: 'save' | 'delete' | 'restart';
  id?: string;
  rule?: Pick<RequestHeaderRule, 'name' | 'operation' | 'value' | 'models' | 'duration_minutes'>;
};

export const requestHeaderRulesApi = {
  list: async () => {
    await requireEnabledPlugin('codex-headers');
    const response = await apiClient.get<{ accounts: HeaderRuleAccount[]; server_time: string }>(
      '/request-header-rules'
    );
    const result = await apiClient.get<{
      rules: Array<{
        auth_id: string;
        id: string;
        model: string;
        value: string;
        issued_at: string;
        expires_at: string;
        active: boolean;
        account_enabled: boolean;
        duration_minutes: number;
      }>;
    }>('/plugins/codex-headers/rules');
    for (const account of response.accounts) {
      account.rules = account.rules.filter((rule) => rule.source !== 'turn-state-auto');
      for (const item of result.rules) {
        if (item.auth_id !== account.auth_id) continue;
        account.rules.push({
          id: item.id,
          source: 'turn-state-auto',
          name: 'X-Codex-Turn-State',
          operation: 'override',
          value: item.value,
          models: [item.model],
          duration_minutes: item.duration_minutes,
          expires_at: item.expires_at,
          issued_at: item.issued_at,
          active: item.active,
          account_enabled: item.account_enabled,
        });
        if (!account.models.includes(item.model)) account.models.push(item.model);
      }
    }
    return response;
  },
  mutate: async (input: HeaderRuleMutation) => {
    await requireEnabledPlugin('codex-headers');
    return apiClient.post<{ account: HeaderRuleAccount; server_time: string }>(
      '/request-header-rules',
      input
    );
  },
};
