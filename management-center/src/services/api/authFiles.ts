/**
 * 认证文件与 OAuth 排除模型相关 API
 */

import { apiClient } from './client';
import type { AuthFilesResponse } from '@/types/authFile';

export const authFilesApi = {
  list: () => apiClient.get<AuthFilesResponse>('/auth-files'),

  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return apiClient.postForm('/auth-files', formData);
  },

  deleteFile: (name: string) => apiClient.delete(`/auth-files?name=${encodeURIComponent(name)}`),

  deleteAll: () => apiClient.delete('/auth-files', { params: { all: true } }),

  // OAuth 排除模型
  async getOauthExcludedModels(): Promise<Record<string, string[]>> {
    const data = await apiClient.get<Record<string, unknown>>('/oauth-excluded-models');
    const payload = data['oauth-excluded-models'] ?? data.items ?? data;
    return payload && typeof payload === 'object' ? (payload as Record<string, string[]>) : {};
  },

  saveOauthExcludedModels: (provider: string, models: string[]) =>
    apiClient.patch('/oauth-excluded-models', { provider, models }),

  deleteOauthExcludedEntry: (provider: string) =>
    apiClient.delete(`/oauth-excluded-models?provider=${encodeURIComponent(provider)}`),

  // 获取认证凭证支持的模型
  async getModelsForAuthFile(name: string): Promise<{ id: string; display_name?: string; type?: string; owned_by?: string }[]> {
    const data = await apiClient.get<Record<string, unknown>>(`/auth-files/models?name=${encodeURIComponent(name)}`);
    const models = data['models'];
    return Array.isArray(models) ? (models as { id: string; display_name?: string; type?: string; owned_by?: string }[]) : [];
  }
};
