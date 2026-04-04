/**
 * examples/programmatic-usage.ts
 *
 * Programmatic usage example — driving polybridge-mcp from TypeScript code.
 *
 * This file shows how to bypass Claude Desktop entirely and build your own
 * application that uses an LLM adapter to call polybridge-mcp tools directly.
 *
 * This is an advanced use case. Most users should start with Claude Desktop
 * and the standard MCP connection (see README.md Quick start section).
 *
 * Run this example :
 *   ANTHROPIC_API_KEY=your-key tsx examples/programmatic-usage.ts
 *
 * What this example does :
 *   1. Creates a ClaudeAdapter with the filesystem bridge tools registered.
 *   2. Sends an instruction to Claude.
 *   3. Claude calls filesystem tools to complete the task.
 *   4. Prints the final response.
 *
 * Note : this example wires the tools manually for simplicity. In a full
 * integration you would import the bridge classes and call executeTool()
 * inside the toolExecutor callback.
 */

import path    from 'path'
import fs      from 'fs/promises'
import { ClaudeAdapter } from '../src/adapters/llm/claude.js'

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

// Create the workspace directory if it doesn't exist.
const WORKSPACE = path.resolve('./workspace')
await fs.mkdir(WORKSPACE, { recursive: true })

// Seed a couple of test files so the LLM has something to work with.
await fs.writeFile(path.join(WORKSPACE, 'notes.txt'),   'Project notes for polybridge-mcp example.')
await fs.writeFile(path.join(WORKSPACE, 'config.json'), JSON.stringify({ env: 'example', version: '1.0' }, null, 2))

// ---------------------------------------------------------------------------
// Create the adapter and register tools
// ---------------------------------------------------------------------------

const adapter = new ClaudeAdapter({
  apiKey      : process.env.ANTHROPIC_API_KEY,
  systemPrompt: 'You are a file management assistant. Use the filesystem tools to help the user.',
})

// Register the filesystem tools that Claude can call.
// The inputSchema here must match the tool definitions in FilesystemBridge.
adapter.registerTools([
  {
    name       : 'fs_list_directory',
    description: 'List all files in a directory.',
    inputSchema: {
      type      : 'object',
      properties: {
        dirPath: { type: 'string', description: 'Path to list.' },
      },
      required: ['dirPath'],
    },
  },
  {
    name       : 'fs_read_file',
    description: 'Read the contents of a file.',
    inputSchema: {
      type      : 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the file.' },
      },
      required: ['filePath'],
    },
  },
  {
    name       : 'fs_write_file',
    description: 'Write content to a file.',
    inputSchema: {
      type      : 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to write.' },
        content : { type: 'string', description: 'Content to write.' },
      },
      required: ['filePath', 'content'],
    },
  },
])

// ---------------------------------------------------------------------------
// Tool executor — this is where tool calls get executed
// ---------------------------------------------------------------------------

/**
 * This callback is called every time Claude decides to use a tool.
 * In this example we implement a simple inline executor using Node.js fs.
 * In a production app you would call the running polybridge-mcp server here.
 */
const toolExecutor = async (toolName: string, args: unknown): Promise<string> => {
  const a = args as Record<string, string>

  switch (toolName) {
    case 'fs_list_directory': {
      const entries = await fs.readdir(a['dirPath']!, { withFileTypes: true })
      return entries.map(e => `${e.isDirectory() ? 'dir' : 'file'}  ${e.name}`).join('\n')
    }

    case 'fs_read_file': {
      return fs.readFile(a['filePath']!, 'utf-8')
    }

    case 'fs_write_file': {
      await fs.writeFile(a['filePath']!, a['content']!)
      return `Written : ${a['filePath']}`
    }

    default:
      return `Unknown tool : ${toolName}`
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log('Sending instruction to Claude...\n')

const response = await adapter.ask(
  `List the files in the "${WORKSPACE}" directory. Read each file and write a 
  summary file called "summary.txt" in the same directory. The summary should 
  list each filename and a one-sentence description of its content.`,
  toolExecutor
)

console.log('Claude responded :\n')
console.log(response)

console.log('\nChecking summary.txt was created...')
const summary = await fs.readFile(path.join(WORKSPACE, 'summary.txt'), 'utf-8').catch(() => null)
if (summary) {
  console.log('\nsummary.txt contents :')
  console.log(summary)
} else {
  console.log('summary.txt was not created — check Claude\'s response above.')
}
