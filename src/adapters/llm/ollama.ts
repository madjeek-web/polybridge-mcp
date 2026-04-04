/**
 * src/adapters/llm/ollama.ts
 *
 * Ollama LLM adapter for polybridge-mcp.
 *
 * What is Ollama ?
 * ----------------
 * Ollama is a free, open-source application that lets you run large language
 * models locally on your own machine — no cloud API key needed, no data sent
 * to external servers. It supports Llama 3, Mistral, Gemma, Phi, Qwen, and
 * many others.
 *
 * Install Ollama from : https://ollama.com
 * Then pull a model : ollama pull llama3.2
 *
 * Why use a local model with polybridge-mcp ?
 * -------------------------------------------
 * - Privacy : your instructions and tool results stay on your machine.
 * - Cost : zero API fees.
 * - Offline : works without an internet connection.
 * - Classrooms : students can run full LLM + tool integrations on a laptop.
 *
 * Limitations :
 * -------------
 * Local models are generally less capable than frontier models (Claude, GPT-4)
 * at complex multi-step tool use. Results depend heavily on the model chosen.
 * For learning purposes, llama3.2:3b or mistral:7b are good starting points.
 *
 * Ollama API :
 * ------------
 * Ollama exposes an OpenAI-compatible API at http://localhost:11434/v1/.
 * This adapter uses that endpoint, so it works almost identically to the
 * OpenAI adapter. The only differences are the base URL and the model names.
 */

const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434'
const OLLAMA_DEFAULT_MODEL    = 'llama3.2'

interface OllamaAdapterOptions {
  /** Ollama base URL. Default: http://localhost:11434 */
  baseUrl     ?: string
  /** Model name as known to Ollama (e.g., "llama3.2", "mistral"). Default: llama3.2 */
  model       ?: string
  systemPrompt?: string
  maxTokens   ?: number
}

interface OllamaMessage {
  role       : 'system' | 'user' | 'assistant' | 'tool'
  content    : string | null
  tool_calls?: Array<{
    id      : string
    type    : 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

interface OllamaResponse {
  choices: Array<{
    message     : OllamaMessage
    finish_reason: string
  }>
}

export class OllamaAdapter {
  private baseUrl  : string
  private model    : string
  private maxTokens: number
  private system   : string
  private tools    : unknown[] = []

  constructor(options: OllamaAdapterOptions = {}) {
    this.baseUrl   = (options.baseUrl ?? OLLAMA_DEFAULT_BASE_URL).replace(/\/$/, '')
    this.model     = options.model      ?? OLLAMA_DEFAULT_MODEL
    this.maxTokens = options.maxTokens  ?? 2048
    this.system    = options.systemPrompt ??
      'You are a helpful assistant. Use the available tools to complete the user\'s request.'
  }

  /**
   * Check that Ollama is running and the requested model is available.
   * Call this before ask() to give a clear error early.
   */
  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`)
      return res.ok
    } catch {
      return false
    }
  }

  registerTools(tools: Array<{ name: string; description: string; inputSchema: unknown }>): void {
    this.tools = tools.map(t => ({
      type    : 'function',
      function: {
        name       : t.name,
        description: t.description,
        parameters : t.inputSchema,
      },
    }))
  }

  /**
   * Send a message to the local Ollama model.
   * Uses the OpenAI-compatible endpoint that Ollama exposes at /v1/chat/completions.
   */
  async ask(
    userMessage : string,
    toolExecutor?: (toolName: string, args: unknown) => Promise<string>
  ): Promise<string> {
    // Verify Ollama is running.
    const alive = await this.ping()
    if (!alive) {
      throw new Error(
        `Ollama is not running at ${this.baseUrl}. ` +
        `Install it from https://ollama.com and start it with "ollama serve".`
      )
    }

    const history: OllamaMessage[] = [
      { role: 'system', content: this.system },
      { role: 'user',   content: userMessage },
    ]

    for (let round = 0; round < 10; round++) {
      const response = await this.callApi(history)
      const message  = response.choices[0]!.message
      const reason   = response.choices[0]!.finish_reason

      history.push(message)

      if (reason === 'stop' || reason === 'end_turn') {
        return message.content ?? ''
      }

      if (message.tool_calls && toolExecutor) {
        for (const call of message.tool_calls) {
          const args   = JSON.parse(call.function.arguments) as unknown
          const result = await toolExecutor(call.function.name, args)

          history.push({
            role        : 'tool',
            tool_call_id: call.id,
            content     : result,
          })
        }
        continue
      }

      return message.content ?? ''
    }

    return '(max rounds reached)'
  }

  private async callApi(messages: OllamaMessage[]): Promise<OllamaResponse> {
    // Ollama's OpenAI-compatible endpoint.
    const url = `${this.baseUrl}/v1/chat/completions`

    const body: Record<string, unknown> = {
      model     : this.model,
      max_tokens: this.maxTokens,
      messages,
      stream    : false,
    }

    if (this.tools.length > 0) {
      body['tools'] = this.tools
    }

    const res = await fetch(url, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Ollama API error ${res.status} : ${text}`)
    }

    return res.json() as Promise<OllamaResponse>
  }
}
