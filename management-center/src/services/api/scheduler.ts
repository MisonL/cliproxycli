import { apiClient as api } from './client';

export interface SchedulerTask {
  id: string;
  name: string;
  type: 'interval' | 'fixed_time';
  interval?: string;
  fixed_time?: string;
  prompt: string;
  model: string;
  webhook_url?: string;
  status: 'active' | 'paused' | 'finished';
  created_at: string;
  last_run_at?: string;
  next_run_at?: string;
  failure_count: number;
}

export interface SchedulerLog {
  id: string;
  task_id: string;
  task_name: string;
  executed_at: string;
  duration_ms: number;
  success: boolean;
  output: string;
  webhook_status: number;
}

export const schedulerApi = {
  getTasks: () => api.get<SchedulerTask[]>('/scheduler/tasks'),
  getTask: (id: string) => api.get<SchedulerTask>(`/scheduler/tasks/${id}`),
  createTask: (
    data: Omit<SchedulerTask, 'id' | 'created_at' | 'last_run_at' | 'next_run_at' | 'failure_count'>
  ) => api.post<SchedulerTask>('/scheduler/tasks', data),
  updateTask: (id: string, data: Partial<SchedulerTask>) =>
    api.patch<SchedulerTask>(`/scheduler/tasks/${id}`, data),
  deleteTask: (id: string) => api.delete(`/scheduler/tasks/${id}`),
  getLogs: () => api.get<SchedulerLog[]>('/scheduler/logs'),
};
