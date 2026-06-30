import { apiClient } from './client';
import type { ApiKeyQuotaUpdate, ApiKeyQuotasResponse } from '@/types/apiKeyQuota';

export const apiKeyQuotasApi = {
  list: () => apiClient.get<ApiKeyQuotasResponse>('/api-key-quotas'),

  save: (items: ApiKeyQuotaUpdate[]) => apiClient.put('/api-key-quotas', { items }),
};
