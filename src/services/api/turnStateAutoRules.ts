import { apiClient } from './client';

export interface TurnStateAutoRules {
  enabled: boolean;
  max_chars: number;
  storage_errors: number;
}

export const turnStateAutoRulesApi = {
  get: () => apiClient.get<TurnStateAutoRules>('/usage/turn-state-auto-rules'),
  save: (settings: Pick<TurnStateAutoRules, 'enabled' | 'max_chars'>) =>
    apiClient.put<TurnStateAutoRules>('/usage/turn-state-auto-rules', settings),
};
