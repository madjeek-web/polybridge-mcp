/**
 * src/adapters/llm/gemini.ts
 *
 * Google Gemini LLM adapter for polybridge-mcp.
 *
 * This adapter lets you drive polybridge-mcp tools using Google's Gemini
 * models (gemini-2.0-flash, gemini-2.5-pro, etc.) via the Gemini API.
 *
 * How to get a Gemini API key :
 * -----------------------------
 * Go to https://aistudio.google.com/app/apikey and create a free API key.
 * Set it as an environment variable : GEMINI_API_KEY=your-key
 *
 * How Gemini tool use differs from Claude and OpenAI :
 * -----------------------------------------------------
 * Gemini uses a slightly different schema :
 *   - Tools are wrapped in a `functionDeclarations` array inside a `tools` object.
 *   - Tool calls come as `functionCall` parts inside the model's response.
 *   - Tool results are sent as `functionResponse` parts with `role: "function"`.
 *
 * API reference :
 *   https://ai.google.dev/gemini-api/docs/function-calling
 */

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_MODEL   = 'gemini-2.0-flash'

interface GeminiAdapterOptions {
  apiKey      ?: string
  model       ?: string
  systemPrompt?: string
  maxTokens   ?: number
}

interface GeminiPart {
  text            ?: string
  functionCall    ?: { name: string; args: unknown }
  functionResponse?: { name: string; response: { result: string } }
}

interface GeminiContent {
  role : 'user' | 'model' | 'function'
  parts: GeminiPart[]
}

interface GeminiFunctionDeclaration {
  name       : string
  description: string
  parameters : unknown
}

interface GeminiResponse {
  candidates: Array<{
    content      : GeminiContent
    finishReason : string
  }>
}

export class GeminiAdapter {
  private apiKey   : string
  private model    : string
  private maxTokens: number
  private system   : string
  private tools    : GeminiFunctionDeclaration[] = []

  constructor(options: GeminiAdapterOptions = {}) {
    this.apiKey    = options.apiKey     ?? process.env.GEMINI_API_KEY ?? ''
    this.model     = options.model      ?? DEFAULT_MODEL
    this.maxTokens = options.maxTokens  ?? 4096
    this.system    = options.systemPrompt ??
      'You are a helpful assistant with access to polybridge-mcp tools.'

    if (!this.apiKey) {
      throw new Error(
        'Gemini API key is required. Set GEMINI_API_KEY environment variable or pass apiKey option.'
      )
    }
  }

  registerTools(tools: Array<{ name: string; description: string; inputSchema: unknown }>): void {
    this.tools = tools.map(t => ({
      name       : t.name,
      description: t.description,
      parameters : t.inputSchema,
    }))
  }

  async ask(
    userMessage : string,
    toolExecutor?: (toolName: string, args: unknown) => Promise<string>
  ): Promise<string> {
    const history: GeminiContent[] = [
      { role: 'user', parts: [{ text: userMessage }] },
    ]

    for (let round = 0; round < 10; round++) {
      const response   = await this.callApi(history)
      const candidate  = response.candidates[0]!
      const content    = candidate.content
      const reason     = candidate.finishReason

      history.push(content)

      if (reason === 'STOP') {
        const textPart = content.parts.find(p => p.text)
        return textPart?.text ?? ''
      }

      // Gemini signals a function call differently from other providers.
      const functionCallParts = content.parts.filter(p => p.functionCall)

      if (functionCallParts.length > 0 && toolExecutor) {
        const responseParts: GeminiPart[] = []

        for (const part of functionCallParts) {
          const call   = part.functionCall!
          const result = await toolExecutor(call.name, call.args)

          responseParts.push({
            functionResponse: {
              name    : call.name,
              response: { result },
            },
          })
        }

        // Gemini function responses use the role "function".
        history.push({ role: 'function', parts: responseParts })
        continue
      }

      const textPart = content.parts.find(p => p.text)
      return textPart?.text ?? ''
    }

    return '(max rounds reached)'
  }

  private async callApi(contents: GeminiContent[]): Promise<GeminiResponse> {
    const url = `${GEMINI_BASE_URL}/models/${this.model}:generateContent?key=${this.apiKey}`

    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: this.system }] },
      contents,
      generationConfig : { maxOutputTokens: this.maxTokens },
    }

    if (this.tools.length > 0) {
      body['tools'] = [{ functionDeclarations: this.tools }]
    }

    const res = await fetch(url, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Gemini API error ${res.status} : ${text}`)
    }

    return res.json() as Promise<GeminiResponse>
  }
}
