import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useNotificationStore } from '@/stores';
import { schedulerApi, SchedulerTask, SchedulerLog } from '@/services/api';
import styles from './SchedulerPage.module.scss';
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
    <div className={styles.container}>
      <div className={styles.headerSection}>
        <h1 className={styles.pageTitle}>{t('scheduler.page_title')}</h1>
        <Button onClick={handleCreate} className={styles.createBtn}>
          <IconPlus size={18} /> {t('scheduler.create_task_button')}
        </Button>
      </div>

      {/* Stats Overview */}
      <div className={styles.statsBar}>
        <div className={`${styles.statCard} ${styles.pending}`}>
          <span className={styles.statLabel}>
            {t('common.total_tasks', { defaultValue: 'Total Tasks' })}
          </span>
          <span className={styles.statValue}>{stats.total}</span>
        </div>
        <div className={`${styles.statCard} ${styles.success}`}>
          <span className={styles.statLabel}>{t('scheduler.form.status_active')}</span>
          <span className={styles.statValue}>{stats.active}</span>
        </div>
        <div className={`${styles.statCard} ${styles.warning}`}>
          <span className={styles.statLabel}>{t('scheduler.form.status_paused')}</span>
          <span className={styles.statValue}>{stats.paused}</span>
        </div>
        <div className={`${styles.statCard} ${styles.success}`}>
          <span className={styles.statLabel}>
            {t('scheduler.success_rate', { defaultValue: '24h Success Rate' })}
          </span>
          <span className={styles.statValue}>{stats.successRate}%</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Input
            className={styles.searchInput}
            placeholder={t('scheduler.search_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            rightElement={<IconSearch size={16} />}
          />
          <div style={{ position: 'relative' }}>
            <IconFilter
              size={16}
              style={{
                position: 'absolute',
                left: 12,
                top: 11,
                pointerEvents: 'none',
                color: 'var(--text-secondary)',
              }}
            />
            <select
              className={styles.filterSelect}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | 'interval' | 'fixed_time')}
            >
              <option value="all">{t('scheduler.filter_all')}</option>
              <option value="interval">{t('scheduler.form.type_interval')}</option>
              <option value="fixed_time">{t('scheduler.form.type_fixed')}</option>
            </select>
          </div>
        </div>

        <div className={styles.actions}>
          {selectedTasks.size > 0 && (
            <div className={styles.batchActions}>
              <Button size="sm" variant="secondary" onClick={() => handleBatchStatus('paused')}>
                <IconPause size={14} />
              </Button>
              <Button size="sm" variant="secondary" onClick={() => handleBatchStatus('active')}>
                <IconPlay size={14} />
              </Button>
              <Button size="sm" variant="danger" onClick={handleBatchDelete}>
                <IconTrash2 size={14} />
              </Button>
            </div>
          )}
          <Button variant="secondary" size="sm" onClick={loadData}>
            <IconRefreshCw size={16} />
          </Button>
        </div>
      </div>

      <div className={styles.taskSection}>
        {loading && tasks.length === 0 ? (
          <div className="flex-center" style={{ padding: '60px' }}>
            <LoadingSpinner />
          </div>
        ) : filteredTasks.length === 0 ? (
          <EmptyState
            title={t('scheduler.no_tasks_title')}
            description={t('scheduler.no_tasks_desc')}
            action={<Button onClick={handleCreate}>{t('scheduler.create_task_button')}</Button>}
          />
        ) : (
          <div className={styles.taskGrid}>
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                className={`${styles.taskCard} ${selectedTasks.has(task.id) ? styles.selected : ''}`}
              >
                <div className={styles.cardHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      type="checkbox"
                      checked={selectedTasks.has(task.id)}
                      onChange={(e) => handleSelectTask(task.id, e.target.checked)}
                    />
                    <h3>{task.name}</h3>
                  </div>
                  <ToggleSwitch
                    checked={task.status === 'active'}
                    onChange={(checked) =>
                      handleStatusChange(task.id, checked ? 'active' : 'paused')
                    }
                  />
                </div>

                <div className={styles.cardBody}>
                  <div className={styles.metaRow}>
                    <IconClock size={14} />
                    <span>
                      {task.type === 'interval'
                        ? `${t('scheduler.meta.every')} ${task.interval}`
                        : task.type === 'daily'
                          ? `${t('scheduler.meta.daily_at')} ${task.daily_time}`
                          : `${t('scheduler.meta.at')} ${new Date(task.fixed_time || '').toLocaleString()}`}
                    </span>
                  </div>
                  <div className={styles.metaRow}>
                    <IconCpu size={14} />
                    <span className={styles.modelBadge}>{task.model}</span>
                  </div>
                  <div className={styles.metaRow}>
                    <IconCalendar size={14} />
                    <span>
                      {t('scheduler.meta.next_run')}:{' '}
                      {task.next_run_at ? new Date(task.next_run_at).toLocaleString() : '-'}
                    </span>
                  </div>
                </div>

                <div className={styles.cardFooter}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleRunTask(task.id, e)}
                      title={t('scheduler.run_now')}
                    >
                      <IconPlay size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewTaskLogs(task.id)}
                      title={t('scheduler.view_logs')}
                    >
                      <IconScrollText size={16} />
                    </Button>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Button variant="secondary" size="sm" onClick={() => handleEdit(task)}>
                      {t('scheduler.edit')}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => handleDelete(task.id)}>
                      <IconTrash2 size={16} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.logsSection}>
        <div className={styles.logsHeader}>
          <h2>{t('scheduler.execution_logs_title')}</h2>
          <div className={styles.toolbarLeft}>
            <Input
              placeholder={t('scheduler.search_logs')}
              value={logSearchQuery}
              onChange={(e) => setLogSearchQuery(e.target.value)}
              className={styles.logSearchInput}
              rightElement={<IconSearch size={14} />}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearLogs}
              disabled={logs.length === 0}
            >
              <IconTrash2 size={16} />
            </Button>
          </div>
        </div>

        <div className={styles.logTableContainer}>
          <table className={styles.logTable}>
            <thead>
              <tr>
                <th>{t('common.time', { defaultValue: 'Time' })}</th>
                <th>{t('common.task', { defaultValue: 'Task' })}</th>
                <th>{t('scheduler.duration', { defaultValue: 'Duration' })}</th>
                <th>{t('common.status', { defaultValue: 'Status' })}</th>
                <th>{t('common.output', { defaultValue: 'Output' })}</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.slice(logPage * logPageSize, (logPage + 1) * logPageSize).map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.executed_at).toLocaleString()}</td>
                  <td>{log.task_name}</td>
                  <td>{formatDuration(log.duration_ms)}</td>
                  <td className={log.success ? styles.statusSuccess : styles.statusError}>
                    <span className={log.success ? styles.badgeSuccess : styles.badgeError}>
                      {log.success ? t('scheduler.log_success') : t('scheduler.log_failed')}
                    </span>
                  </td>
                  <td
                    className={styles.logOutputCell}
                    title={log.output}
                    onClick={() => {
                      setLogTaskFilter(log.task_id);
                      setTaskLogModalOpen(true);
                    }}
                  >
                    {log.output.substring(0, 100)}
                    {log.output.length > 100 ? '...' : ''}
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}
                  >
                    {t('scheduler.no_logs')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {filteredLogs.length > logPageSize && (
            <div className={styles.logPagination}>
              <Button
                variant="ghost"
                size="sm"
                disabled={logPage === 0}
                onClick={() => setLogPage((p) => Math.max(0, p - 1))}
              >
                <IconChevronLeft size={16} />
              </Button>
              <span className={styles.paginationInfo}>
                {logPage + 1} / {Math.ceil(filteredLogs.length / logPageSize)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={(logPage + 1) * logPageSize >= filteredLogs.length}
                onClick={() => setLogPage((p) => p + 1)}
              >
                <IconChevronRight size={16} />
              </Button>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingTask.id ? t('scheduler.modal_title_edit') : t('scheduler.modal_title_create')}
        width={640}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              {t('scheduler.cancel')}
            </Button>
            <Button onClick={handleSave} loading={saving}>
              {t('scheduler.save')}
            </Button>
          </>
        }
      >
        <div className={styles.typeTabs}>
          <div
            className={`${styles.tabItem} ${formData.type === 'interval' ? styles.active : ''}`}
            onClick={() => setFormData({ ...formData, type: 'interval' })}
          >
            {t('scheduler.form.type_interval')}
          </div>
          <div
            className={`${styles.tabItem} ${formData.type === 'fixed_time' ? styles.active : ''}`}
            onClick={() => setFormData({ ...formData, type: 'fixed_time' })}
          >
            {t('scheduler.form.type_fixed')}
          </div>
          <div
            className={`${styles.tabItem} ${formData.type === 'daily' ? styles.active : ''}`}
            onClick={() => setFormData({ ...formData, type: 'daily' })}
          >
            {t('scheduler.form.type_daily')}
          </div>
        </div>

        <div className={styles.formGrid}>
          <div className={styles.fullWidth}>
            <div className={styles.formSectionTitle}>
              <IconActivity size={14} />{' '}
              {t('common.basic_info', { defaultValue: 'Basic Information' })}
            </div>
            <Input
              label={t('scheduler.form.name')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              autoFocus
            />
          </div>

          <div className={styles.fullWidth}>
            <div className={styles.formSectionTitle}>
              <IconClock size={14} /> {t('scheduler.scheduling', { defaultValue: 'Scheduling' })}
            </div>
            {formData.type === 'interval' ? (
              <div className={styles.intervalInputGroup}>
                <Input
                  type="number"
                  label={t('scheduler.form.interval_label')}
                  value={formData.interval_value}
                  min={1}
                  onChange={(e) => setFormData({ ...formData, interval_value: e.target.value })}
                />
                <div className="form-group">
                  <label>{t('common.unit', { defaultValue: 'Unit' })}</label>
                  <select
                    className={styles.filterSelect}
                    style={{ width: '100%', paddingLeft: 12 }}
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
              <div className={styles.fullWidth}>
                <div className={styles.intervalInputGroup} style={{ alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <TimePicker
                      label={t('scheduler.form.daily_time_label')}
                      onChange={setTempTimePoint}
                      value={tempTimePoint}
                    />
                  </div>
                  <Button
                    variant="primary"
                    style={{ padding: '0 16px', height: '36px', whiteSpace: 'nowrap' }}
                    onClick={() => {
                      if (tempTimePoint && !formData.daily_time.includes(tempTimePoint)) {
                        setFormData({
                          ...formData,
                          daily_time: [...formData.daily_time, tempTimePoint].sort(),
                        });
                      }
                    }}
                  >
                    {t('scheduler.form.add_time_point')}
                  </Button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  {formData.daily_time.map((time) => (
                    <span
                      key={time}
                      style={{
                        background: 'var(--bg-hover)',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      {time}
                      <IconTrash2
                        size={12}
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
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
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

          <div className={styles.fullWidth}>
            <div className={styles.formSectionTitle}>
              <IconCpu size={14} /> {t('scheduler.ai_config', { defaultValue: 'AI Configuration' })}
            </div>
          </div>

          <ModelSelector
            label={t('scheduler.form.model')}
            value={formData.model}
            onChange={(val) => setFormData({ ...formData, model: val })}
          />
          <Input
            label={t('scheduler.form.webhook_url')}
            value={formData.webhook_url}
            onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })}
          />
          <div className={`${styles.formGroup} ${styles.fullWidth}`}>
            <label>{t('scheduler.form.prompt')}</label>
            <textarea
              rows={4}
              value={formData.prompt}
              onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
              style={{ borderRadius: '8px', padding: '12px' }}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={taskLogModalOpen}
        onClose={() => setTaskLogModalOpen(false)}
        title={t('scheduler.log_detail_title')}
        width={720}
      >
        <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {logs.filter((l) => l.task_id === logTaskFilter).length === 0 ? (
            <p style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              {t('scheduler.no_history_for_task')}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {logs
                .filter((l) => l.task_id === logTaskFilter)
                .map((log) => (
                  <div
                    key={log.id}
                    style={{
                      padding: '16px',
                      background: 'var(--bg-hover)',
                      borderRadius: '10px',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 8,
                        fontSize: '13px',
                        fontWeight: 500,
                      }}
                    >
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {new Date(log.executed_at).toLocaleString()}
                      </span>
                      <span className={log.success ? styles.statusSuccess : styles.statusError}>
                        {log.success ? t('scheduler.log_success') : t('scheduler.log_failed')} (
                        {formatDuration(log.duration_ms)})
                      </span>
                    </div>
                    <pre
                      style={{
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        fontSize: '13px',
                        lineHeight: 1.5,
                        opacity: 0.9,
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
