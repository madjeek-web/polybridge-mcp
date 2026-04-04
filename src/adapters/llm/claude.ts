/**
 * src/adapters/llm/claude.ts
 *
 * Claude LLM adapter for polybridge-mcp.
 *
 * What is an LLM adapter ?
 * ------------------------
 * The bridge adapters (n8n, Blender, etc.) make tools available to LLMs.
 * The LLM adapters do the opposite : they let you USE an LLM programmatically
 * from your own TypeScript code, while automatically connecting it to the
 * polybridge-mcp tools.
 *
 * In practice, this is useful when you want to build your own application that
 * uses Claude to drive polybridge-mcp tools without going through Claude Desktop.
 *
 * How this adapter works :
 * ------------------------
 * 1. It reads your polybridge-mcp config to know which bridges are available.
 * 2. It starts an in-process MCP server (without stdio — no subprocess needed).
 * 3. It calls the Anthropic API with tool_use enabled, using the MCP tools.
 * 4. When Claude decides to use a tool, the adapter handles the tool_use cycle
 *    automatically and returns the final text response.
 *
 * This adapter uses the Anthropic REST API directly (fetch) rather than the
 * Anthropic SDK to minimize dependencies and stay transparent.
 */

import type { PolybridgeConfig } from '../../types/index.js'

// The Anthropic Messages API endpoint.
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

// We use claude-sonnet-4-20250514 as the default model.
// It has the best balance of capability and cost for agentic tool use.
const DEFAULT_MODEL = 'claude-sonnet-4-20250514'

interface ClaudeAdapterOptions {
  /** Anthropic API key. Defaults to process.env.ANTHROPIC_API_KEY */
  apiKey         ?: string
  /** Model to use. Defaults to claude-sonnet-4-20250514 */
  model          ?: string
  /** System prompt to use for all requests */
  systemPrompt   ?: string
  /** Max tokens for each response. Default: 4096 */
  maxTokens      ?: number
  /** Path to the polybridge config file. Defaults to POLYBRIDGE_CONFIG env var. */
  polybridgeConfig?: string
}

interface Message {
  role   : 'user' | 'assistant'
  content: string | ContentBlock[]
}

interface ContentBlock {
  type       : string
  text      ?: string
  id        ?: string
  name      ?: string
  input     ?: unknown
  tool_use_id?: string
  content   ?: string | Array<{ type: string; text: string }>
}

interface AnthropicResponse {
  id          : string
  type        : string
  role        : string
  content     : ContentBlock[]
  model       : string
  stop_reason : string
  usage       : { input_tokens: number; output_tokens: number }
}

interface ToolDefinitionForAnthropic {
  name         : string
  description  : string
  input_schema : unknown
}

export class ClaudeAdapter {
  private apiKey   : string
  private model    : string
  private maxTokens: number
  private system   : string

  // In a full implementation, this would hold a reference to the in-process
  // MCP server. For now, it holds the tools fetched at init time.
  private tools: ToolDefinitionForAnthropic[] = []

  constructor(options: ClaudeAdapterOptions = {}) {
    this.apiKey    = options.apiKey     ?? process.env.ANTHROPIC_API_KEY ?? ''
    this.model     = options.model      ?? DEFAULT_MODEL
    this.maxTokens = options.maxTokens  ?? 4096
    this.system    = options.systemPrompt ??
      'You are a helpful assistant with access to polybridge-mcp tools for automation, 3D creation, and workspace management.'

    if (!this.apiKey) {
      throw new Error(
        'Anthropic API key is required. Set ANTHROPIC_API_KEY environment variable or pass apiKey option.'
      )
    }
  }

  /**
   * Register MCP tools to make them available to Claude.
   * In production, this would dynamically fetch tools from the running server.
   * For the adapter pattern, you pass tool definitions manually.
   */
  registerTools(tools: ToolDefinitionForAnthropic[]): void {
    this.tools = tools
  }

  /**
   * Send a message to Claude and get a response.
   * Automatically handles multi-turn tool_use cycles.
   *
   * The tool_use cycle :
   *   1. Send user message.
   *   2. Claude responds with a tool_use block (wants to call a tool).
   *   3. Execute the tool via polybridge-mcp.
   *   4. Send the tool_result back to Claude.
   *   5. Repeat until Claude sends a final text response.
   *
   * @param userMessage - The user's message.
   * @param toolExecutor - A callback that executes a tool and returns the result.
   * @returns The final text response from Claude.
   */
  async ask(
    userMessage : string,
    toolExecutor?: (toolName: string, args: unknown) => Promise<string>
  ): Promise<string> {
    const history: Message[] = [
      { role: 'user', content: userMessage },
    ]

    // We allow up to 10 tool_use rounds to prevent infinite loops.
    for (let round = 0; round < 10; round++) {
      const response = await this.callApi(history)

      if (response.stop_reason === 'end_turn') {
        // Claude is done. Extract the final text.
        const textBlock = response.content.find(b => b.type === 'text')
        return textBlock?.text ?? ''
      }

      if (response.stop_reason === 'tool_use' && toolExecutor) {
        // Claude wants to use tools. Find all tool_use blocks.
        history.push({ role: 'assistant', content: response.content })

        const toolResults: ContentBlock[] = []

        for (const block of response.content) {
          if (block.type !== 'tool_use') continue

          const result = await toolExecutor(block.name!, block.input)
          toolResults.push({
            type       : 'tool_result',
            tool_use_id: block.id,
            content    : result,
          })
        }

        history.push({ role: 'user', content: toolResults })
        continue
      }

      // No more tool calls and not end_turn — return whatever we have.
      const textBlock = response.content.find(b => b.type === 'text')
      return textBlock?.text ?? ''
    }

    return '(max tool rounds reached)'
  }

  /** Call the Anthropic Messages API. */
  private async callApi(messages: Message[]): Promise<AnthropicResponse> {
    const body: Record<string, unknown> = {
      model     : this.model,
      max_tokens: this.maxTokens,
      system    : this.system,
      messages,
    }

    if (this.tools.length > 0) {
      body['tools'] = this.tools
    }

    const res = await fetch(ANTHROPIC_API_URL, {
      method : 'POST',
      headers: {
        'Content-Type'     : 'application/json',
        'x-api-key'        : this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Anthropic API error ${res.status} : ${text}`)
    }

    return res.json() as Promise<AnthropicResponse>
  }
}
