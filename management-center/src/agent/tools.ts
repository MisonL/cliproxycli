import { schedulerApi } from '../services/api';

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  execute: (args: Record<string, unknown>) => Promise<unknown>;
};

export const tools: ToolDefinition[] = [
  {
    name: 'list_tasks',
    description: 'List all scheduled tasks. Returns an array of task objects.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      return await schedulerApi.getTasks();
    },
  },
  {
    name: 'create_task',
    description: 'Create a new scheduled task.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the task' },
        type: { type: 'string', enum: ['interval', 'fixed_time'], description: 'Type of schedule' },
        interval: { type: 'string', description: 'Interval string (e.g. "30m", "1h") if type is interval' },
        fixed_time: { type: 'string', description: 'ISO8601 time string if type is fixed_time' },
        prompt: { type: 'string', description: 'The prompt to send to the AI model' },
        model: { type: 'string', description: 'Model to use (default: gpt-3.5-turbo)' },
        webhook_url: { type: 'string', description: 'Optional webhook URL' },
      },
      required: ['name', 'type', 'prompt'],
    },
    execute: async (argsRaw) => {
      const args = argsRaw as { 
        name: string; 
        type: 'interval' | 'fixed_time'; 
        prompt: string; 
        model?: string; 
        webhook_url?: string; 
        interval?: string; 
        fixed_time?: string; 
        status: 'active' | 'paused' | 'finished' 
      };
      return await schedulerApi.createTask({
        ...args,
        model: args.model || 'gpt-3.5-turbo',
      });
    },
  },
  {
    name: 'get_logs',
    description: 'Get execution logs.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      return await schedulerApi.getLogs();
    },
  },
  {
    name: 'run_task_now',
    description: 'Immediately trigger a task by ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the task to run' },
      },
      required: ['id'],
    },
    execute: async (args) => {
      const { id } = args as { id: string };
      await schedulerApi.runTask(id);
      return { status: 'triggered' };
    },
  },
  {
    name: 'delete_task',
    description: 'Delete a task by ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the task to delete' },
      },
      required: ['id'],
    },
    execute: async (args) => {
      const { id } = args as { id: string };
      await schedulerApi.deleteTask(id);
      return { status: 'deleted' };
    },
  },
];
