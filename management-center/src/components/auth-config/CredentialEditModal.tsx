import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { UnifiedProvider } from '@/types/unified';
import { IconPlus, IconKey, IconEdit } from '@/components/ui/icons';

interface CredentialEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (provider: UnifiedProvider) => void;
  initialData?: UnifiedProvider | null;
}

export const CredentialEditModal: React.FC<CredentialEditModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
}) => {
  const [formData, setFormData] = useState<Partial<UnifiedProvider>>(
    initialData ? JSON.parse(JSON.stringify(initialData)) : {
      id: '',
      enabled: true,
      priority: 10,
      weight: 10,
      type: 'gemini',
      credentials: {},
      tags: []
    }
  );

  const [tagInput, setTagInput] = useState('');
  const [apiKey, setApiKey] = useState(initialData?.credentials?.['api_key'] || '');

  const handleSave = () => {
    if (!formData.type) return;

    const creds = { ...formData.credentials };
    if (apiKey) {
      creds['api_key'] = apiKey;
    }
    
    let finalId = formData.id;
    if (!finalId) {
       finalId = `${formData.type}-${Date.now()}`;
    }

    onSave({
      ...formData,
      id: finalId,
      credentials: creds,
    } as UnifiedProvider);
    onClose();
  };

  const addTag = () => {
    if (!tagInput.trim()) return;
    setFormData(prev => ({
      ...prev,
      tags: [...(prev.tags || []), tagInput.trim()]
    }));
    setTagInput('');
  };

  const removeTag = (index: number) => {
    setFormData(prev => ({
      ...prev,
      tags: (prev.tags || []).filter((_, i) => i !== index)
    }));
  };

  const providerTypes = [
    { value: 'gemini', label: 'Gemini', icon: '🔮' },
    { value: 'claude', label: 'Claude', icon: '🤖' },
    { value: 'openai', label: 'OpenAI', icon: '🧠' },
    { value: 'openai-compatibility', label: 'OpenAI 兼容', icon: '🌐' },
    { value: 'vertex', label: 'Vertex AI', icon: '☁️' },
  ];

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={
        <div className="flex-row items-center gap-md">
          <div className="icon-wrapper" style={{ 
            width: '40px', height: '40px', borderRadius: '12px', 
            background: 'var(--gradient-primary)', color: '#fff',
            display: 'grid', placeItems: 'center'
          }}>
            {initialData ? <IconEdit size={20} /> : <IconPlus size={20} />}
          </div>
          <div>
            <div className="title" style={{ fontSize: '18px' }}>{initialData ? "编辑凭证配置" : "接入新供应商平衡池"}</div>
            <div className="badge badge-success" style={{ marginTop: '2px', fontSize: '10px' }}>Unified Auth v2</div>
          </div>
        </div>
      }
    >
      <div className="flex-column gap-lg" style={{ padding: '4px' }}>
        {/* 第一部分：基础信息 */}
        <section className="flex-column gap-md">
           <div className="flex-row items-center gap-sm">
             <div style={{ height: '14px', width: '3px', background: 'var(--primary-color)', borderRadius: '2px' }}></div>
             <h4 className="label" style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>基础识别信息</h4>
           </div>
           
           <div className="flex-row gap-lg" style={{ flexWrap: 'wrap' }}>
             <div className="flex-column gap-xs" style={{ flex: 1, minWidth: '240px' }}>
               <label className="text-primary" style={{ fontWeight: 700, fontSize: '13px' }}>凭证唯一标识符 (ID)</label>
               <input
                  className="input-premium"
                  value={formData.id || ''}
                  onChange={(e) => setFormData({...formData, id: e.target.value})}
                  placeholder="例如: prod-gemini-us-01"
               />
               <span className="text-tertiary" style={{ fontSize: '11px', fontStyle: 'italic' }}>系统内部引用标识，留空将自动生成</span>
             </div>

             <div className="flex-column gap-xs" style={{ flex: 1, minWidth: '240px' }}>
               <label className="text-primary" style={{ fontWeight: 700, fontSize: '13px' }}>供应商技术类型</label>
               <div style={{ position: 'relative' }}>
                 <select
                    className="input-premium"
                    value={formData.type}
                    disabled={!!initialData}
                    onChange={(e) => setFormData({...formData, type: e.target.value as UnifiedProvider['type']})}
                    style={{ appearance: 'none', cursor: 'pointer' }}
                 >
                   {providerTypes.map(t => (
                     <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                   ))}
                 </select>
                 <div style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-tertiary)' }}>
                    ▼
                 </div>
               </div>
             </div>
           </div>
        </section>

        {/* 第二部分：核心凭证 */}
        <div className="card-glass" style={{ padding: '24px', borderRadius: '16px', border: '1px solid rgba(var(--primary-rgb), 0.1)' }}>
          <div className="flex-row items-center gap-md" style={{ marginBottom: '20px' }}>
            <div className="icon-wrapper" style={{ width: '36px', height: '36px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--primary-color)' }}>
              <IconKey size={18} />
            </div>
            <div>
              <h4 className="text-primary" style={{ fontWeight: 800, fontSize: '14px' }}>安全准入凭证</h4>
              <p className="text-tertiary" style={{ fontSize: '11px' }}>数据加密存储，仅在流转管道中使用</p>
            </div>
          </div>
          
          <div className="flex-column gap-xs">
            <label className="label" style={{ fontSize: '11px' }}>Master API Key</label>
            <input
               type="password"
               className="input-premium"
               style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)' }}
               value={apiKey}
               onChange={(e) => setApiKey(e.target.value)}
               placeholder="粘贴您的 API Key 或配置 Token..."
            />
          </div>
        </div>

        {/* 第三部分：调度参数 */}
        <section className="flex-column gap-md">
           <div className="flex-row items-center gap-sm">
             <div style={{ height: '14px', width: '3px', background: 'var(--primary-color)', borderRadius: '2px' }}></div>
             <h4 className="label" style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>调度控制参数</h4>
           </div>
           
           <div className="flex-row gap-lg">
              <div className="card-glass" style={{ flex: 1, padding: '16px', borderRadius: '16px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)' }}>
                <div className="flex-row justify-between items-center" style={{ marginBottom: '12px' }}>
                  <span className="label">Priority</span>
                  <span style={{ fontSize: '18px' }}>⚡</span>
                </div>
                <input
                   type="number"
                   className="input-premium"
                   style={{ border: 'none', background: 'transparent', padding: 0, fontSize: '28px', fontWeight: 900, height: 'auto' }}
                   value={formData.priority}
                   onChange={e => setFormData({...formData, priority: parseInt(e.target.value) || 0})}
                />
                <p className="text-tertiary" style={{ fontSize: '10px', marginTop: '4px' }}>数值越低优先级越高</p>
              </div>

              <div className="card-glass" style={{ flex: 1, padding: '16px', borderRadius: '16px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)' }}>
                <div className="flex-row justify-between items-center" style={{ marginBottom: '12px' }}>
                  <span className="label">Weight</span>
                  <span style={{ fontSize: '18px' }}>⚖️</span>
                </div>
                <input
                   type="number"
                   className="input-premium"
                   style={{ border: 'none', background: 'transparent', padding: 0, fontSize: '28px', fontWeight: 900, height: 'auto' }}
                   value={formData.weight}
                   onChange={e => setFormData({...formData, weight: parseInt(e.target.value) || 0})}
                />
                <p className="text-tertiary" style={{ fontSize: '10px', marginTop: '4px' }}>负载均衡时的流量比例</p>
              </div>
           </div>
        </section>

        {/* 第四部分：高级设置 */}
        <section className="flex-column gap-lg">
           <div className="flex-column gap-md">
             <label className="text-primary" style={{ fontWeight: 700, fontSize: '13px' }}>资源标签 (Tags)</label>
             <div className="flex-row gap-sm">
               <input
                 className="input-premium"
                 value={tagInput}
                 onChange={(e) => setTagInput(e.target.value)}
                 placeholder="输入标签并按回车..."
                 onKeyDown={(e) => e.key === 'Enter' && addTag()}
               />
               <Button variant="secondary" onClick={addTag} style={{ padding: '0 24px' }}>添加</Button>
             </div>
             <div className="flex-row gap-sm" style={{ flexWrap: 'wrap', minHeight: '32px' }}>
               {formData.tags && formData.tags.length > 0 ? formData.tags.map((tag, idx) => (
                  <span key={idx} className="badge badge-success" style={{ 
                    padding: '6px 14px', borderRadius: '8px', background: 'var(--bg-tertiary)', 
                    color: 'var(--text-primary)', border: '1px solid var(--border-color)',
                    display: 'flex', alignItems: 'center', gap: '8px'
                  }}>
                    <span style={{ color: 'var(--primary-color)' }}>#</span>{tag}
                    <button 
                      onClick={() => removeTag(idx)} 
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', opacity: 0.5, padding: 0 }}
                    >✕</button>
                  </span>
               )) : (
                 <span className="text-tertiary" style={{ fontSize: '11px', fontStyle: 'italic' }}>尚未添加任何标签</span>
               )}
             </div>
           </div>

           <div className="flex-column gap-xs">
             <label className="text-primary" style={{ fontWeight: 700, fontSize: '13px' }}>代理路由路径 (Proxy URL)</label>
             <input
                 className="input-premium"
                 value={formData.proxyUrl || ''}
                 onChange={(e) => setFormData({...formData, proxyUrl: e.target.value})}
                 placeholder="http://corp-proxy.internal:7890"
                 style={{ fontFamily: 'var(--font-mono)' }}
             />
           </div>
        </section>

        {/* 底部操作 */}
        <div className="flex-row justify-end gap-md" style={{ marginTop: '40px' }}>
          <Button variant="ghost" onClick={onClose} style={{ fontWeight: 500 }}>放弃更改</Button>
          <Button onClick={handleSave} style={{ minWidth: '160px' }}>
            {initialData ? "保存配置更新" : "立即部署凭证"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};