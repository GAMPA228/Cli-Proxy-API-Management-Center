import { apiClient } from './client';

export interface TurnStateAutoRules {
  enabled: boolean;
  max_chars: number;
  account_scope: 'all' | 'selected';
  auth_ids: string[];
  storage_errors: number;
}

type SettingsResponse = Omit<TurnStateAutoRules, 'account_scope' | 'auth_ids'> &
  Partial<Pick<TurnStateAutoRules, 'account_scope' | 'auth_ids'>>;

const normalize = (settings: SettingsResponse): TurnStateAutoRules => ({
  ...settings,
  account_scope: settings.account_scope ?? 'all',
  auth_ids: settings.auth_ids ?? [],
});

export const turnStateAutoRulesApi = {
  get: async () => normalize(await apiClient.get<SettingsResponse>('/usage/turn-state-auto-rules')),
  save: async (
    settings: Pick<TurnStateAutoRules, 'enabled' | 'max_chars' | 'account_scope' | 'auth_ids'>
  ) => normalize(await apiClient.put<SettingsResponse>('/usage/turn-state-auto-rules', settings)),
};
