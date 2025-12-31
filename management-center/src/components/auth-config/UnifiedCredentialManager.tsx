import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { configApi } from '@/services/api/config';
import { UnifiedProvider, SchedulingConfig } from '@/types/unified';
import { CredentialEditModal } from './CredentialEditModal';
import { IconTrash2, IconEdit, IconPlus, IconRefreshCw } from '@/components/ui/icons';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';

export const UnifiedCredentialManager: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [scheduling, setScheduling] = useState<SchedulingConfig>({ strategy: 'priority', retry: 1, fallback: true });
  const [providers, setProviders] = useState<UnifiedProvider[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentProvider, setCurrentProvider] = useState<UnifiedProvider | null>(null);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const cfg = await configApi.getConfig();
      if (cfg.scheduling) setScheduling(cfg.scheduling);
      if (cfg.providers) setProviders(cfg.providers);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadConfig(); }, []);

  const handleStrategyChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStrategy = e.target.value as any;
    const newConfig = { ...scheduling, strategy: newStrategy };
    setScheduling(newConfig);
    try {
      await configApi.updateScheduling(newConfig);
    } catch(err) {
      console.error(err);
      // Revert?
    }
  };

  const handleSaveProvider = async (provider: UnifiedProvider) => {
    let newProviders = [...providers];
    const index = newProviders.findIndex(p => p.id === provider.id);
    if (index >= 0) {
      newProviders[index] = provider;
    } else {
      newProviders.push(provider);
    }
    setProviders(newProviders);
    await configApi.updateUnifiedProviders(newProviders);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this provider?')) return;
    const newProviders = providers.filter(p => p.id !== id);
    setProviders(newProviders);
    await configApi.updateUnifiedProviders(newProviders);
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    const newProviders = providers.map(p => p.id === id ? { ...p, enabled } : p);
    setProviders(newProviders);
    await configApi.updateUnifiedProviders(newProviders);
  };

  const openAdd = () => {
    setCurrentProvider(null);
    setIsModalOpen(true);
  };

  const openEdit = (p: UnifiedProvider) => {
    setCurrentProvider(p);
    setIsModalOpen(true);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <div className="card-header">
          <div className="title">Scheduling Strategy</div>
        </div>
        <div className="flex items-center gap-4">
          <label className="font-semibold text-sm">Strategy:</label>
          <select
             className="border rounded p-2 bg-white dark:bg-gray-800 dark:border-gray-700"
             value={scheduling.strategy}
             onChange={handleStrategyChange}
          >
            <option value="priority">Priority</option>
            <option value="load-balance">Load Balance (Weighted)</option>
            <option value="round-robin">Round Robin</option>
            <option value="sticky">Sticky</option>
          </select>
          <div className="text-gray-500 text-sm italic ml-auto">
             Changes are applied immediately.
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="card-header">
          <div className="title">Credentials Config</div>
        </div>
        <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800">
           <h3 className="font-bold">Unified Credential Pool</h3>
           <div className="flex gap-2">
             <Button variant="secondary" onClick={loadConfig}><IconRefreshCw size={16} /> Refresh</Button>
             <Button onClick={openAdd}><IconPlus size={16} /> Add Credential</Button>
           </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
             <thead className="bg-gray-100 dark:bg-gray-900 border-b dark:border-gray-700">
               <tr>
                 <th className="p-3">Enabled</th>
                 <th className="p-3">Type</th>
                 <th className="p-3">ID / Prefix</th>
                 <th className="p-3">Priority</th>
                 <th className="p-3">Weight</th>
                 <th className="p-3">Tags</th>
                 <th className="p-3 text-right">Actions</th>
               </tr>
             </thead>
             <tbody className="divide-y dark:divide-gray-700">
               {providers.length === 0 && (
                   <tr>
                     <td colSpan={7} className="p-8 text-center text-gray-500">
                       No credentials configured. Add one to get started.
                     </td>
                   </tr>
               )}
               {providers.map(p => (
                 <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="p-3">
                       <ToggleSwitch checked={p.enabled} onChange={(v) => handleToggle(p.id, v)} />
                    </td>
                    <td className="p-3 font-medium capitalize">{p.type}</td>
                    <td className="p-3">
                       <div className="font-mono text-xs">{p.id}</div>
                       {p.prefix && <div className="text-xs text-gray-500">Prefix: {p.prefix}</div>}
                    </td>
                    <td className="p-3">{p.priority}</td>
                    <td className="p-3">{p.weight}</td>
                    <td className="p-3">
                       <div className="flex flex-wrap gap-1">
                          {p.tags?.map((t, i) => (
                             <span key={i} className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs dark:bg-blue-900/30 dark:text-blue-300">{t}</span>
                          ))}
                       </div>
                    </td>
                    <td className="p-3 text-right space-x-2">
                       <button onClick={() => openEdit(p)} className="text-gray-500 hover:text-blue-600">
                          <IconEdit size={16} />
                       </button>
                       <button onClick={() => handleDelete(p.id)} className="text-gray-500 hover:text-red-600">
                          <IconTrash2 size={16} />
                       </button>
                    </td>
                 </tr>
               ))}
             </tbody>
          </table>
        </div>
      </div>
      
      <CredentialEditModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveProvider}
        initialData={currentProvider}
      />
    </div>
  );
};
