# LLM adapters

The LLM adapters let you drive polybridge-mcp programmatically from TypeScript
code, without going through Claude Desktop or another MCP client.

This is useful when you want to build your own application on top of
polybridge-mcp.

---

## Available adapters

| Adapter class | LLM provider | API key env var |
|---|---|---|
| `ClaudeAdapter` | Anthropic Claude | `ANTHROPIC_API_KEY` |
| `OpenAIAdapter` | OpenAI GPT | `OPENAI_API_KEY` |
| `GeminiAdapter` | Google Gemini | `GEMINI_API_KEY` |
| `OllamaAdapter` | Ollama (local) | none — no API key needed |

---

## Basic usage

```typescript
import { ClaudeAdapter } from 'polybridge-mcp/adapters'

const adapter = new ClaudeAdapter({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Register the tools you want the LLM to use.
// In production, fetch these from the running polybridge-mcp server.
adapter.registerTools([
  {
    name       : 'fs_read_file',
    description: 'Read a file from the workspace',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to read' }
      },
      required: ['filePath']
    }
  }
])

// Create a tool executor that calls polybridge-mcp.
// This example shows the concept — wire it to your running server.
const toolExecutor = async (name: string, args: unknown): Promise<string> => {
  // In a real application, this would call the polybridge-mcp server's
  // executeTool() method or the MCP protocol directly.
  console.log(`Executing tool : ${name}`, args)
  return 'tool result here'
}

const response = await adapter.ask(
  'Read the file workspace/readme.txt and summarize it.',
  toolExecutor
)

console.log(response)
```

---

## Using Ollama (no API key)

```typescript
import { OllamaAdapter } from 'polybridge-mcp/adapters'

// Make sure Ollama is running : ollama serve
// And the model is pulled : ollama pull llama3.2
const adapter = new OllamaAdapter({
  model: 'llama3.2',
})

const alive = await adapter.ping()
if (!alive) {
  console.error('Ollama is not running. Start it with: ollama serve')
  process.exit(1)
}

const response = await adapter.ask('List the files in my workspace.', toolExecutor)
console.log(response)
```

---

## Tool_use cycle explained

All four adapters implement the same multi-turn tool_use cycle :

```
1. Send user message to LLM.
2. LLM responds with a tool_call (wants to use a tool).
3. Adapter calls toolExecutor(toolName, args).
4. toolExecutor calls polybridge-mcp and returns the result.
5. Adapter sends the result back to the LLM.
6. LLM processes the result and either:
   a. Calls another tool (go back to step 2), or
   b. Returns a final text response (done).
```

The adapters handle this loop automatically. You only need to provide the
`toolExecutor` callback.
