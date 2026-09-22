import { apiClient } from './client';

export interface PluginEntry {
  id: string;
  path: string;
  configured: boolean;
  registered: boolean;
  enabled: boolean;
  effective_enabled: boolean;
  menus: Array<{ path: string; menu: string; description: string }>;
  metadata: { name: string; version: string; author: string } | null;
}

export interface PluginList {
  plugins_enabled: boolean;
  plugins_supported: boolean;
  plugins_dir: string;
  plugins: PluginEntry[];
}

export interface StorePlugin {
  id: string;
  source_id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  installed: boolean;
  registered: boolean;
  enabled: boolean;
  update_available: boolean;
  install_source_status: string;
}

export interface PluginStore {
  plugins: StorePlugin[];
  source_errors?: Array<{ source_name: string; message: string }>;
}

interface PluginInstallResult {
  restart_required: boolean;
}

const idPath = (id: string) => `/plugins/${encodeURIComponent(id)}`;

export const pluginsApi = {
  list: () => apiClient.get<PluginList>('/plugins'),
  store: () => apiClient.get<PluginStore>('/plugin-store'),
  setGlobal: (enabled: boolean) => apiClient.patch('/plugins-enabled', { enabled }),
  setEnabled: (id: string, enabled: boolean) =>
    apiClient.patch(`${idPath(id)}/enabled`, { enabled }),
  config: (id: string) => apiClient.get<Record<string, unknown>>(`${idPath(id)}/config`),
  saveConfig: (id: string, config: Record<string, unknown>) =>
    apiClient.put(`${idPath(id)}/config`, config),
  install: (plugin: StorePlugin) =>
    apiClient.post<PluginInstallResult>(
      `/plugin-store/${encodeURIComponent(plugin.id)}/install?source=${encodeURIComponent(plugin.source_id)}`,
      {}
    ),
  remove: (id: string) => apiClient.delete(idPath(id)),
};
