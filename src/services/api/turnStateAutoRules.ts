import { apiClient } from './client';

export interface TurnStateAutoRules {
  enabled: boolean;
  max_chars: number;
  lifetime_seconds: number;
  account_scope: 'all' | 'selected';
  auth_ids: string[];
  storage_errors: number;
}

type SettingsResponse = Omit<TurnStateAutoRules, 'account_scope' | 'auth_ids' | 'lifetime_seconds'> &
  Partial<Pick<TurnStateAutoRules, 'account_scope' | 'auth_ids' | 'lifetime_seconds'>>;

const normalize = (settings: SettingsResponse): TurnStateAutoRules => ({
  ...settings,
  account_scope: settings.account_scope ?? 'all',
  auth_ids: settings.auth_ids ?? [],
  lifetime_seconds: settings.lifetime_seconds ?? 3600,
});

export const turnStateAutoRulesApi = {
  get: async () => normalize(await apiClient.get<SettingsResponse>('/usage/turn-state-auto-rules')),
  save: async (
    settings: Pick<TurnStateAutoRules, 'enabled' | 'max_chars' | 'account_scope' | 'auth_ids' | 'lifetime_seconds'>
  ) => normalize(await apiClient.put<SettingsResponse>('/usage/turn-state-auto-rules', settings)),
};
