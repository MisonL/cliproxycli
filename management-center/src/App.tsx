import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from '@/pages/LoginPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ApiKeysPage } from '@/pages/ApiKeysPage';
import { ApiKeyConfigPage } from '@/pages/ApiKeyConfigPage';
import CredentialsPage from '@/pages/CredentialsPage';
import { AuthFilesPage } from '@/pages/AuthFilesPage';
import { OAuthPage } from '@/pages/OAuthPage';
import { UsagePage } from '@/pages/UsagePage';
import { ConfigPage } from '@/pages/ConfigPage';
import { LogsPage } from '@/pages/LogsPage';
import { SchedulerPage } from '@/pages/SchedulerPage';
import { ModelPoolPage } from '@/pages/ModelPoolPage';
import { SystemPage } from '@/pages/SystemPage';
import { NotificationContainer } from '@/components/common/NotificationContainer';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/router/ProtectedRoute';
import { useAuthStore, useLanguageStore, useThemeStore } from '@/stores';

function App() {
  const initializeTheme = useThemeStore((state) => state.initializeTheme);
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const restoreSession = useAuthStore((state) => state.restoreSession);

  useEffect(() => {
    initializeTheme();
    restoreSession();
  }, [initializeTheme, restoreSession]);

  useEffect(() => {
    setLanguage(language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 仅用于首屏同步 i18n 语言

  return (
    <HashRouter>
      <NotificationContainer />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/settings" replace />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="credentials" element={<CredentialsPage />} />
          <Route path="api-keys" element={<ApiKeysPage />} />
          <Route path="ai-providers" element={<ApiKeyConfigPage />} />
          <Route path="auth-files" element={<AuthFilesPage />} />
          <Route path="oauth" element={<OAuthPage />} />
          <Route path="usage" element={<UsagePage />} />
          <Route path="config" element={<ConfigPage />} />
          <Route path="scheduler" element={<SchedulerPage />} />
          <Route path="model-pool" element={<ModelPoolPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="system" element={<SystemPage />} />
          <Route path="*" element={<Navigate to="/settings" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
