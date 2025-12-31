import React from 'react';
import { UnifiedCredentialManager } from '@/components/auth-config/UnifiedCredentialManager';

const CredentialsPage: React.FC = () => {
    return (
        <div className="container mx-auto max-w-5xl py-6 space-y-6">
            <div className="mb-8">
                <h1 className="text-2xl font-bold mb-2">Unified Credential Management</h1>
                <p className="text-gray-500 dark:text-gray-400">
                    Manage your credentials in a unified pool with advanced scheduling, load balancing, and failover capabilities.
                </p>
            </div>
            <UnifiedCredentialManager />
        </div>
    );
};

export default CredentialsPage;
