/**
 * src/server/router.ts
 *
 * The Request Router.
 *
 * What is a router ?
 * ------------------
 * The router takes an incoming tool call (tool name + arguments) and
 * dispatches it to the correct bridge. It handles :
 *
 *   1. Meta-tool interception (tools that are answered by the server itself)
 *   2. Registry lookup (finding which bridge owns a given tool name)
 *   3. PTL event emission around the dispatch
 *   4. Structured error handling — turning thrown errors into ToolResult objects
 *      so the MCP server can always return a well-formed response to the LLM
 *
 * Why separate the router from the server entry point ?
 * ------------------------------------------------------
 * src/server/index.ts is responsible for the protocol layer (MCP SDK setup,
 * stdio transport, signal handling). If the routing logic also lived there,
 * the file would mix two concerns : protocol and dispatch. Separating them
 * makes both easier to read and test independently.
 *
 * Separation of concerns is a foundational software design principle.
 * The rule is : "each module should be responsible for exactly one thing."
 */

import type { ToolRegistry } from './registry.js'
import type { PtlLogger }    from '../utils/logger.js'
import type { ToolResult }   from '../types/index.js'
import {
  ToolNotFoundError,
  BridgeNotReadyError,
} from '../utils/errors.js'

export class RequestRouter {
  constructor(
    private registry: ToolRegistry,
    private log     : PtlLogger
  ) {}

  /**
   * Route a tool call to the appropriate bridge and return the result.
   *
   * This method never throws. All errors are caught and converted into
   * ToolResult objects with `isError: true` so the MCP server can always
   * return a clean response to the LLM.
   *
   * @param toolName - The name of the tool the LLM wants to call.
   * @param args     - The arguments provided by the LLM.
   * @returns        A ToolResult to send back to the LLM.
   */
  async dispatch(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const startTime = Date.now()

    try {
      // Meta-tools are answered directly by the server without going to a bridge.
      if (this.isMetaTool(toolName)) {
        return this.handleMetaTool(toolName)
      }

      // Look up the bridge in the registry.
      const bridge = this.registry.resolve(toolName)

      if (!bridge) {
        throw new ToolNotFoundError(toolName)
      }

      // Guard against calling a bridge that is not connected.
      if (bridge.status !== 'connected') {
        throw new BridgeNotReadyError(bridge.name, bridge.status)
      }

      this.log.emit({
        timestamp: new Date(),
        level    : 'info',
        phase    : 'routing',
        toolName,
        bridge   : bridge.name,
        message  : `Dispatching to ${bridge.name} bridge`,
      })

      // Delegate to the bridge.
      const result = await bridge.executeTool(toolName, args)

      this.log.emit({
        timestamp : new Date(),
        level     : 'info',
        phase     : 'complete',
        toolName,
        bridge    : bridge.name,
        message   : result.isError ? 'Tool call returned an error result' : 'Tool call succeeded',
        durationMs: Date.now() - startTime,
      })

      return result

    } catch (err) {
      // Convert any thrown error into a ToolResult so the MCP server
      // can return something meaningful to the LLM instead of crashing.
      const message = err instanceof Error ? err.message : String(err)

      this.log.emit({
        timestamp : new Date(),
        level     : 'error',
        phase     : 'error',
        toolName,
        message   : `Unhandled error in tool dispatch : ${message}`,
        durationMs: Date.now() - startTime,
      })

      return {
        content : [{ type: 'text', text: message }],
        isError : true,
      }
    }
  }

  /** Check whether a tool name belongs to the server's meta-tool set. */
  private isMetaTool(toolName: string): boolean {
    return toolName.startsWith('polybridge_')
  }

  /** Handle meta-tools that are answered by the server itself. */
  private handleMetaTool(toolName: string): ToolResult {
    switch (toolName) {
      case 'polybridge_list_bridges':
        return {
          content: [{ type: 'text', text: this.registry.getBridgeStatus() }],
        }

      case 'polybridge_server_info':
        return {
          content: [{
            type: 'text',
            text: [
              'polybridge-mcp — Universal Multi-Bridge MCP Hub',
              `Tools registered : ${this.registry.toolCount}`,
              'Created by Fabien Conéjéro (FC84) — April 2026',
              'License : MIT',
              'Repository : https://github.com/madjeek-web/polybridge-mcp',
            ].join('\n'),
          }],
        }

      default:
        return {
          content : [{ type: 'text', text: `Unknown meta-tool : ${toolName}` }],
          isError : true,
        }
    }
  }
}
