import { useRef, useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { agent } from '@/agent/core';
import { Button } from '@/components/ui/Button';
import { IconBot, IconX, IconPlay, IconTrash2, IconSettings, IconCheck, IconChevronUp, IconChevronDown } from '@/components/ui/icons';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAgentStore } from '@/stores/useAgentStore';
import { ModelSelector } from '@/components/ui/ModelSelector';
import { Input } from '@/components/ui/Input';

export function AgentChat() {
  const { t, i18n } = useTranslation();
  const isOpen = useAgentStore((state) => state.isOpen);
  const setOpen = useAgentStore((state) => state.setOpen);
  const [, setParams] = useState({ messages: [] }); 
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Window size state
  const [isMaximized, setIsMaximized] = useState(false);
  
  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState(agent.getConfig());
  
  // Initialize i18n prompt on first open or language change
  const initializePrompt = useCallback(() => {
    const defaultPrompt = t('agent.default_system_prompt');
    const currentConfig = agent.getConfig();
    // Always use i18n prompt if current is empty or initial
    if (!currentConfig.systemPrompt || currentConfig.systemPrompt === '') {
      agent.setConfig({ systemPrompt: defaultPrompt });
      setConfig(prev => ({ ...prev, systemPrompt: defaultPrompt }));
    }
  }, [t]);

  // Draggable state
  const [position, setPosition] = useState({ x: 24, y: 24 }); // right, bottom
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{x: number, y: number} | null>(null);

  const messages = agent.getHistory().filter(m => m.role !== 'system');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      initializePrompt();
      setTimeout(scrollToBottom, 100);
      setConfig(agent.getConfig());
    }
  }, [isOpen, messages.length, initializePrompt]);
  
  // Re-init prompt when language changes
  useEffect(() => {
    initializePrompt();
  }, [i18n.language, initializePrompt]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input;
    setInput('');
    setLoading(true);
    setParams({ messages: [] }); 

    try {
      await agent.sendMessage(userMsg);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setParams({ messages: [] });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
      agent.clearHistory();
      setParams({ messages: [] });
  };

  const handleSaveSettings = () => {
    agent.setConfig(config);
    setShowSettings(false);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only allow drag from specific handles or main body, avoiding inputs
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dragStartRef.current) return;
      
      const dx = dragStartRef.current.x - e.clientX;
      const dy = dragStartRef.current.y - e.clientY;
      
      setPosition(prev => ({
        x: Math.max(24, prev.x + dx),
        y: Math.max(24, prev.y + dy)
      }));
      
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleClick = () => {
      if (!isDragging) {
          setOpen(true);
      }
  };

  if (!isOpen) {
    return (
      <div 
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        style={{
          position: 'fixed',
          bottom: position.y,
          right: position.x,
          width: 56,
          height: 56,
          borderRadius: '50%',
          backgroundColor: 'var(--primary-color)',
          color: 'white',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          cursor: isDragging ? 'grabbing' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          transition: isDragging ? 'none' : 'transform 0.2s',
          userSelect: 'none',
          touchAction: 'none'
        }}
        onMouseEnter={e => !isDragging && (e.currentTarget.style.transform = 'scale(1.1)')}
        onMouseLeave={e => !isDragging && (e.currentTarget.style.transform = 'scale(1.0)')}
      >
        <IconBot size={28} />
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: isMaximized ? 0 : 24,
      right: isMaximized ? 0 : 24,
      width: isMaximized ? '100%' : 380,
      height: isMaximized ? '100%' : 600,
      maxHeight: isMaximized ? '100vh' : 'calc(100vh - 48px)',
      backgroundColor: '#1a1a1a',
      borderRadius: isMaximized ? 0 : 12,
      boxShadow: isMaximized ? 'none' : '0 8px 30px rgba(0,0,0,0.5)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      border: isMaximized ? 'none' : '1px solid var(--border-color)',
      overflow: 'hidden',
      transition: 'all 0.2s ease-out'
    }}>
      {/* Header */}
      <div 
        onMouseDown={handleMouseDown}
        style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#252525', 
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconBot size={20} color="var(--primary-color)" />
            <span style={{ fontWeight: 600 }}>{t('agent.title')}</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
            <Button variant="ghost" size="icon" onClick={() => setIsMaximized(!isMaximized)} title={isMaximized ? t('common.close') : t('agent.maximize', '放大')}>
                {isMaximized ? <IconChevronDown size={16} /> : <IconChevronUp size={16} />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setShowSettings(!showSettings)} title={t('agent.settings')}>
                <IconSettings size={16} />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleClear} title={t('agent.clear_chat')}>
                <IconTrash2 size={16} />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} title={t('agent.close')}>
                <IconX size={18} />
            </Button>
        </div>
      </div>

      {/* Settings Panel Overlay */}
      {showSettings && (
        <div style={{
          position: 'absolute',
          top: 50,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#1a1a1a',
          zIndex: 10,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          overflowY: 'auto'
        }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{t('agent.settings_title')}</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ModelSelector 
                  label={t('agent.model')}
                  value={config.model} 
                  onChange={val => setConfig({...config, model: val})} 
                />
                
                <div>
                   <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                     {t('agent.temperature')} ({config.temperature})
                   </label>
                   <input 
                      type="range" 
                      min="0" 
                      max="2" 
                      step="0.1" 
                      value={config.temperature}
                      style={{ width: '100%' }}
                      onChange={e => setConfig({...config, temperature: parseFloat(e.target.value)})}
                   />
                </div>

                <div>
                    <Input 
                      label={t('agent.max_tokens')}
                      type="number"
                      value={config.max_tokens || ''}
                      onChange={e => setConfig({...config, max_tokens: parseInt(e.target.value) || undefined})}
                    />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      {t('agent.system_prompt')}
                    </label>
                    <textarea 
                        value={config.systemPrompt}
                        onChange={e => setConfig({...config, systemPrompt: e.target.value})}
                        rows={6}
                        style={{
                            width: '100%',
                            padding: 8,
                            borderRadius: 6,
                            border: '1px solid var(--border-color)',
                            backgroundColor: 'var(--input-bg)',
                            color: 'var(--text-primary)',
                            fontSize: 12,
                            resize: 'vertical'
                        }}
                    />
                </div>
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
                <Button variant="primary" style={{ flex: 1 }} onClick={handleSaveSettings}>
                   <IconCheck size={16} style={{ marginRight: 6 }} /> {t('common.save')}
                </Button>
                <Button variant="secondary" onClick={() => setShowSettings(false)}>
                   {t('common.cancel')}
                </Button>
            </div>
        </div>
      )}

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        backgroundColor: '#1a1a1a'
      }}>
        {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: 40, padding: 20 }}>
                <IconBot size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
                <p style={{ lineHeight: 1.5 }}>{t('agent.welcome')}</p>
            </div>
        )}
        {messages.map((msg, idx) => (
          <div key={idx} style={{
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
            backgroundColor: msg.role === 'user' ? 'var(--primary-color)' : '#2a2a2a',
            color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
            padding: '10px 14px',
            borderRadius: 12,
            borderBottomRightRadius: msg.role === 'user' ? 2 : 12,
            borderBottomLeftRadius: msg.role !== 'user' ? 2 : 12,
            fontSize: 14,
            lineHeight: 1.5,
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
          }}>
             {msg.role === 'tool' ? (
                 <div style={{ fontSize: 12, opacity: 0.8, fontFamily: 'monospace' }}>
                     Task Completed: {msg.name}
                 </div>
             ) : (
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
             )}
          </div>
        ))}
        {loading && (
             <div style={{ alignSelf: 'flex-start', padding: 10 }}>
                 <LoadingSpinner size={20} />
             </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '16px',
        borderTop: '1px solid var(--border-color)',
        backgroundColor: '#1a1a1a'
      }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            id="agent-input"
            name="agent-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={t('agent.input_placeholder')}
            rows={1}
            style={{
              flex: 1,
              resize: 'none',
              borderRadius: 8,
              border: '1px solid var(--input-border)',
              padding: '10px',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--text-primary)',
              fontFamily: 'inherit'
            }}
          />
          <Button onClick={handleSend} disabled={loading || !input.trim()}>
            <IconPlay size={16} /> 
          </Button>
        </div>
      </div>
    </div>
  );
}
