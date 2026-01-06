/**
 * 认证状态管理
 * 从原项目 src/modules/login.js 和 src/core/connection.js 迁移
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthState, LoginCredentials, ConnectionStatus } from '@/types';
import { STORAGE_KEY_AUTH } from '@/utils/constants';
import { secureStorage } from '@/services/storage/secureStorage';
import { apiClient } from '@/services/api/client';
import { useConfigStore } from './useConfigStore';
import { detectApiBaseFromLocation, normalizeApiBase } from '@/utils/connection';

interface AuthStoreState extends AuthState {
  connectionStatus: ConnectionStatus;
  connectionError: string | null;

  // 操作
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
  restoreSession: () => Promise<boolean>;
  updateServerVersion: (version: string | null, buildDate?: string | null) => void;
  updateConnectionStatus: (status: ConnectionStatus, error?: string | null) => void;
}

let restoreSessionPromise: Promise<boolean> | null = null;

export const useAuthStore = create<AuthStoreState>()(
  persist(
    (set, get) => ({
      // 初始状态
      isAuthenticated: false,
      apiBase: '',
      managementKey: '',
      serverVersion: null,
      serverBuildDate: null,
      connectionStatus: 'disconnected',
      connectionError: null,

      // 恢复会话并自动登录
      restoreSession: () => {
        if (restoreSessionPromise) return restoreSessionPromise;

        restoreSessionPromise = (async () => {
          secureStorage.migratePlaintextKeys(['managementKey']); // Removed apiBase migration

          const wasLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
          const legacyKey = secureStorage.getItem<string>('managementKey');

          const { managementKey } = get();
          
          // Always detect base from location, ignore storage for apiBase
          const resolvedBase = normalizeApiBase(detectApiBaseFromLocation());
          const resolvedKey = managementKey || legacyKey || '';

          set({ apiBase: resolvedBase, managementKey: resolvedKey });
          apiClient.setConfig({ apiBase: resolvedBase, managementKey: resolvedKey });

          if (wasLoggedIn && resolvedKey) {
            try {
              // Login using the resolved base automatically
              await get().login({ managementKey: resolvedKey });
              return true;
            } catch (error) {
              console.warn('Auto login failed:', error);
              return false;
            }
          }

          return false;
        })();

        return restoreSessionPromise;
      },

      // 登录
      login: async (credentials) => {
        // Ignore credentials.apiBase if passed, always use detected or existing base
        const apiBase = normalizeApiBase(detectApiBaseFromLocation());
        const managementKey = credentials.managementKey.trim();

        try {
          set({ connectionStatus: 'connecting' });

          // 配置 API 客户端
          apiClient.setConfig({
            apiBase,
            managementKey
          });

          // 测试连接 - 获取配置
          await useConfigStore.getState().fetchConfig(undefined, true);

          // 登录成功
          set({
            isAuthenticated: true,
            apiBase,
            managementKey,
            connectionStatus: 'connected',
            connectionError: null
          });
          localStorage.setItem('isLoggedIn', 'true');
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Connection failed';
          set({
            connectionStatus: 'error',
            connectionError: message
          });
          throw error;
        }
      },

      // 登出
      logout: () => {
        restoreSessionPromise = null;
        useConfigStore.getState().clearCache();
        set({
          isAuthenticated: false,
          apiBase: '',
          managementKey: '',
          serverVersion: null,
          serverBuildDate: null,
          connectionStatus: 'disconnected',
          connectionError: null
        });
        localStorage.removeItem('isLoggedIn');
      },

      // 检查认证状态
      checkAuth: async () => {
        const { managementKey } = get();
        const apiBase = normalizeApiBase(detectApiBaseFromLocation());

        if (!managementKey) {
          return false;
        }

        try {
          // 重新配置客户端
          apiClient.setConfig({ apiBase, managementKey });

          // 验证连接
          await useConfigStore.getState().fetchConfig();

          // Sync state just in case
          set({
            isAuthenticated: true,
            connectionStatus: 'connected',
            apiBase
          });

          return true;
        } catch {
          set({
            isAuthenticated: false,
            connectionStatus: 'error'
          });
          return false;
        }
      },

      // 更新服务器版本
      updateServerVersion: (version, buildDate) => {
        set({ serverVersion: version || null, serverBuildDate: buildDate || null });
      },

      // 更新连接状态
      updateConnectionStatus: (status, error = null) => {
        set({
          connectionStatus: status,
          connectionError: error
        });
      }
    }),
    {
      name: STORAGE_KEY_AUTH,
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          const data = secureStorage.getItem<AuthStoreState>(name);
          return data ? JSON.stringify(data) : null;
        },
        setItem: (name, value) => {
          secureStorage.setItem(name, JSON.parse(value));
        },
        removeItem: (name) => {
          secureStorage.removeItem(name);
        }
      })),
      partialize: (state) => ({
        // apiBase: state.apiBase, // Found logic to remove this
        managementKey: state.managementKey,
        serverVersion: state.serverVersion,
        serverBuildDate: state.serverBuildDate
      })
    }
  )
);

// 监听全局未授权事件
if (typeof window !== 'undefined') {
  window.addEventListener('unauthorized', () => {
    useAuthStore.getState().logout();
  });

  window.addEventListener(
    'server-version-update',
    ((e: CustomEvent) => {
      const detail = e.detail || {};
      useAuthStore.getState().updateServerVersion(detail.version || null, detail.buildDate || null);
    }) as EventListener
  );
}
