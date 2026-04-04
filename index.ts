/**
 * src/server/index.ts
 *
 * Entry point for polybridge-mcp.
 *
 * This file does four things in order :
 *   1. Load and validate the configuration file.
 *   2. Create the PTL logger.
 *   3. Initialize all bridges (connect to n8n, Blender, etc.).
 *   4. Start the MCP server on stdio and register all tools.
 *
 * MCP stdio transport :
 * ---------------------
 * The MCP protocol can run over different transports (HTTP, WebSocket, stdio).
 * Claude Desktop uses the stdio transport : it spawns this process as a child
 * process and communicates through stdin (for incoming requests) and stdout
 * (for outgoing responses).
 *
 * This is why all PTL output goes to stderr, not stdout. Anything written to
 * stdout is interpreted as a protocol message by the MCP client.
 *
 * The @modelcontextprotocol/sdk package :
 * ----------------------------------------
 * Anthropic publishes an official TypeScript SDK for building MCP servers.
 * It handles all the protocol-level details (JSON-RPC framing, message parsing,
 * error codes) so we can focus on the application logic.
 */

import { Server }               from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

import { loadConfig }   from '../utils/config.js'
import { PtlLogger }    from '../utils/logger.js'
import { ToolRegistry } from './registry.js'
import { N8nBridge }    from '../bridges/n8n/index.js'
import { BlenderBridge }     from '../bridges/blender/index.js'
import { NotionBridge }      from '../bridges/notion/index.js'
import { FilesystemBridge }  from '../bridges/filesystem/index.js'

import type { PolybridgeConfig } from '../types/index.js'

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Step 1 — Load config.
  const config: PolybridgeConfig = loadConfig()

  // Step 2 — Create the PTL logger.
  // The logger is created before bridges so it can be passed to them.
  const log = new PtlLogger(config.server.pedagogy)

  log.emit({
    timestamp: new Date(),
    level    : 'info',
    phase    : 'incoming_request',
    message  : `polybridge-mcp ${config.server.version} starting...`,
  })

  // Step 3 — Initialize bridges.
  // Each bridge gets the full config and the logger.
  const bridges = [
    new N8nBridge(config, log),
    new BlenderBridge(config, log),
    new NotionBridge(config, log),
    new FilesystemBridge(config, log),
  ]

  // Initialize all bridges concurrently. Each bridge handles its own errors
  // internally and sets its status accordingly. We do not stop on failure —
  // a disabled or errored bridge should not prevent others from working.
  await Promise.allSettled(bridges.map(b => b.init()))

  // Step 4 — Build the tool registry.
  const registry = new ToolRegistry(log)

  for (const bridge of bridges) {
    registry.register(bridge)
  }

  registry.registerMetaTools()

  log.emit({
    timestamp: new Date(),
    level    : 'info',
    phase    : 'routing',
    message  : `${registry.toolCount} tools registered across ${bridges.length} bridges`,
  })

  // Step 5 — Create the MCP server.
  // The Server class from the SDK handles the JSON-RPC protocol layer.
  const server = new Server(
    { name: config.server.name, version: config.server.version },
    { capabilities: { tools: {} } }
  )

  // ---------------------------------------------------------------------------
  // tools/list handler
  //
  // Called by the MCP client (LLM host) to discover what tools are available.
  // The SDK calls this handler and sends the result to the client.
  // ---------------------------------------------------------------------------
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    log.emit({
      timestamp: new Date(),
      level    : 'info',
      phase    : 'incoming_request',
      message  : 'LLM requested tool list',
    })

    return {
      tools: registry.getAll().map(t => ({
        name       : t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    }
  })

  // ---------------------------------------------------------------------------
  // tools/call handler
  //
  // Called every time the LLM wants to execute a tool.
  // We look up the bridge in the registry and delegate to it.
  // ---------------------------------------------------------------------------
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name
    const args     = (request.params.arguments ?? {}) as Record<string, unknown>

    const startTime = Date.now()

    log.emit({
      timestamp: new Date(),
      level    : 'info',
      phase    : 'incoming_request',
      toolName,
      message  : 'Tool call received from LLM',
      data     : args,
    })

    // Handle meta-tools first — they are answered directly by the server.
    if (toolName === 'polybridge_list_bridges') {
      return {
        content: [{ type: 'text', text: registry.getBridgeStatus() }],
      }
    }

    // Look up which bridge owns this tool.
    const bridge = registry.resolve(toolName)

    if (!bridge) {
      log.emit({
        timestamp: new Date(),
        level    : 'error',
        phase    : 'error',
        toolName,
        message  : `No bridge found for tool "${toolName}"`,
      })

      return {
        content : [{ type: 'text', text: `Tool "${toolName}" is not registered.` }],
        isError : true,
      }
    }

    log.emit({
      timestamp: new Date(),
      level    : 'info',
      phase    : 'routing',
      toolName,
      bridge   : bridge.name,
      message  : `Routing to ${bridge.name} bridge`,
    })

    // Delegate to the bridge.
    const result = await bridge.executeTool(toolName, args)

    log.emit({
      timestamp : new Date(),
      level     : 'info',
      phase     : 'complete',
      toolName,
      bridge    : bridge.name,
      message   : result.isError ? 'Tool call failed' : 'Tool call succeeded',
      durationMs: Date.now() - startTime,
    })

    return result
  })

  // ---------------------------------------------------------------------------
  // Start the stdio transport
  // ---------------------------------------------------------------------------
  const transport = new StdioServerTransport()

  await server.connect(transport)

  log.emit({
    timestamp: new Date(),
    level    : 'info',
    phase    : 'incoming_request',
    message  : 'polybridge-mcp is ready and listening on stdio',
  })

  // ---------------------------------------------------------------------------
  // Graceful shutdown
  // ---------------------------------------------------------------------------
  // On SIGINT (Ctrl+C) or SIGTERM, close all bridges before exiting.
  const shutdown = async (signal: string) => {
    log.emit({
      timestamp: new Date(),
      level    : 'info',
      phase    : 'incoming_request',
      message  : `Received ${signal}. Shutting down...`,
    })

    await Promise.allSettled(bridges.map(b => b.destroy()))
    log.close()
    process.exit(0)
  }

  process.on('SIGINT',  () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

// Run main and catch any unhandled errors at the top level.
main().catch((err) => {
  process.stderr.write(`[polybridge] Fatal error : ${err}\n`)
  process.exit(1)
})
