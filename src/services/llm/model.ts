import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-4.1-mini',
  google: 'gemini-2.5-flash',
};

export function createLanguageModel(
  providerName = import.meta.env.VITE_LLM_PROVIDER || 'anthropic',
  modelName = import.meta.env.VITE_LLM_MODEL || DEFAULT_MODELS[providerName] || DEFAULT_MODELS.anthropic,
): LanguageModel {
  switch (providerName) {
    case 'anthropic':
      return createAnthropic({ apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY })(modelName);
    case 'openai':
      return createOpenAI({ apiKey: import.meta.env.VITE_OPENAI_API_KEY })(modelName);
    case 'google':
      return createGoogleGenerativeAI({ apiKey: import.meta.env.VITE_GOOGLE_API_KEY })(modelName);
    default:
      throw new Error(`Unknown LLM provider: "${providerName}". Supported: anthropic, openai, google`);
  }
}
