/**
 * src/server/registry.ts
 *
 * The Tool Registry.
 *
 * What is a registry ?
 * --------------------
 * The registry is a central catalog of every tool available across all
 * bridges. When the MCP client (the LLM host) asks "what tools do you have ?",
 * the server reads from this registry and returns the full list.
 *
 * It also serves as the lookup table when routing a tool call : "which bridge
 * owns the tool named 'blender_render_scene' ?" → the registry knows.
 *
 * Why not just ask each bridge directly every time ?
 * --------------------------------------------------
 * We could, but a registry pattern has advantages :
 *   - Single source of truth for tool names (prevents duplicates)
 *   - Faster lookup (Map vs iterating every bridge)
 *   - Easy to implement meta-tools like `polybridge_list_bridges`
 */

import type { BaseBridge }     from '../adapters/bridge/base.js'
import type { ToolDefinition } from '../types/index.js'
import type { PtlLogger }      from '../utils/logger.js'

export class ToolRegistry {
  // Map from tool name to the bridge that owns it.
  // Example : 'n8n_list_workflows' → N8nBridge instance
  private toolToBridge: Map<string, BaseBridge> = new Map()

  // All tool definitions, in the order they were registered.
  private tools: ToolDefinition[] = []

  // The list of registered bridges, for status reporting.
  private bridges: BaseBridge[] = []

  constructor(private log: PtlLogger) {}

  /**
   * Register all tools from a bridge into the catalog.
   * Called once per bridge during server startup.
   */
  register(bridge: BaseBridge): void {
    this.bridges.push(bridge)

    if (bridge.status === 'disabled') {
      this.log.info('routing', `Bridge "${bridge.name}" is disabled — skipping tool registration`)
      return
    }

    const bridgeTools = bridge.getTools()

    for (const tool of bridgeTools) {
      if (this.toolToBridge.has(tool.name)) {
        // Two bridges registered the same tool name — this is a bug.
        this.log.emit({
          timestamp: new Date(),
          level    : 'warn',
          phase    : 'routing',
          message  : `Duplicate tool name "${tool.name}" — overwriting previous registration`,
        })
      }

      this.toolToBridge.set(tool.name, bridge)
      this.tools.push(tool)
    }

    this.log.info(
      'routing',
      `Bridge "${bridge.name}" registered ${bridgeTools.length} tool(s)`
    )
  }

  /**
   * Also register the built-in meta-tools that describe the server itself.
   * These tools are not tied to any bridge.
   */
  registerMetaTools(): void {
    this.tools.push({
      name       : 'polybridge_list_bridges',
      description: 'List all bridges available in this polybridge-mcp instance with their connection status.',
      inputSchema: {
        type      : 'object',
        properties: {},
      },
      bridge             : 'n8n', // meta-tools don't have a real bridge; this is a placeholder
      pedagogicalSummary : 'Returns internal server state — no external call needed',
    })
  }

  /**
   * Find the bridge responsible for a given tool name.
   * Returns null if the tool is not found.
   */
  resolve(toolName: string): BaseBridge | null {
    return this.toolToBridge.get(toolName) ?? null
  }

  /**
   * Return all registered tool definitions.
   * The MCP server uses this to respond to tools/list requests.
   */
  getAll(): ToolDefinition[] {
    return this.tools
  }

  /**
   * Generate a status summary of all bridges.
   * Used by the polybridge_list_bridges meta-tool.
   */
  getBridgeStatus(): string {
    const lines = this.bridges.map(b => {
      const emoji = {
        connected   : '✓',
        disconnected: '○',
        error       : '✗',
        disabled    : '—',
      }[b.status]
      return `  ${emoji} ${b.name.padEnd(12)} ${b.status} — ${b.description}`
    })

    return `polybridge-mcp bridges :\n\n${lines.join('\n')}`
  }

  /**
   * Return the number of registered tools (excluding meta-tools).
   */
  get toolCount(): number {
    return this.tools.filter(t => !t.name.startsWith('polybridge_')).length
  }
}
