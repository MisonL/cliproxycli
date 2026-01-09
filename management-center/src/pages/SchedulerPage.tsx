import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useNotificationStore } from '@/stores';
import { schedulerApi, SchedulerTask, SchedulerLog } from '@/services/api';
// Remove local module styles import
// import styles from './SchedulerPage.module.scss';
import { Input } from '@/components/ui/Input';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { TimePicker } from '@/components/ui/TimePicker';
import {
  IconTrash2,
  IconRefreshCw,
  IconPlay,
  IconSearch,
  IconFilter,
  IconPause,
  IconScrollText,
  IconClock,
  IconCalendar,
  IconCpu,
  IconActivity,
  IconPlus,
  IconChevronLeft,
  IconChevronRight,
} from '@/components/ui/icons';
import { ModelSelector } from '@/components/ui/ModelSelector';

export function SchedulerPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();

  const [tasks, setTasks] = useState<SchedulerTask[]>([]);
  const [logs, setLogs] = useState<SchedulerLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingTask, setEditingTask] = useState<Partial<SchedulerTask>>({});

  // Advanced Features 2.0 State
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'interval' | 'fixed_time'>('all');
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [taskLogModalOpen, setTaskLogModalOpen] = useState(false);
  const [logTaskFilter, setLogTaskFilter] = useState<string | null>(null);
  const [tempTimePoint, setTempTimePoint] = useState('09:00');
  const [logPage, setLogPage] = useState(0);
  const logPageSize = 10;

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const [formData, setFormData] = useState({
    name: '',
    type: 'interval',
    interval_value: '30',
    interval_unit: 'm',
    fixed_time: '',
    daily_time: [] as string[],
    prompt: '',
    model: 'gpt-3.5-turbo',
    webhook_url: '',
    status: 'active',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksData, logsData] = await Promise.all([
        schedulerApi.getTasks(),
        schedulerApi.getLogs(),
      ]);
      setTasks(tasksData || []);
      setLogs(logsData || []);
      setSelectedTasks(new Set()); // Reset selection on reload
    } catch (err: unknown) {
      showNotification(
        `${t('notification.refresh_failed')}: ${(err as Error)?.message || ''}`,
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [showNotification, t]);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      schedulerApi
        .getLogs()
        .then((data: SchedulerLog[]) => setLogs(data || []))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleEdit = (task: SchedulerTask) => {
    setEditingTask(task);

    // Parse interval if exists (e.g., "30m" -> "30", "m")
    let iv = '30';
    let iu = 'm';
    if (task.interval) {
      const match = task.interval.match(/^(\d+)([mhd])$/);
      if (match) {
        iv = match[1];
        iu = match[2];
      }
    }

    setFormData({
      name: task.name,
      type: task.type,
      interval_value: iv,
      interval_unit: iu,
      fixed_time: task.fixed_time || '',
      daily_time: task.daily_time ? task.daily_time.split(',').filter(Boolean) : [],
      prompt: task.prompt,
      model: task.model,
      webhook_url: task.webhook_url || '',
      status: task.status,
    });
    setModalOpen(true);
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await schedulerApi.updateTask(id, { status: newStatus as 'active' | 'paused' });
      // showNotification(t('scheduler.task_updated'), 'success');
      // Optimistic update or reload
      loadData();
    } catch (err: unknown) {
      showNotification(`${t('scheduler.save_failed')}: ${(err as Error)?.message}`, 'error');
    }
  };

  const handleRunTask = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await schedulerApi.runTask(id);
        showNotification(t('scheduler.task_triggered'), 'success');
        setTimeout(loadData, 1000);
      } catch (error: unknown) {
        console.error('Failed to run task:', error);
        showNotification(`Failed to trigger task: ${(error as Error).message}`, 'error');
      }
    },
    [loadData, showNotification, t]
  );

  const handleClearLogs = useCallback(async () => {
    if (!logs.length) return;
    if (!confirm('Are you sure you want to clear all execution logs?')) return;
    try {
      await schedulerApi.clearLogs();
      showNotification(t('scheduler.logs_cleared'), 'success');
      loadData();
    } catch (error: unknown) {
      console.error('Failed to clear logs:', error);
      showNotification(`Failed to clear logs: ${(error as Error).message}`, 'error');
    }
  }, [logs.length, loadData, showNotification, t]);

  const handleCreate = () => {
    setEditingTask({});
    setFormData({
      name: 'New Task',
      type: 'interval',
      interval_value: '30',
      interval_unit: 'm',
      fixed_time: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
      daily_time: ['09:00'],
      prompt: 'Summarize network status',
      model: 'gpt-3.5-turbo',
      webhook_url: '',
      status: 'active',
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('scheduler.confirm_delete'))) return;
    try {
      await schedulerApi.deleteTask(id);
      showNotification(t('scheduler.task_deleted'), 'success');
      loadData();
    } catch (err: unknown) {
      showNotification(`${t('scheduler.delete_failed')}: ${(err as Error)?.message}`, 'error');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Partial<SchedulerTask> = {
        name: formData.name,
        type: formData.type as SchedulerTask['type'],
        prompt: formData.prompt,
        model: formData.model,
        webhook_url: formData.webhook_url,
        status: formData.status as 'active' | 'paused',
      };

      if (formData.type === 'interval') {
        payload.interval = `${formData.interval_value}${formData.interval_unit}`;
      } else if (formData.type === 'daily') {
        payload.daily_time = formData.daily_time.join(',');
      } else {
        payload.fixed_time = formData.fixed_time;
      }

      if (editingTask.id) {
        await schedulerApi.updateTask(editingTask.id, payload);
        showNotification(t('scheduler.task_updated'), 'success');
      } else {
        await schedulerApi.createTask(payload as SchedulerTask);
        showNotification(t('scheduler.task_created'), 'success');
      }
      setModalOpen(false);
      loadData();
    } catch (err: unknown) {
      showNotification(`${t('scheduler.save_failed')}: ${(err as Error)?.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Filter Logic
  const filteredTasks = tasks.filter((task) => {
    const matchSearch =
      task.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.model.toLowerCase().includes(searchQuery.toLowerCase());
    const matchType = typeFilter === 'all' || task.type === typeFilter;
    return matchSearch && matchType;
  });

  const filteredLogs = logs.filter((log) => {
    const matchSearch =
      log.task_name.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
      log.output.toLowerCase().includes(logSearchQuery.toLowerCase());
    return matchSearch;
  });

  const handleViewTaskLogs = (taskId: string) => {
    setLogTaskFilter(taskId);
    setTaskLogModalOpen(true);
  };

  // Batch Handlers

  const handleSelectTask = (id: string, checked: boolean) => {
    const newSet = new Set(selectedTasks);
    if (checked) newSet.add(id);
    else newSet.delete(id);
    setSelectedTasks(newSet);
  };

  const handleBatchDelete = async () => {
    if (
      !confirm(
        t('scheduler.messages.confirm_batch_delete') || `Delete ${selectedTasks.size} tasks?`
      )
    )
      return;
    try {
      await Promise.all(Array.from(selectedTasks).map((id) => schedulerApi.deleteTask(id)));
      showNotification(t('scheduler.task_deleted'), 'success');
      loadData();
    } catch (err: unknown) {
      showNotification(`${t('scheduler.delete_failed')}: ${(err as Error)?.message}`, 'error');
    }
  };

  const handleBatchStatus = async (status: 'active' | 'paused') => {
    try {
      await Promise.all(
        Array.from(selectedTasks).map((id) => schedulerApi.updateTask(id, { status }))
      );
      showNotification(t('scheduler.task_updated'), 'success');
      loadData();
    } catch (err: unknown) {
      showNotification(`${t('scheduler.save_failed')}: ${(err as Error)?.message}`, 'error');
    }
  };

  // Stats calculation
  const stats = {
    total: tasks.length,
    active: tasks.filter((t) => t.status === 'active').length,
    paused: tasks.filter((t) => t.status === 'paused').length,
    successRate:
      logs.length > 0
        ? Math.round((logs.filter((l) => l.success).length / logs.length) * 100)
        : 100,
  };

  return (
    <div className="flex-column">
      <section className="hero-wrapper">
        <div className="hero-content">
          <div className="flex-row justify-between items-start">
             <div className="flex-column gap-xs">
              <div className="badge badge-primary" style={{ marginBottom: '8px', width: 'fit-content' }}>
                Automation Center
              </div>
              <h1 className="hero-title">{t('scheduler.page_title')}</h1>
              <p className="hero-subtitle">
                {t('scheduler.page_subtitle') || '自动化任务调度与日志监控中心。支持定时执行、间隔轮询与 cron 表达式触发。集成多模态大模型处理能力。'}
              </p>
            </div>
            <Button onClick={handleCreate} className="btn-glass" style={{ height: '48px', padding: '0 24px', borderRadius: '14px', boxShadow: '0 8px 20px -6px rgba(var(--primary-color-rgb), 0.3)' }}>
              <div className="flex-row items-center gap-sm">
                 <IconPlus size={20} /> 
                 <span style={{ fontWeight: 700 }}>{t('scheduler.create_task_button')}</span>
              </div>
            </Button>
          </div>
          
           <div className="flex-row gap-lg" style={{ marginTop: '40px' }}>
            <div className="flex-row items-center gap-sm">
               <span style={{ color: 'var(--primary-color)' }}>✦</span>
               <span className="text-secondary" style={{ fontSize: '14px', fontWeight: 600 }}>{t('scheduler.feature_1') || '精准调度'}</span>
            </div>
             <div className="flex-row items-center gap-sm">
               <span style={{ color: 'var(--primary-color)' }}>✦</span>
               <span className="text-secondary" style={{ fontSize: '14px', fontWeight: 600 }}>{t('scheduler.feature_2') || '执行日志'}</span>
            </div>
             <div className="flex-row items-center gap-sm">
               <span style={{ color: 'var(--primary-color)' }}>✦</span>
               <span className="text-secondary" style={{ fontSize: '14px', fontWeight: 600 }}>{t('scheduler.feature_3') || '失败重试'}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="page-container">
        <div className="card card-glass">
          <div className="card-body">
            <div className="flex-column gap-xl">

        {/* 顶部统计面板 - 使用统一样式 */}
        <div className="grid cols-4" style={{ gap: '24px' }}>
          <div className="stat-card">
            <div className="stat-icon primary">
              <IconScrollText size={24} />
            </div>
            <div className="stat-content">
              <span className="stat-label">{t('common.total_tasks', { defaultValue: '任务总数' })}</span>
              <span className="stat-value">{stats.total}</span>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon success">
              <IconActivity size={24} />
            </div>
            <div className="stat-content">
              <span className="stat-label">运行中</span>
              <span className="stat-value success">{stats.active}</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon warning">
              <IconPause size={24} />
            </div>
            <div className="stat-content">
              <span className="stat-label">已暂停</span>
              <span className="stat-value warning">{stats.paused}</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon info">
              <IconActivity size={24} />
            </div>
            <div className="stat-content">
              <span className="stat-label">24H 成功率</span>
              <span className="stat-value primary">{stats.successRate}%</span>
            </div>
          </div>
        </div>

        {/* 工具栏与主列表 */}
        <div className="flex-column gap-lg">
          <div className="toolbar">
            <div className="flex-row items-center gap-md flex-1">
              <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                <Input
                  className="input-premium"
                  style={{ paddingLeft: '44px', width: '100%' }}
                  placeholder={t('scheduler.search_placeholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <IconSearch size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
              </div>
              
              <div className="flex-row items-center gap-sm card-glass" style={{ padding: '0 16px', height: '44px', background: 'rgba(var(--bg-primary-rgb), 0.3)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                <IconFilter size={16} style={{ color: 'var(--text-tertiary)' }} />
                <select
                  className="input-premium"
                  style={{ border: 'none', background: 'transparent', padding: '0 8px', width: '130px', height: '40px', fontWeight: 600 }}
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as 'all' | 'interval' | 'fixed_time')}
                >
                  <option value="all">{t('scheduler.filter_all')}</option>
                  <option value="interval">{t('scheduler.form.type_interval')}</option>
                  <option value="fixed_time">{t('scheduler.form.type_fixed')}</option>
                </select>
              </div>
            </div>

            <div className="flex-row items-center gap-md">
              {selectedTasks.size > 0 && (
                <div className="flex-row items-center gap-sm card-glass p-xs rounded-lg" style={{ background: 'rgba(var(--bg-primary-rgb), 0.4)', padding: '6px 12px', border: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, marginRight: '8px', color: 'var(--primary-color)' }}>
                    已选中 {selectedTasks.size}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => handleBatchStatus('paused')} title={t('scheduler.form.status_paused')}>
                    <IconPause size={16} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleBatchStatus('active')} title={t('scheduler.form.status_active')}>
                    <IconPlay size={16} />
                  </Button>
                  <div style={{ width: '1px', height: '20px', background: 'var(--border-color)', margin: '0 8px' }} />
                  <Button size="sm" variant="ghost" className="text-error" onClick={handleBatchDelete} title={t('common.delete')}>
                    <IconTrash2 size={16} />
                  </Button>
                </div>
              )}
              <Button variant="secondary" size="sm" onClick={loadData} className="btn-glass" style={{ width: '44px', height: '44px', padding: 0 }}>
                <IconRefreshCw size={20} className={loading ? 'animate-spin' : ''} />
              </Button>
            </div>
          </div>

          {loading && tasks.length === 0 ? (
            <div className="flex-center" style={{ padding: '80px' }}>
              <LoadingSpinner />
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="card-glass" style={{ padding: '80px', borderRadius: '24px' }}>
              <EmptyState
                title={t('scheduler.no_tasks_title')}
                description={t('scheduler.no_tasks_desc')}
                action={<Button onClick={handleCreate} className="btn-glass">{t('scheduler.create_task_button')}</Button>}
              />
            </div>
          ) : (
            <div className="grid cols-3" style={{ gap: '24px' }}>
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className={`card-glass flex-column card-hover ${selectedTasks.has(task.id) ? 'active-selection' : ''}`}
                  style={{ 
                    padding: '24px', 
                    borderRadius: '24px',
                    border: selectedTasks.has(task.id) ? '2px solid var(--primary-color)' : '1px solid var(--glass-border-color)',
                    background: selectedTasks.has(task.id) ? 'linear-gradient(135deg, rgba(var(--primary-color-rgb), 0.1) 0%, rgba(var(--primary-color-rgb), 0.02) 100%)' : 'var(--glass-bg)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  {/* 背景装饰线 */}
                  <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: task.status === 'active' ? 'var(--success-color)' : 'var(--border-color)', opacity: 0.6 }} />

                  <div className="flex-row justify-between items-start mb-lg">
                    <div className="flex-column gap-xs">
                      <div className="flex-row items-center gap-sm">
                        <input
                          type="checkbox"
                          className="checkbox-premium"
                          checked={selectedTasks.has(task.id)}
                          onChange={(e) => handleSelectTask(task.id, e.target.checked)}
                        />
                        <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 850, letterSpacing: '-0.01em' }}>{task.name}</h3>
                      </div>
                      <div className="flex-row items-center gap-xs">
                         <span className={`badge ${task.status === 'active' ? 'badge-success' : 'badge-secondary'}`} style={{ fontSize: '10px', padding: '2px 8px' }}>
                           {task.status === 'active' ? '运行中' : '已暂停'}
                         </span>
                         <span className="badge badge-primary-light" style={{ fontSize: '10px', padding: '2px 8px' }}>{task.type.toUpperCase()}</span>
                      </div>
                    </div>
                    <ToggleSwitch
                      checked={task.status === 'active'}
                      onChange={(checked) =>
                        handleStatusChange(task.id, checked ? 'active' : 'paused')
                      }
                    />
                  </div>

                  <div className="flex-column gap-md mb-xl" style={{ flex: 1 }}>
                    <div className="flex-row items-center gap-md" style={{ background: 'rgba(var(--bg-primary-rgb), 0.4)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                      <IconClock size={16} style={{ color: 'var(--primary-color)', opacity: 0.8 }} />
                      <div className="flex-column">
                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase' }}>执行周期</span>
                        <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
                          {task.type === 'interval'
                            ? `每隔 ${task.interval}`
                            : task.type === 'daily'
                              ? `每天 ${task.daily_time}`
                              : `预定于 ${new Date(task.fixed_time || '').toLocaleString()}`}
                        </span>
                      </div>
                    </div>

                    <div className="flex-row items-center gap-md" style={{ padding: '0 4px' }}>
                      <IconCpu size={16} style={{ color: 'var(--text-tertiary)' }} />
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>模型：<b style={{ color: 'var(--text-primary)' }}>{task.model}</b></span>
                    </div>

                    <div className="flex-row items-center gap-md" style={{ padding: '0 4px' }}>
                      <IconCalendar size={16} style={{ color: 'var(--text-tertiary)' }} />
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        下次运行：
                        <span style={{ fontWeight: 600, color: task.status === 'active' ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                          {task.next_run_at ? new Date(task.next_run_at).toLocaleString() : '-'}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="flex-row justify-between items-center pt-lg" style={{ borderTop: '1px dashed var(--border-light)' }}>
                    <div className="flex-row gap-sm">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => handleRunTask(task.id, e)}
                        className="btn-glass"
                        style={{ width: '36px', height: '36px', padding: 0 }}
                      >
                        <IconPlay size={18} />
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleViewTaskLogs(task.id)}
                        className="btn-glass"
                        style={{ width: '36px', height: '36px', padding: 0 }}
                      >
                        <IconScrollText size={18} />
                      </Button>
                    </div>
                    <div className="flex-row gap-xs">
                      <Button variant="secondary" size="sm" onClick={() => handleEdit(task)} className="btn-glass" style={{ fontSize: '12px', padding: '6px 12px' }}>
                         编辑
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(task.id)} className="text-error" style={{ width: '36px', height: '36px', padding: 0 }}>
                        <IconTrash2 size={18} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 执行日志面板 - 专业表格设计 */}
        <div className="card-glass flex-column" style={{ padding: '0', borderRadius: '24px', overflow: 'hidden' }}>
          <div className="flex-row justify-between items-center" style={{ padding: '24px 32px', background: 'rgba(var(--bg-primary-rgb), 0.3)', borderBottom: '1px solid var(--border-light)' }}>
            <div className="flex-row items-center gap-md">
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, rgba(var(--primary-color-rgb), 0.2) 0%, rgba(var(--primary-color-rgb), 0.05) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconScrollText size={18} style={{ color: 'var(--primary-color)' }} />
              </div>
              <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 900, letterSpacing: '-0.02em' }}>{t('scheduler.execution_logs_title')}</h2>
              <span className="badge badge-secondary" style={{ fontSize: '11px' }}>最近 {logs.length} 条记录</span>
            </div>
            <div className="flex-row items-center gap-md">
              <div style={{ position: 'relative' }}>
                <Input
                  className="input-premium"
                  placeholder={t('scheduler.search_logs')}
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                  style={{ minWidth: '280px', paddingLeft: '40px' }}
                />
                <IconSearch size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearLogs}
                disabled={logs.length === 0}
                className="text-error btn-glass"
                style={{ width: '40px', height: '40px', padding: 0 }}
              >
                <IconTrash2 size={20} />
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="table-premium" style={{ margin: 0, width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr style={{ background: 'rgba(var(--bg-primary-rgb), 0.5)' }}>
                  <th style={{ padding: '16px 32px', textAlign: 'left', fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 800 }}>执行时间</th>
                  <th style={{ padding: '16px 16px', textAlign: 'left', fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 800 }}>任务名称</th>
                  <th style={{ padding: '16px 16px', textAlign: 'left', fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 800 }}>耗时</th>
                  <th style={{ padding: '16px 16px', textAlign: 'left', fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 800 }}>状态</th>
                  <th style={{ padding: '16px 32px', textAlign: 'left', fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 800 }}>执行输出</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.slice(logPage * logPageSize, (logPage + 1) * logPageSize).map((log, idx) => (
                  <tr key={log.id} style={{ transition: 'background 0.2s ease', borderBottom: idx === filteredLogs.length - 1 ? 'none' : '1px solid var(--border-light)' }}>
                    <td style={{ padding: '16px 32px', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>{new Date(log.executed_at).toLocaleString()}</td>
                    <td style={{ padding: '16px 16px', fontWeight: 800, color: 'var(--text-primary)' }}>{log.task_name}</td>
                    <td style={{ padding: '16px 16px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: '6px' }}>
                        {formatDuration(log.duration_ms)}
                      </span>
                    </td>
                    <td style={{ padding: '16px 16px' }}>
                      <div className="flex-row items-center gap-xs">
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: log.success ? 'var(--success-color)' : 'var(--error-color)', boxShadow: `0 0 8px ${log.success ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}` }} />
                        <span style={{ fontSize: '12px', fontWeight: 600, color: log.success ? 'var(--success-color)' : 'var(--error-color)' }}>
                          {log.success ? '成功' : '失败'}
                        </span>
                      </div>
                    </td>
                    <td
                      style={{ 
                        padding: '16px 32px', 
                        fontSize: '13px', 
                        color: 'var(--text-tertiary)', 
                        maxWidth: '400px', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                        fontFamily: 'monospace'
                      }}
                      title={log.output}
                      onClick={() => {
                        setLogTaskFilter(log.task_id);
                        setTaskLogModalOpen(true);
                      }}
                    >
                      {log.output || <span style={{ opacity: 0.3 }}>(无内容)</span>}
                    </td>
                  </tr>
                ))}
                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '100px 32px' }}>
                       <div className="flex-column items-center gap-md" style={{ opacity: 0.4 }}>
                         <IconScrollText size={48} />
                         <span style={{ fontWeight: 600 }}>暂无历史执行记录</span>
                       </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {filteredLogs.length > logPageSize && (
            <div className="flex-row justify-between items-center" style={{ padding: '20px 32px', borderTop: '1px solid var(--border-light)', background: 'rgba(var(--bg-primary-rgb), 0.2)' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
                显示第 {logPage * logPageSize + 1} 至 {Math.min((logPage + 1) * logPageSize, filteredLogs.length)} 条，共 {filteredLogs.length} 条
              </span>
              <div className="flex-row items-center gap-md">
                <Button
                  variant="secondary"
                  size="sm"
                  className="btn-glass"
                  disabled={logPage === 0}
                  onClick={() => setLogPage((p) => Math.max(0, p - 1))}
                  style={{ width: '36px', height: '36px', padding: 0 }}
                >
                  <IconChevronLeft size={18} />
                </Button>
                <div className="flex-row gap-xs">
                  {Array.from({ length: Math.ceil(filteredLogs.length / logPageSize) }).map((_, i) => (
                    <div 
                      key={i} 
                      onClick={() => setLogPage(i)}
                      style={{ 
                        width: '8px', 
                        height: '8px', 
                        borderRadius: '50%', 
                        background: i === logPage ? 'var(--primary-color)' : 'var(--border-color)',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease'
                      }} 
                    />
                  ))}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="btn-glass"
                  disabled={(logPage + 1) * logPageSize >= filteredLogs.length}
                  onClick={() => setLogPage((p) => p + 1)}
                  style={{ width: '36px', height: '36px', padding: 0 }}
                >
                  <IconChevronRight size={18} />
                </Button>
              </div>
            </div>
          )}
        </div>
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingTask.id ? t('scheduler.modal_title_edit') : t('scheduler.modal_title_create')}
        width={640}
        footer={
          <div className="flex-row justify-end gap-md">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              {t('scheduler.cancel')}
            </Button>
            <Button onClick={handleSave} loading={saving} className="btn-glass" style={{ minWidth: '100px' }}>
              {t('scheduler.save')}
            </Button>
          </div>
        }
      >
        <div className="flex-row bg-secondary p-xs rounded-lg mb-xl" style={{ background: 'rgba(var(--bg-primary-rgb), 0.5)', padding: '4px', border: '1px solid var(--border-color)' }}>
          <div
            className={`flex-1 text-center py-sm rounded-md cursor-pointer transition-all ${formData.type === 'interval' ? 'bg-primary text-white shadow-sm' : 'text-secondary hover:bg-hover'}`}
            style={{ fontWeight: 600, fontSize: '13px' }}
            onClick={() => setFormData({ ...formData, type: 'interval' })}
          >
            {t('scheduler.form.type_interval')}
          </div>
          <div
            className={`flex-1 text-center py-sm rounded-md cursor-pointer transition-all ${formData.type === 'fixed_time' ? 'bg-primary text-white shadow-sm' : 'text-secondary hover:bg-hover'}`}
            style={{ fontWeight: 600, fontSize: '13px' }}
            onClick={() => setFormData({ ...formData, type: 'fixed_time' })}
          >
            {t('scheduler.form.type_fixed')}
          </div>
          <div
            className={`flex-1 text-center py-sm rounded-md cursor-pointer transition-all ${formData.type === 'daily' ? 'bg-primary text-white shadow-sm' : 'text-secondary hover:bg-hover'}`}
            style={{ fontWeight: 600, fontSize: '13px' }}
            onClick={() => setFormData({ ...formData, type: 'daily' })}
          >
            {t('scheduler.form.type_daily')}
          </div>
        </div>

        <div className="flex-column gap-xl">
          <div className="flex-column gap-md">
            <div className="flex-row items-center gap-sm" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary-color)', opacity: 0.9 }}>
              <IconActivity size={16} />
              <span>{t('common.basic_info', { defaultValue: 'Basic Information' })}</span>
            </div>
            <Input
              label={t('scheduler.form.name')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.target.name"
              autoFocus
            />
          </div>

          <div className="flex-column gap-md">
            <div className="flex-row items-center gap-sm" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary-color)', opacity: 0.9 }}>
              <IconClock size={16} />
              <span>{t('scheduler.scheduling', { defaultValue: 'Scheduling' })}</span>
            </div>
            {formData.type === 'interval' ? (
              <div className="grid cols-2" style={{ gap: '16px' }}>
                <Input
                  type="number"
                  label={t('scheduler.form.interval_label')}
                  value={formData.interval_value}
                  min={1}
                  onChange={(e) => setFormData({ ...formData, interval_value: e.target.value })}
                />
                <div className="flex-column gap-xs">
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('common.unit', { defaultValue: 'Unit' })}</label>
                  <select
                    className="input-premium"
                    value={formData.interval_unit}
                    onChange={(e) => setFormData({ ...formData, interval_unit: e.target.value })}
                  >
                    <option value="m">Minutes</option>
                    <option value="h">Hours</option>
                    <option value="d">Days</option>
                  </select>
                </div>
              </div>
            ) : formData.type === 'daily' ? (
              <div className="flex-column gap-md">
                <div className="flex-row items-end gap-md">
                  <div style={{ flex: 1 }}>
                    <TimePicker
                      label={t('scheduler.form.daily_time_label')}
                      onChange={setTempTimePoint}
                      value={tempTimePoint}
                    />
                  </div>
                  <Button
                    variant="primary"
                    style={{ height: '42px' }}
                    className="btn-glass"
                    onClick={() => {
                      if (tempTimePoint && !formData.daily_time.includes(tempTimePoint)) {
                        setFormData({
                          ...formData,
                          daily_time: [...formData.daily_time, tempTimePoint].sort(),
                        });
                      }
                    }}
                  >
                    <IconPlus size={18} />
                  </Button>
                </div>
                <div className="flex-row flex-wrap gap-sm">
                  {formData.daily_time.map((time) => (
                    <span
                      key={time}
                      className="badge badge-secondary flex-row items-center gap-xs"
                      style={{ padding: '6px 12px', borderRadius: '8px' }}
                    >
                      <span style={{ fontWeight: 600 }}>{time}</span>
                      <IconTrash2
                        size={14}
                        style={{ cursor: 'pointer', color: 'var(--error-color)' }}
                        onClick={() =>
                          setFormData({
                            ...formData,
                            daily_time: formData.daily_time.filter((t) => t !== time),
                          })
                        }
                      />
                    </span>
                  ))}
                  {formData.daily_time.length === 0 && (
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                      No time points added
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <Input
                type="datetime-local"
                label={t('scheduler.form.fixed_time_label')}
                value={formData.fixed_time}
                onChange={(e) => setFormData({ ...formData, fixed_time: e.target.value })}
              />
            )}
          </div>

          <div className="flex-column gap-md">
            <div className="flex-row items-center gap-sm" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary-color)', opacity: 0.9 }}>
              <IconCpu size={16} />
              <span>{t('scheduler.ai_config', { defaultValue: 'AI Configuration' })}</span>
            </div>
            
            <div className="grid cols-2" style={{ gap: '16px' }}>
              <ModelSelector
                label={t('scheduler.form.model')}
                value={formData.model}
                onChange={(val) => setFormData({ ...formData, model: val })}
              />
              <Input
                label={t('scheduler.form.webhook_url')}
                value={formData.webhook_url}
                onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })}
                placeholder="https://..."
              />
            </div>
            
            <div className="flex-column gap-xs">
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('scheduler.form.prompt')}</label>
              <textarea
                rows={4}
                value={formData.prompt}
                onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                className="input-premium"
                style={{ borderRadius: '12px', padding: '12px', height: '120px', resize: 'none' }}
              />
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={taskLogModalOpen}
        onClose={() => setTaskLogModalOpen(false)}
        title={t('scheduler.log_detail_title')}
        width={720}
      >
        <div style={{ maxHeight: '70vh', overflowY: 'auto' }} className="flex-column gap-md">
          {logs.filter((l) => l.task_id === logTaskFilter).length === 0 ? (
            <div className="flex-center" style={{ padding: '60px', color: 'var(--text-tertiary)' }}>
              {t('scheduler.no_history_for_task')}
            </div>
          ) : (
            <div className="flex-column gap-md">
              {logs
                .filter((l) => l.task_id === logTaskFilter)
                .map((log) => (
                  <div
                    key={log.id}
                    className="card-glass"
                    style={{
                      padding: '20px',
                      background: 'rgba(var(--bg-primary-rgb), 0.3)',
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    <div className="flex-row justify-between items-center mb-md pb-sm" style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        {new Date(log.executed_at).toLocaleString()}
                      </span>
                      <div className="flex-row items-center gap-md">
                        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{formatDuration(log.duration_ms)}</span>
                        <span className={`badge ${log.success ? 'badge-success' : 'badge-error'}`} style={{ fontSize: '11px' }}>
                          {log.success ? t('scheduler.log_success') : t('scheduler.log_failed')}
                        </span>
                      </div>
                    </div>
                    <pre
                      style={{
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        fontSize: '13px',
                        lineHeight: 1.6,
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)',
                        opacity: 0.95
                      }}
                    >
                      {log.output}
                    </pre>
                  </div>
                ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
