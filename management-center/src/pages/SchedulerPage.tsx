import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useNotificationStore } from '@/stores';
import { schedulerApi, SchedulerTask, SchedulerLog } from '@/services/api';
import styles from './SchedulerPage.module.scss';
import { IconTrash2, IconRefreshCw } from '@/components/ui/icons';

export function SchedulerPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();

  const [tasks, setTasks] = useState<SchedulerTask[]>([]);
  const [logs, setLogs] = useState<SchedulerLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingTask, setEditingTask] = useState<Partial<SchedulerTask>>({});

  const [formData, setFormData] = useState({
    name: '',
    type: 'interval',
    interval: '30m',
    fixed_time: '',
    prompt: '',
    model: 'gpt-3.5-turbo',
    webhook_url: '',
    status: 'active'
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksData, logsData] = await Promise.all([
        schedulerApi.getTasks(),
        schedulerApi.getLogs()
      ]);
      setTasks(tasksData || []);
      setLogs(logsData || []);
    } catch (err: any) {
      showNotification(`${t('notification.refresh_failed')}: ${err?.message || ''}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification, t]);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
        schedulerApi.getLogs().then((data: SchedulerLog[]) => setLogs(data || [])).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleEdit = (task: SchedulerTask) => {
    setEditingTask(task);
    setFormData({
      name: task.name,
      type: task.type,
      interval: task.interval || '30m',
      fixed_time: task.fixed_time || '',
      prompt: task.prompt,
      model: task.model,
      webhook_url: task.webhook_url || '',
      status: task.status
    });
    setModalOpen(true);
  };

  const handleCreate = () => {
    setEditingTask({});
    setFormData({
      name: 'New Task',
      type: 'interval',
      interval: '30m',
      fixed_time: '',
      prompt: 'Summarize network status',
      model: 'gpt-3.5-turbo',
      webhook_url: '',
      status: 'active'
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    try {
      await schedulerApi.deleteTask(id);
      showNotification('Task deleted', 'success');
      loadData();
    } catch (err: any) {
       showNotification(`Delete failed: ${err?.message}`, 'error');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = {
        name: formData.name,
        type: formData.type as any,
        prompt: formData.prompt,
        model: formData.model,
        webhook_url: formData.webhook_url,
        status: formData.status as any
      };
      
      if (formData.type === 'interval') payload.interval = formData.interval;
      else payload.fixed_time = formData.fixed_time;

      if (editingTask.id) {
        await schedulerApi.updateTask(editingTask.id, payload);
        showNotification('Task updated', 'success');
      } else {
        await schedulerApi.createTask(payload);
        showNotification('Task created', 'success');
      }
      setModalOpen(false);
      loadData();
    } catch (err: any) {
      showNotification(`Save failed: ${err?.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>Scheduled Tasks</h1>

      <Card title="Tasks" extra={
        <div className={styles.actions}>
           <Button variant="secondary" size="sm" onClick={loadData}><IconRefreshCw size={16}/></Button>
           <Button size="sm" onClick={handleCreate}>Create Task</Button>
        </div>
      }>
        {loading && tasks.length === 0 ? (
          <div className="flex-center"><LoadingSpinner /></div>
        ) : tasks.length === 0 ? (
          <EmptyState title="No tasks found" description="Create a scheduled task to get started." action={<Button onClick={handleCreate}>Create Task</Button>} />
        ) : (
          <div className={styles.taskList}>
            {tasks.map(task => (
              <div key={task.id} className={styles.taskItem}>
                <div className={styles.taskInfo}>
                  <h3>{task.name}</h3>
                  <div className={styles.meta}>
                     <span className={`${styles.statusBadge} ${styles[task.status]}`}>{task.status}</span>
                     <span>{task.type === 'interval' ? `Every ${task.interval}` : `At ${task.fixed_time}`}</span>
                     <span>Model: {task.model}</span>
                     <span>Next Run: {task.next_run_at ? new Date(task.next_run_at).toLocaleString() : '-'}</span>
                  </div>
                </div>
                <div className={styles.actions}>
                  <Button variant="secondary" size="sm" onClick={() => handleEdit(task)}>Edit</Button>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(task.id)}><IconTrash2 size={16}/></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className={styles.logsContainer}>
        <h2>Execution Logs</h2>
         {logs.length === 0 ? <p>No execution logs yet.</p> : (
           <div className={styles.logList}>
             {logs.map(log => (
               <div key={log.id} className={`${styles.logEntry} ${!log.success ? styles.error : ''}`}>
                 <span>{new Date(log.executed_at).toLocaleString()}</span>
                 <span>{log.task_name}</span>
                 <span>{log.duration_ms}ms</span>
                 <span>{log.success ? 'Success' : 'Failed'}</span>
                 <span title={log.output}>{log.output.substring(0, 50)}{log.output.length > 50 ? '...' : ''}</span>
               </div>
             ))}
           </div>
         )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingTask.id ? "Edit Task" : "Create Task"} 
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>Save</Button>
          </>
        }
      >
        <div className={styles.formGroup}>
           <label>Name</label>
           <input className="input" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
        </div>
        <div className={styles.formGroup}>
           <label>Type</label>
           <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
             <option value="interval">Interval</option>
             <option value="fixed_time">Fixed Time</option>
           </select>
        </div>
        {formData.type === 'interval' ? (
           <div className={styles.formGroup}>
             <label>Interval (e.g. 30m, 1h)</label>
             <input className="input" value={formData.interval} onChange={e => setFormData({...formData, interval: e.target.value})} />
           </div>
        ) : (
           <div className={styles.formGroup}>
             <label>Fixed Time (ISO 8601)</label>
             <input className="input" value={formData.fixed_time} onChange={e => setFormData({...formData, fixed_time: e.target.value})} />
           </div>
        )}
        <div className={styles.formGroup}>
           <label>Model</label>
           <input className="input" value={formData.model} onChange={e => setFormData({...formData, model: e.target.value})} />
        </div>
        <div className={styles.formGroup}>
           <label>Prompt</label>
           <textarea rows={3} value={formData.prompt} onChange={e => setFormData({...formData, prompt: e.target.value})} />
        </div>
        <div className={styles.formGroup}>
           <label>Webhook URL (Optional)</label>
           <input className="input" value={formData.webhook_url} onChange={e => setFormData({...formData, webhook_url: e.target.value})} />
        </div>
        <div className={styles.formGroup}>
           <label>Status</label>
           <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
             <option value="active">Active</option>
             <option value="paused">Paused</option>
             <option value="finished">Finished</option>
           </select>
        </div>
      </Modal>
    </div>
  );
}
