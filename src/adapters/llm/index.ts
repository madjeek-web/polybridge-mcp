/**
 * src/adapters/llm/index.ts
 *
 * Barrel export for all LLM adapters.
 * Lets consumers import from a single path :
 *
 *   import { ClaudeAdapter, OpenAIAdapter } from 'polybridge-mcp/adapters'
 */

export { ClaudeAdapter }  from './claude.js'
export { OpenAIAdapter }  from './openai.js'
export { GeminiAdapter }  from './gemini.js'
export { OllamaAdapter }  from './ollama.js'
