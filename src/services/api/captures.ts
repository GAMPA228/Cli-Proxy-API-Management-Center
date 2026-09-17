import { apiClient } from './client';

export interface CaptureStatus {
  enabled: boolean;
  duration_seconds?: number;
  until: string;
  captured: number;
  dropped: number;
  active: number;
  storage_errors: number;
}
export interface UpstreamCapture {
  id: string;
  trace_id: string;
  url: string;
  method: string;
  provider: string;
  auth_id: string;
  proxy: string;
  started_at: string;
  finished_at: string | null;
  protocol: string;
  status: number;
  response_headers: Record<string, string[]> | null;
  response_trailers?: Record<string, string[]>;
  handshake_reused: boolean;
  transport_decompressed?: boolean;
  request_body: string | null;
  response_body: string | null;
  frames?: { at: string; body: string }[];
  truncated: boolean;
  reason?: string;
}
export const capturesApi = {
  status: () => apiClient.get<CaptureStatus>('/usage/capture'),
  toggle: (enabled: boolean, durationSeconds = 10) =>
    apiClient.put<CaptureStatus>('/usage/capture', { enabled, duration_seconds: durationSeconds }),
  get: (id: string) =>
    apiClient.get<{ items: UpstreamCapture[] }>(`/usage/captures/${encodeURIComponent(id)}`),
  remove: (id: string) => apiClient.delete(`/usage/captures/${encodeURIComponent(id)}`),
};
