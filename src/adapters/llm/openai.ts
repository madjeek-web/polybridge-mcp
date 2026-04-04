/**
 * src/adapters/llm/openai.ts
 *
 * OpenAI LLM adapter for polybridge-mcp.
 *
 * This adapter lets you drive polybridge-mcp tools using OpenAI's GPT models
 * (GPT-4o, GPT-4o-mini, o1, etc.) via the OpenAI Chat Completions API.
 *
 * How OpenAI tool use differs from Claude :
 * ------------------------------------------
 * The overall tool_use cycle is the same : the model returns a message with
 * "tool_calls", you execute those calls, send back "tool" role messages with
 * results, and continue until the model returns a final text response.
 *
 * The schema differences :
 *   - OpenAI wraps tools in a { type: "function", function: { ... } } envelope.
 *   - Tool calls come in a `tool_calls` array inside the assistant message.
 *   - Tool results are submitted as messages with `role: "tool"`.
 *
 * API reference :
 *   https://platform.openai.com/docs/guides/function-calling
 */

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
const DEFAULT_MODEL  = 'gpt-4o'

interface OpenAIAdapterOptions {
  apiKey      ?: string
  model       ?: string
  systemPrompt?: string
  maxTokens   ?: number
}

interface OpenAITool {
  type    : 'function'
  function: {
    name       : string
    description: string
    parameters : unknown
  }
}

interface OpenAIMessage {
  role        : 'system' | 'user' | 'assistant' | 'tool'
  content     : string | null
  tool_calls ?: OpenAIToolCall[]
  tool_call_id?: string
  name       ?: string
}

interface OpenAIToolCall {
  id      : string
  type    : 'function'
  function: {
    name     : string
    arguments: string
  }
}

interface OpenAIResponse {
  choices: Array<{
    message     : OpenAIMessage
    finish_reason: string
  }>
  usage: { prompt_tokens: number; completion_tokens: number }
}

export class OpenAIAdapter {
  private apiKey   : string
  private model    : string
  private maxTokens: number
  private system   : string
  private tools    : OpenAITool[] = []

  constructor(options: OpenAIAdapterOptions = {}) {
    this.apiKey    = options.apiKey     ?? process.env.OPENAI_API_KEY ?? ''
    this.model     = options.model      ?? DEFAULT_MODEL
    this.maxTokens = options.maxTokens  ?? 4096
    this.system    = options.systemPrompt ??
      'You are a helpful assistant with access to polybridge-mcp tools.'

    if (!this.apiKey) {
      throw new Error(
        'OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass apiKey option.'
      )
    }
  }

  /**
   * Register MCP tools in the OpenAI "function calling" format.
   * The MCP tool definitions are wrapped in the { type: "function", function: {...} } envelope.
   */
  registerTools(tools: Array<{ name: string; description: string; inputSchema: unknown }>): void {
    this.tools = tools.map(t => ({
      type    : 'function' as const,
      function: {
        name       : t.name,
        description: t.description,
        parameters : t.inputSchema,
      },
    }))
  }

  /**
   * Send a message to GPT and handle the tool_use cycle automatically.
   *
   * @param userMessage  - The user's message.
   * @param toolExecutor - Callback that executes a tool by name with given arguments.
   */
  async ask(
    userMessage : string,
    toolExecutor?: (toolName: string, args: unknown) => Promise<string>
  ): Promise<string> {
    const history: OpenAIMessage[] = [
      { role: 'system', content: this.system },
      { role: 'user',   content: userMessage },
    ]

    for (let round = 0; round < 10; round++) {
      const response = await this.callApi(history)
      const message  = response.choices[0]!.message
      const reason   = response.choices[0]!.finish_reason

      history.push(message)

      if (reason === 'stop') {
        return message.content ?? ''
      }

      if (reason === 'tool_calls' && message.tool_calls && toolExecutor) {
        // Execute all tool calls in this round.
        for (const call of message.tool_calls) {
          const args   = JSON.parse(call.function.arguments) as unknown
          const result = await toolExecutor(call.function.name, args)

          history.push({
            role        : 'tool',
            tool_call_id: call.id,
            name        : call.function.name,
            content     : result,
          })
        }
        continue
      }

      return message.content ?? ''
    }

    return '(max tool rounds reached)'
  }

  private async callApi(messages: OpenAIMessage[]): Promise<OpenAIResponse> {
    const body: Record<string, unknown> = {
      model     : this.model,
      max_tokens: this.maxTokens,
      messages,
    }

    if (this.tools.length > 0) {
      body['tools'] = this.tools
    }

    const res = await fetch(OPENAI_API_URL, {
      method : 'POST',
      headers: {
        'Content-Type' : 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`OpenAI API error ${res.status} : ${text}`)
    }

    return res.json() as Promise<OpenAIResponse>
  }
}
