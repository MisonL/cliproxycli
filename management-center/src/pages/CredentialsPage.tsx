import React from 'react';
import { useTranslation } from 'react-i18next';
import { UnifiedCredentialManager } from '@/components/auth-config/UnifiedCredentialManager';

export const CredentialsPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="flex-column">
      {/* Premium Hero Section */}
      <section className="hero-wrapper">
        <div className="hero-content">
          <div className="badge badge-success" style={{ marginBottom: '16px' }}>
            {t('credentials.badge')}
          </div>
          <h1 className="hero-title">
            {t('credentials.title')}
          </h1>
          <p className="hero-subtitle">
            {t('credentials.subtitle')}
          </p>
          
          <div className="flex-row gap-lg" style={{ marginTop: '40px' }}>
            <div className="flex-row items-center gap-sm">
              <span style={{ color: 'var(--primary-color)' }}>✦</span>
              <span className="text-secondary" style={{ fontSize: '14px', fontWeight: 600 }}>{t('credentials.feature_1')}</span>
            </div>
            <div className="flex-row items-center gap-sm">
              <span style={{ color: 'var(--primary-color)' }}>✦</span>
              <span className="text-secondary" style={{ fontSize: '14px', fontWeight: 600 }}>{t('credentials.feature_2')}</span>
            </div>
            <div className="flex-row items-center gap-sm">
              <span style={{ color: 'var(--primary-color)' }}>✦</span>
              <span className="text-secondary" style={{ fontSize: '14px', fontWeight: 600 }}>{t('credentials.feature_3')}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <div style={{ padding: '0 40px 80px', marginTop: '-40px' }}>
        <div className="card card-glass">
          <UnifiedCredentialManager />
        </div>
      </div>
    </div>
  );
};