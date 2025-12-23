/**
 * 模型工具函数
 * 迁移自基线 utils/models.js
 */

export interface ModelInfo {
  name: string;
  alias?: string;
  description?: string;
}

const MODEL_CATEGORIES = [
  { id: 'gpt', label: 'GPT', patterns: [/gpt/i, /\bo\d\b/i, /\bo\d+\.?/i, /\bchatgpt/i] },
  { id: 'claude', label: 'Claude', patterns: [/claude/i] },
  { id: 'gemini', label: 'Gemini', patterns: [/gemini/i, /\bgai\b/i] },
  { id: 'kiro', label: 'Kiro', patterns: [/kiro/i, /amazon/i, /codewhisperer/i] },
  { id: 'github-copilot', label: 'Copilot', patterns: [/copilot/i] },
  { id: 'kimi', label: 'Kimi', patterns: [/kimi/i] },
  { id: 'qwen', label: 'Qwen', patterns: [/qwen/i] },
  { id: 'glm', label: 'GLM', patterns: [/glm/i, /chatglm/i] },
  { id: 'grok', label: 'Grok', patterns: [/grok/i] },
  { id: 'deepseek', label: 'DeepSeek', patterns: [/deepseek/i] }
];

const matchCategory = (text: string) => {
  for (const category of MODEL_CATEGORIES) {
    if (category.patterns.some((pattern) => pattern.test(text))) {
      return category.id;
    }
  }
  return null;
};

export function normalizeModelList(payload: unknown, { dedupe = false } = {}): ModelInfo[] {
  const toModel = (entry: unknown): ModelInfo | null => {
    if (typeof entry === 'string') {
      return { name: entry };
    }
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    const obj = entry as Record<string, unknown>;
    const name = obj.id ?? obj.name ?? obj.model ?? obj.value;
    if (!name) return null;

    const alias = obj.alias ?? obj.display_name ?? obj.displayName;
    const description = obj.description ?? obj.note ?? obj.comment;
    const model: ModelInfo = { name: String(name) };
    if (alias && alias !== name) {
      model.alias = String(alias);
    }
    if (description) {
      model.description = String(description);
    }
    return model;
  };

  let models: (ModelInfo | null)[] = [];

  if (Array.isArray(payload)) {
    models = payload.map(toModel);
  } else if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data)) {
      models = obj.data.map(toModel);
    } else if (Array.isArray(obj.models)) {
      models = obj.models.map(toModel);
    }
  }

  const normalized = models.filter(Boolean) as ModelInfo[];
  if (!dedupe) {
    return normalized;
  }

  const seen = new Set<string>();
  return normalized.filter((model) => {
    const key = (model?.name || '').toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export interface ModelGroup {
  id: string;
  label: string;
  items: ModelInfo[];
}

export function classifyModels(models: ModelInfo[] = [], { otherLabel = 'Other' } = {}): ModelGroup[] {
  const groups: ModelGroup[] = MODEL_CATEGORIES.map((category) => ({
    id: category.id,
    label: category.label,
    items: []
  }));

  const otherGroup: ModelGroup = { id: 'other', label: otherLabel, items: [] };

  models.forEach((model) => {
    const name = (model?.name || '').toString();
    const alias = (model?.alias || '').toString();
    const haystack = `${name} ${alias}`.toLowerCase();
    const matchedId = matchCategory(haystack);
    const target = matchedId ? groups.find((group) => group.id === matchedId) : null;

    if (target) {
      target.items.push(model);
    } else {
      otherGroup.items.push(model);
    }
  });

  const populatedGroups = groups.filter((group) => group.items.length > 0);
  if (otherGroup.items.length) {
    populatedGroups.push(otherGroup);
  }

  return populatedGroups;
}

export interface ModelEntry {
  name: string;
  alias: string;
}

export const modelsToEntries = (models?: ModelAlias[]): ModelEntry[] => {
  if (!Array.isArray(models) || models.length === 0) {
    return [{ name: '', alias: '' }];
  }
  return models.map((m) => ({
    name: m.name || '',
    alias: m.alias || ''
  }));
};

export const entriesToModels = (entries: ModelEntry[]): ModelAlias[] => {
  return entries
    .filter((entry) => entry.name.trim())
    .map((entry) => {
      const model: ModelAlias = { name: entry.name.trim() };
      const alias = entry.alias.trim();
      if (alias && alias !== model.name) {
        model.alias = alias;
      }
      return model;
    });
};

import type { ModelAlias } from '@/types';

