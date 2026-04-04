/**
 * src/utils/errors.ts
 *
 * Typed error classes for polybridge-mcp.
 *
 * Why typed errors ?
 * ------------------
 * JavaScript has one built-in error class : Error. When you catch an error,
 * you have no way to know what kind of error it is without reading the message
 * string — which is fragile and hard to test.
 *
 * Typed errors solve this with the `instanceof` operator :
 *
 *   try {
 *     await blenderBridge.executeTool(...)
 *   } catch (err) {
 *     if (err instanceof BridgeConnectionError) {
 *       // Handle connection failure specifically
 *     } else if (err instanceof ToolNotFoundError) {
 *       // Handle missing tool specifically
 *     } else {
 *       throw err // Re-throw unknown errors
 *     }
 *   }
 *
 * Each error class also carries structured metadata (bridge name, tool name,
 * etc.) that can be used in PTL log messages and in test assertions.
 *
 * Extending Error :
 * -----------------
 * All custom errors extend the built-in Error class. The `super(message)`
 * call sets the `message` property. We also set `this.name` explicitly so
 * that `error.toString()` returns "BridgeConnectionError: ..." instead of
 * "Error: ...".
 *
 * The `Object.setPrototypeOf` call is a TypeScript quirk required when
 * extending built-in classes with `target: ES5` or older. It is safe to
 * include even when targeting ES2022+.
 */

import type { BridgeName } from '../types/index.js'

// ---------------------------------------------------------------------------
// Base class
// ---------------------------------------------------------------------------

/**
 * Base class for all polybridge-mcp errors.
 * Adds a `code` field for programmatic error handling.
 */
export class PolybridgeError extends Error {
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'PolybridgeError'
    this.code = code
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

// ---------------------------------------------------------------------------
// Configuration errors
// ---------------------------------------------------------------------------

/**
 * Thrown when the configuration file is missing, unreadable, or fails
 * Zod validation.
 */
export class ConfigError extends PolybridgeError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR')
    this.name = 'ConfigError'
  }
}

// ---------------------------------------------------------------------------
// Bridge errors
// ---------------------------------------------------------------------------

/**
 * Thrown when a bridge fails to connect to its external service during init().
 * The `bridge` field identifies which bridge failed.
 */
export class BridgeConnectionError extends PolybridgeError {
  readonly bridge: BridgeName

  constructor(bridge: BridgeName, message: string) {
    super(`[${bridge}] Connection failed : ${message}`, 'BRIDGE_CONNECTION_ERROR')
    this.name   = 'BridgeConnectionError'
    this.bridge = bridge
  }
}

/**
 * Thrown when a tool call is received for a bridge that is not connected
 * or is disabled.
 */
export class BridgeNotReadyError extends PolybridgeError {
  readonly bridge: BridgeName

  constructor(bridge: BridgeName, status: string) {
    super(`[${bridge}] Bridge is not ready (status : ${status})`, 'BRIDGE_NOT_READY')
    this.name   = 'BridgeNotReadyError'
    this.bridge = bridge
  }
}

// ---------------------------------------------------------------------------
// Tool errors
// ---------------------------------------------------------------------------

/**
 * Thrown when the router receives a tool call for a name that is not
 * registered in the ToolRegistry.
 */
export class ToolNotFoundError extends PolybridgeError {
  readonly toolName: string

  constructor(toolName: string) {
    super(`Tool "${toolName}" is not registered.`, 'TOOL_NOT_FOUND')
    this.name     = 'ToolNotFoundError'
    this.toolName = toolName
  }
}

/**
 * Thrown when the arguments provided to a tool are invalid or missing
 * required fields.
 */
export class ToolArgumentError extends PolybridgeError {
  readonly toolName: string
  readonly field   : string

  constructor(toolName: string, field: string, reason: string) {
    super(`[${toolName}] Invalid argument "${field}" : ${reason}`, 'TOOL_ARGUMENT_ERROR')
    this.name     = 'ToolArgumentError'
    this.toolName = toolName
    this.field    = field
  }
}

// ---------------------------------------------------------------------------
// External service errors
// ---------------------------------------------------------------------------

/**
 * Thrown when an HTTP call to n8n, Notion, or any other REST-based bridge
 * returns a non-2xx status code.
 */
export class ExternalApiError extends PolybridgeError {
  readonly bridge    : BridgeName
  readonly statusCode: number
  readonly endpoint  : string

  constructor(bridge: BridgeName, endpoint: string, statusCode: number, body: string) {
    super(
      `[${bridge}] API error on ${endpoint} — HTTP ${statusCode} : ${body.slice(0, 200)}`,
      'EXTERNAL_API_ERROR'
    )
    this.name       = 'ExternalApiError'
    this.bridge     = bridge
    this.statusCode = statusCode
    this.endpoint   = endpoint
  }
}

/**
 * Thrown when a request to Blender via WebSocket times out.
 */
export class BlenderTimeoutError extends PolybridgeError {
  readonly command  : string
  readonly timeoutMs: number

  constructor(command: string, timeoutMs: number) {
    super(
      `Blender did not respond to command "${command}" within ${timeoutMs}ms. ` +
      `Is Blender running with the polybridge addon active ?`,
      'BLENDER_TIMEOUT'
    )
    this.name      = 'BlenderTimeoutError'
    this.command   = command
    this.timeoutMs = timeoutMs
  }
}

// ---------------------------------------------------------------------------
// Security errors
// ---------------------------------------------------------------------------

/**
 * Thrown by the filesystem bridge when a requested path is outside
 * the configured allowedPaths sandbox.
 */
export class PathTraversalError extends PolybridgeError {
  readonly requestedPath: string

  constructor(requestedPath: string) {
    super(
      `Access denied : "${requestedPath}" is outside the allowed directories. ` +
      `Check your allowedPaths configuration.`,
      'PATH_TRAVERSAL_DENIED'
    )
    this.name          = 'PathTraversalError'
    this.requestedPath = requestedPath
  }
}
