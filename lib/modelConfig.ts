// AI Model Configuration and Fallback System
// Models optimized for logic, calculations, and reasoning at low cost

export interface ModelConfig {
  name: string;
  displayName: string;
  costPer1MInput: number;  // USD
  costPer1MOutput: number; // USD
  contextWindow: number;
  description: string;
}

export const MODELS: ModelConfig[] = [
  {
    name: 'deepseek-chat',
    displayName: 'DeepSeek V3',
    costPer1MInput: 0.28,
    costPer1MOutput: 0.42,
    contextWindow: 128000,
    description: 'Best cost-performance ratio, excellent for complex reasoning and calculations. 29.8x cheaper than GPT-4o.',
  },
  {
    name: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    costPer1MInput: 0.15,
    costPer1MOutput: 0.60,
    contextWindow: 128000,
    description: 'Fast and cost-effective, strong logical reasoning. 16.7x cheaper than GPT-4o while maintaining quality.',
  },
  {
    name: 'Meta-Llama-3.1-70B-Instruct',
    displayName: 'Llama 3.1 70B',
    costPer1MInput: 0.88,
    costPer1MOutput: 0.88,
    contextWindow: 128000,
    description: 'Open-source powerhouse with excellent instruction following and analytical capabilities.',
  },
];

export const PRIMARY_MODEL = MODELS[0];  // DeepSeek V3
export const FALLBACK_MODELS = MODELS.slice(1);  // GPT-4o Mini, Llama 3.1 70B

// Get all models in priority order
export function getModelsInOrder(): ModelConfig[] {
  return MODELS;
}

// Calculate estimated cost for a prediction
export function estimateCost(inputTokens: number, outputTokens: number, model: ModelConfig): number {
  const inputCost = (inputTokens / 1_000_000) * model.costPer1MInput;
  const outputCost = (outputTokens / 1_000_000) * model.costPer1MOutput;
  return inputCost + outputCost;
}
