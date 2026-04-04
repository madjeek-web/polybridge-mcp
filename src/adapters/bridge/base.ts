/**
 * src/adapters/bridge/base.ts
 *
 * Abstract base class that every bridge must extend.
 *
 * What is a bridge ?
 * ------------------
 * A bridge is a plugin that connects polybridge-mcp to one external tool.
 * The n8n bridge connects to n8n. The Blender bridge connects to Blender.
 * Each bridge exposes a list of "tools" that the LLM can call.
 *
 * Why use an abstract class ?
 * ---------------------------
 * An abstract class defines a contract : "any class that extends me MUST
 * implement these methods". This gives the server a guarantee that every
 * bridge can be treated the same way, regardless of what it connects to.
 *
 * Without this contract, the server would need to know the specific internals
 * of each bridge. With the abstract class, the server only talks to the
 * BaseBridge interface and the bridges take care of their own implementation.
 *
 * This design pattern is called the "Strategy Pattern" in software engineering.
 */

import type {
  BridgeName,
  BridgeStatus,
  ToolDefinition,
  ToolResult,
  PolybridgeConfig,
} from '../../types/index.js'

import type { PtlLogger } from '../../utils/logger.js'

export abstract class BaseBridge {
  /**
   * The unique identifier for this bridge.
   * Must match a value in the BridgeName union type.
   */
  abstract readonly name: BridgeName

  /**
   * A one-sentence description of what this bridge connects to.
   * Used in startup logs and in the `polybridge_list_bridges` meta-tool.
   */
  abstract readonly description: string

  /** Current connection status. Bridges update this as they connect/disconnect. */
  protected _status: BridgeStatus = 'disconnected'

  get status(): BridgeStatus {
    return this._status
  }

  // Subclasses receive the config and logger through the constructor.
  constructor(
    protected config: PolybridgeConfig,
    protected log   : PtlLogger
  ) {}

  /**
   * Initialize the bridge.
   *
   * This is called once when the server starts up. It should establish
   * connections, verify credentials, and set `_status` to 'connected' or
   * 'error'. It must not throw — catch errors internally and set the status.
   *
   * The "async" keyword means this function can use "await" inside it, which
   * is important because connecting to external services takes time.
   */
  abstract init(): Promise<void>

  /**
   * Return all MCP tool definitions this bridge exposes.
   *
   * Tools are registered into the global tool registry at startup. The LLM
   * sees all registered tools when it calls `tools/list`.
   */
  abstract getTools(): ToolDefinition[]

  /**
   * Execute a tool call.
   *
   * When the LLM calls a tool that belongs to this bridge, the server routes
   * the call here. The bridge is responsible for talking to its external tool
   * and returning a ToolResult.
   *
   * @param toolName - The name of the tool being called.
   * @param args     - The arguments provided by the LLM (already validated).
   * @returns        A ToolResult to send back to the LLM.
   */
  abstract executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult>

  /**
   * Gracefully disconnect and clean up resources.
   * Called when the server is shutting down.
   */
  async destroy(): Promise<void> {
    this._status = 'disconnected'
  }

  // ---------------------------------------------------------------------------
  // Helpers available to all bridge subclasses
  // ---------------------------------------------------------------------------

  /**
   * Wrap a value in the standard "success" ToolResult shape.
   * Bridges call this at the end of executeTool when everything went well.
   */
  protected ok(text: string): ToolResult {
    return {
      content: [{ type: 'text', text }],
    }
  }

  /**
   * Wrap an error in the standard "error" ToolResult shape.
   * The LLM receives this and can decide how to handle the failure.
   */
  protected fail(message: string): ToolResult {
    return {
      content : [{ type: 'text', text: message }],
      isError : true,
    }
  }

  /**
   * Wrap a base64-encoded image in the standard "image" ToolResult shape.
   * Used by the Blender bridge when returning renders.
   */
  protected image(base64Data: string, mimeType = 'image/png'): ToolResult {
    return {
      content: [{
        type    : 'image',
        data    : base64Data,
        mimeType,
      }],
    }
  }

  /**
   * Check if this bridge is configured and enabled.
   * Convenience method used in init() to skip disabled bridges early.
   */
  protected isEnabled(): boolean {
    const bridgeConfig = (this.config.bridges as Record<string, { enabled: boolean }>)[this.name]
    return bridgeConfig?.enabled === true
  }
}
