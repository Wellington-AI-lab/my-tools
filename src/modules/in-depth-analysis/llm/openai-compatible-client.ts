/**
 * OpenAI-Compatible LLM Client (Re-export)
 *
 * This module now re-exports from the shared lib/llm for better modularity.
 * @deprecated Import from @/lib/llm/openai-client instead
 */

export type { OpenAIChatMessage } from '@/lib/llm/openai-client';
export { openAICompatibleChatCompletion } from '@/lib/llm/openai-client';


