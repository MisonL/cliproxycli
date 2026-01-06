import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { IconEye, IconEyeOff, IconLock, IconShield } from '@/components/ui/icons';
import { useAuthStore, useNotificationStore } from '@/stores';
import { detectApiBaseFromLocation } from '@/utils/connection';
import styles from './LoginPage.module.scss';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { showNotification } = useNotificationStore();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const login = useAuthStore((state) => state.login);
  const restoreSession = useAuthStore((state) => state.restoreSession);
  const storedKey = useAuthStore((state) => state.managementKey);

  const [managementKey, setManagementKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(true);
  const [error, setError] = useState('');

  const detectedBase = useMemo(() => detectApiBaseFromLocation(), []);

  // Initialize: Attempt auto-login or pre-fill key
  useEffect(() => {
    const init = async () => {
      try {
        const autoLoggedIn = await restoreSession();
        if (!autoLoggedIn) {
          setManagementKey(storedKey || '');
        }
      } finally {
        setAutoLoading(false);
      }
    };

    init();
  }, [restoreSession, storedKey]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const redirect = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/';
      navigate(redirect, { replace: true });
    }
  }, [isAuthenticated, navigate, location.state]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!managementKey.trim()) {
      setError(t('login.error_required'));
      return;
    }

    // Strictly use the detected base (relative/same-origin)
    const baseToUse = detectedBase;
    
    setLoading(true);
    setError('');
    try {
      await login({ apiBase: baseToUse, managementKey: managementKey.trim() });
      showNotification(t('common.connected_status'), 'success');
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const message = (err as Error)?.message || t('login.error_invalid');
      setError(message);
      showNotification(`${t('notification.login_failed')}: ${message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (autoLoading) {
    return (
      <div className={styles.pageContainer} style={{ flexDirection: 'column', gap: '24px' }}>
        <div className="loading-spinner" style={{ 
          width: '48px', height: '48px', 
          borderWidth: '3px'
        }} />
        <div style={{ color: 'var(--text-secondary)', fontSize: '14px', letterSpacing: '0.5px' }}>
          {t('system_info.system_loading')}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <div className={styles.loginCard}>
        <div className={styles.logoSection}>
          <div className={styles.logoIconWrapper}>
            <IconShield size={32} color="#fff" strokeWidth={2} />
          </div>
          <div className={styles.textContent}>
            <h1>{t('title.login')}</h1>
            <p>{t('login.subtitle')}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className={styles.formSection}>
          <div className={styles.inputWrapper}>
            <Input
              label={t('login.management_key_label')}
              placeholder={t('login.management_key_placeholder')}
              type={showKey ? 'text' : 'password'}
              value={managementKey}
              onChange={(e) => setManagementKey(e.target.value)}
              leftElement={<IconLock size={18} className={styles.inputIcon} />}
              rightElement={
                <button
                  type="button"
                  className={styles.btnIcon}
                  onClick={() => setShowKey((prev) => !prev)}
                >
                  {showKey ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                </button>
              }
            />
          </div>

          {error && (
            <div className={styles.errorMessage}>
              {error}
            </div>
          )}

          <div>
            <Button 
              fullWidth 
              type="submit" 
              loading={loading}
              className={styles.submitBtn}
            >
              {loading ? t('login.submitting') : t('login.submit_button')}
            </Button>

          </div>
        </form>
      </div>
    </div>
  );
}
