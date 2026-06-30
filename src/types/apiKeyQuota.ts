export interface ApiKeyQuotaStatus {
  'api-key': string;
  remark?: string;
  'daily-token-limit': number;
  'used-tokens': number;
  'remaining-tokens': number;
  'request-count': number;
  day: string;
  'reset-at': string;
  limited: boolean;
  exceeded: boolean;
}

export interface ApiKeyQuotasResponse {
  items?: ApiKeyQuotaStatus[];
}

export interface ApiKeyQuotaUpdate {
  'api-key': string;
  'daily-token-limit': number;
}
