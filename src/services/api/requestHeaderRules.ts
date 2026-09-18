import { apiClient } from './client';
import type { RequestHeaderRule } from '@/features/authFiles/requestHeaderRules';

export type HeaderRule = RequestHeaderRule & {
  id: string;
  source?: 'turn-state-auto';
  active?: boolean;
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
  list: () =>
    apiClient.get<{ accounts: HeaderRuleAccount[]; server_time: string }>('/request-header-rules'),
  mutate: (input: HeaderRuleMutation) =>
    apiClient.post<{ account: HeaderRuleAccount; server_time: string }>(
      '/request-header-rules',
      input
    ),
};
