/**
 * src/types/index.ts
 *
 * Central type definitions for polybridge-mcp.
 *
 * All data shapes that flow between the server, bridges, and adapters are
 * defined here. Keeping types in one place prevents the kind of drift that
 * makes large TypeScript projects hard to maintain.
 *
 * If you are new to TypeScript :
 *   - "interface" describes the shape of an object.
 *   - "type" is similar but also works for unions and primitives.
 *   - "enum" is a named set of constants.
 */

// ---------------------------------------------------------------------------
// Bridge types
// ---------------------------------------------------------------------------

/**
 * The canonical identifier for each available bridge.
 * Adding a new bridge requires adding its name here first.
 */
export type BridgeName = 'n8n' | 'blender' | 'notion' | 'filesystem'

/**
 * Every bridge has a current connection state.
 * The server reports this state in startup logs and via the meta-tool
 * `polybridge_list_bridges`.
 */
export type BridgeStatus = 'connected' | 'disconnected' | 'error' | 'disabled'

/**
 * A MCP "tool" is a function that an LLM can call by name.
 * This interface mirrors the MCP specification's tool definition shape,
 * plus metadata used by the PTL (Pedagogical Transparency Layer).
 */
export interface ToolDefinition {
  /** Unique tool name, format : {bridge}_{action} */
  name       : string
  /** Short description shown to the LLM when it lists available tools */
  description: string
  /** JSON Schema object describing the tool's input arguments */
  inputSchema: {
    type      : 'object'
    properties: Record<string, SchemaProperty>
    required  ?: string[]
  }
  /** Which bridge owns this tool */
  bridge: BridgeName
  /**
   * A plain-English explanation of what this tool does, used by the PTL
   * to generate human-readable logs.
   */
  pedagogicalSummary: string
}

/**
 * A single property inside a JSON Schema object.
 * This covers the most common cases; extend it if your bridge needs
 * array or nested-object properties.
 */
export interface SchemaProperty {
  type       : 'string' | 'number' | 'boolean' | 'object' | 'array'
  description: string
  enum       ?: string[]
  default    ?: unknown
  minimum    ?: number
  maximum    ?: number
}

/**
 * The result of executing a tool.
 * The MCP protocol requires this shape when returning results to the LLM.
 */
export interface ToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource'
    text?: string
    data?: string       // base64 image data
    mimeType?: string
  }>
  isError?: boolean
}

// ---------------------------------------------------------------------------
// PTL (Pedagogical Transparency Layer) types
// ---------------------------------------------------------------------------

/**
 * A single PTL event, emitted every time something notable happens inside
 * the server. The PTL logger collects these and formats them for output.
 */
export interface PtlEvent {
  timestamp  : Date
  level      : PtlLevel
  phase      : PtlPhase
  toolName  ?: string
  bridge    ?: BridgeName
  message    : string
  data      ?: unknown
  durationMs?: number
}

export type PtlLevel = 'info' | 'warn' | 'error' | 'debug'

/**
 * Each phase maps to a step in the lifecycle of a tool call.
 * This granularity lets teachers pause and explain each step.
 */
export type PtlPhase =
  | 'incoming_request'  // LLM has called a tool
  | 'routing'           // Server is deciding which bridge handles it
  | 'bridge_dispatch'   // The bridge has received the call
  | 'external_call'     // The bridge is calling the external tool (n8n, Blender...)
  | 'external_response' // The external tool responded
  | 'result_format'     // Building the result to return to the LLM
  | 'complete'          // Tool call is fully done
  | 'error'             // Something went wrong

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

/**
 * Root configuration shape, matching polybridge-mcp.config.example.json.
 * Zod (src/utils/config.ts) validates the actual JSON file against this.
 */
export interface PolybridgeConfig {
  server: {
    name    : string
    version : string
    pedagogy: PedagogyConfig
  }
  bridges: {
    n8n        : N8nBridgeConfig
    blender    : BlenderBridgeConfig
    notion     : NotionBridgeConfig
    filesystem : FilesystemBridgeConfig
  }
}

export interface PedagogyConfig {
  enabled    : boolean
  verbosity  : 'silent' | 'normal' | 'verbose' | 'debug'
  logFile    : string | null
}

export interface N8nBridgeConfig {
  enabled : boolean
  baseUrl : string
  apiKey  : string
}

export interface BlenderBridgeConfig {
  enabled: boolean
  wsPort : number
}

export interface NotionBridgeConfig {
  enabled: boolean
  apiKey : string
}

export interface FilesystemBridgeConfig {
  enabled     : boolean
  allowedPaths: string[]
  allowWrite  : boolean
  allowDelete : boolean
}

// ---------------------------------------------------------------------------
// n8n-specific types
// ---------------------------------------------------------------------------

/** Minimal representation of an n8n workflow returned by the API */
export interface N8nWorkflow {
  id       : string
  name     : string
  active   : boolean
  createdAt: string
  updatedAt: string
  tags     : string[]
}

/** Result of an n8n workflow execution */
export interface N8nExecution {
  id        : string
  workflowId: string
  status    : 'success' | 'error' | 'running' | 'waiting'
  startedAt : string
  stoppedAt : string | null
  data      : unknown
}

// ---------------------------------------------------------------------------
// Blender-specific types
// ---------------------------------------------------------------------------

/** All object types Blender can create */
export type BlenderObjectType = 'MESH' | 'CURVE' | 'LIGHT' | 'CAMERA' | 'EMPTY'

/** Mesh sub-types when objectType is MESH */
export type BlenderMeshType =
  | 'CUBE' | 'SPHERE' | 'CYLINDER' | 'CONE' | 'PLANE'
  | 'TORUS' | 'MONKEY' | 'UV_SPHERE' | 'ICO_SPHERE'

/** A 3D vector [x, y, z] */
export type Vec3 = [number, number, number]

/** Command payload sent to the Blender WebSocket server */
export interface BlenderCommand {
  command: string
  args   : Record<string, unknown>
  reqId  : string
}

/** Response from the Blender WebSocket server */
export interface BlenderResponse {
  reqId  : string
  success: boolean
  data   : unknown
  error ?: string
}
