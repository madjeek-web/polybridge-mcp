/**
 * src/bridges/blender/index.ts
 *
 * The Blender bridge.
 *
 * How does this bridge work ?
 * ---------------------------
 * Blender ships with a full Python scripting environment. The file
 * `bridges/blender/polybridge_addon.py` is a Blender addon that, when
 * enabled, opens a WebSocket server inside Blender's Python process.
 *
 * This TypeScript bridge connects to that WebSocket server and sends
 * JSON commands. The Python addon receives the commands and executes them
 * as Blender Python API calls (bpy.ops.*).
 *
 * The communication protocol :
 * ----------------------------
 * Every message is a JSON object with this shape :
 *
 *   Sent :    { "command": "create_object", "args": {...}, "reqId": "abc123" }
 *   Received: { "reqId": "abc123", "success": true, "data": {...} }
 *
 * The reqId links responses to requests. This is important because WebSocket
 * is asynchronous — responses can arrive out of order. The reqId ensures we
 * know which response belongs to which request.
 *
 * The ws npm package :
 * --------------------
 * Node.js has a built-in WebSocket client since v22, but we use the `ws`
 * package for broader compatibility with Node 20+.
 */

import { randomUUID } from 'crypto'
import WebSocket      from 'ws'

import { BaseBridge } from '../../adapters/bridge/base.js'

import type {
  BridgeName,
  ToolDefinition,
  ToolResult,
  BlenderCommand,
  BlenderResponse,
  Vec3,
} from '../../types/index.js'

// How long to wait for a response from Blender before giving up (ms).
const REQUEST_TIMEOUT_MS = 15_000

export class BlenderBridge extends BaseBridge {
  readonly name       : BridgeName = 'blender'
  readonly description: string     = 'Controls Blender via WebSocket for 3D object creation and rendering'

  private ws         : WebSocket | null = null
  private wsPort     = 9877
  // Pending requests, keyed by reqId. Each entry is a resolver/rejecter pair.
  private pending    : Map<string, { resolve: (r: BlenderResponse) => void; reject: (e: Error) => void }> = new Map()

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async init(): Promise<void> {
    if (!this.isEnabled()) {
      this._status = 'disabled'
      this.log.info('bridge_dispatch', 'Blender bridge is disabled in config')
      return
    }

    this.wsPort = this.config.bridges.blender.wsPort

    try {
      await this.connect()
      this._status = 'connected'
      this.log.info('bridge_dispatch', `Blender bridge connected on ws://localhost:${this.wsPort}`)
    } catch (err) {
      this._status = 'error'
      this.log.error(
        `Blender bridge could not connect on port ${this.wsPort}. ` +
        `Is Blender running with the polybridge addon enabled ?`,
        err
      )
    }
  }

  async destroy(): Promise<void> {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    await super.destroy()
  }

  // ---------------------------------------------------------------------------
  // Tool definitions
  // ---------------------------------------------------------------------------

  getTools(): ToolDefinition[] {
    return [
      {
        name       : 'blender_create_object',
        description: 'Create a new 3D object in the current Blender scene.',
        inputSchema: {
          type      : 'object',
          properties: {
            objectType: {
              type       : 'string',
              enum       : ['MESH', 'CURVE', 'LIGHT', 'CAMERA', 'EMPTY'],
              description: 'The type of object to create.',
            },
            meshType: {
              type       : 'string',
              enum       : ['CUBE', 'SPHERE', 'CYLINDER', 'CONE', 'PLANE', 'TORUS', 'UV_SPHERE', 'ICO_SPHERE'],
              description: 'The mesh shape, only used when objectType is MESH.',
              default    : 'CUBE',
            },
            name: {
              type       : 'string',
              description: 'Name of the new object in Blender.',
            },
            location: {
              type       : 'array',
              description: 'Position in 3D space as [x, y, z]. Default is [0, 0, 0].',
            },
            scale: {
              type       : 'array',
              description: 'Scale on each axis as [x, y, z]. Default is [1, 1, 1].',
            },
          },
          required: ['objectType', 'name'],
        },
        bridge             : 'blender',
        pedagogicalSummary : 'Sends a create_object command over WebSocket to the Blender Python addon',
      },
      {
        name       : 'blender_apply_material',
        description: 'Apply a material (color and basic surface properties) to an existing object.',
        inputSchema: {
          type      : 'object',
          properties: {
            objectName: {
              type       : 'string',
              description: 'Name of the object to apply the material to.',
            },
            materialName: {
              type       : 'string',
              description: 'Name for the new material.',
            },
            color: {
              type       : 'array',
              description: 'RGBA color as [r, g, b, a] where each value is between 0 and 1.',
            },
            metallic: {
              type       : 'number',
              description: 'Metallic factor 0.0 (plastic) to 1.0 (metal). Default: 0.',
              default    : 0,
            },
            roughness: {
              type       : 'number',
              description: 'Roughness factor 0.0 (mirror) to 1.0 (matte). Default: 0.5.',
              default    : 0.5,
            },
          },
          required: ['objectName', 'materialName', 'color'],
        },
        bridge             : 'blender',
        pedagogicalSummary : 'Sends an apply_material command to set PBR properties on an object',
      },
      {
        name       : 'blender_render_scene',
        description: 'Render the current Blender scene and return the result as a base64 PNG image.',
        inputSchema: {
          type      : 'object',
          properties: {
            width: {
              type       : 'number',
              description: 'Render width in pixels. Default: 800.',
              default    : 800,
            },
            height: {
              type       : 'number',
              description: 'Render height in pixels. Default: 600.',
              default    : 600,
            },
            samples: {
              type       : 'number',
              description: 'Number of render samples. More samples = better quality, slower render. Default: 64.',
              default    : 64,
            },
          },
        },
        bridge             : 'blender',
        pedagogicalSummary : 'Sends a render_scene command and returns the image as base64',
      },
      {
        name       : 'blender_execute_script',
        description: 'Execute an arbitrary Blender Python script. Use for advanced operations not covered by other tools.',
        inputSchema: {
          type      : 'object',
          properties: {
            script: {
              type       : 'string',
              description: 'Valid Blender Python (bpy) script to execute.',
            },
          },
          required: ['script'],
        },
        bridge             : 'blender',
        pedagogicalSummary : 'Sends an exec_script command — use carefully, scripts run with full Blender privileges',
      },
      {
        name       : 'blender_list_objects',
        description: 'Return a list of all objects currently in the Blender scene.',
        inputSchema: {
          type      : 'object',
          properties: {},
        },
        bridge             : 'blender',
        pedagogicalSummary : 'Sends a list_objects command to enumerate scene contents',
      },
    ]
  }

  // ---------------------------------------------------------------------------
  // Tool execution
  // ---------------------------------------------------------------------------

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (this._status !== 'connected') {
      return this.fail(
        `Blender bridge is not connected (status: ${this._status}). ` +
        `Make sure Blender is open with the polybridge addon running.`
      )
    }

    this.log.emit({
      timestamp: new Date(),
      level    : 'info',
      phase    : 'bridge_dispatch',
      bridge   : 'blender',
      toolName,
      message  : `Dispatching to Blender WebSocket`,
      data     : args,
    })

    try {
      switch (toolName) {
        case 'blender_create_object':    return await this.createObject(args)
        case 'blender_apply_material':   return await this.applyMaterial(args)
        case 'blender_render_scene':     return await this.renderScene(args)
        case 'blender_execute_script':   return await this.executeScript(args)
        case 'blender_list_objects':     return await this.listObjects()
        default:
          return this.fail(`Unknown Blender tool : ${toolName}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return this.fail(`Blender error : ${msg}`)
    }
  }

  // ---------------------------------------------------------------------------
  // Individual tool handlers
  // ---------------------------------------------------------------------------

  private async createObject(args: Record<string, unknown>): Promise<ToolResult> {
    const response = await this.send('create_object', {
      object_type: args['objectType'],
      mesh_type  : args['meshType'] ?? 'CUBE',
      name       : args['name'],
      location   : (args['location'] as Vec3) ?? [0, 0, 0],
      scale      : (args['scale'] as Vec3) ?? [1, 1, 1],
    })

    return this.ok(
      `Object "${args['name']}" created successfully.\n` +
      `Type: ${args['objectType']} / ${args['meshType'] ?? 'default'}\n` +
      `Location: ${JSON.stringify(args['location'] ?? [0,0,0])}\n` +
      `Internal ID: ${JSON.stringify(response.data)}`
    )
  }

  private async applyMaterial(args: Record<string, unknown>): Promise<ToolResult> {
    const response = await this.send('apply_material', {
      object_name  : args['objectName'],
      material_name: args['materialName'],
      color        : args['color'],
      metallic     : args['metallic'] ?? 0,
      roughness    : args['roughness'] ?? 0.5,
    })

    return this.ok(
      `Material "${args['materialName']}" applied to "${args['objectName']}".\n` +
      `Details: ${JSON.stringify(response.data)}`
    )
  }

  private async renderScene(args: Record<string, unknown>): Promise<ToolResult> {
    const t0 = Date.now()
    this.log.emit({
      timestamp: new Date(),
      level    : 'info',
      phase    : 'external_call',
      bridge   : 'blender',
      message  : `Rendering scene at ${args['width']}x${args['height']}, ${args['samples']} samples...`,
    })

    const response = await this.send('render_scene', {
      width  : args['width']  ?? 800,
      height : args['height'] ?? 600,
      samples: args['samples'] ?? 64,
    }, 60_000) // renders can take longer — 60s timeout

    this.log.emit({
      timestamp : new Date(),
      level     : 'info',
      phase     : 'external_response',
      bridge    : 'blender',
      message   : `Render complete`,
      durationMs: Date.now() - t0,
    })

    // The addon returns the render as a base64-encoded PNG.
    const imageData = response.data as string
    return this.image(imageData)
  }

  private async executeScript(args: Record<string, unknown>): Promise<ToolResult> {
    const response = await this.send('exec_script', {
      script: args['script'],
    })
    return this.ok(`Script executed.\nResult: ${JSON.stringify(response.data)}`)
  }

  private async listObjects(): Promise<ToolResult> {
    const response = await this.send('list_objects', {})
    const objects  = response.data as Array<{ name: string; type: string }>

    if (!objects || objects.length === 0) {
      return this.ok('The scene is empty.')
    }

    const lines = objects.map(o => `- ${o.name} (${o.type})`)
    return this.ok(`Objects in scene (${objects.length}) :\n${lines.join('\n')}`)
  }

  // ---------------------------------------------------------------------------
  // WebSocket infrastructure
  // ---------------------------------------------------------------------------

  /** Open the WebSocket connection to the Blender addon. */
  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `ws://localhost:${this.wsPort}`
      this.ws   = new WebSocket(url)

      this.ws.once('open', () => resolve())
      this.ws.once('error', (err) => reject(err))

      // All incoming messages from Blender come through this single handler.
      this.ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as BlenderResponse
          const pending = this.pending.get(msg.reqId)
          if (pending) {
            this.pending.delete(msg.reqId)
            if (msg.success) {
              pending.resolve(msg)
            } else {
              pending.reject(new Error(msg.error ?? 'Blender returned an error'))
            }
          }
        } catch {
          // Ignore malformed messages.
        }
      })

      // On unexpected close, update status.
      this.ws.on('close', () => {
        if (this._status === 'connected') {
          this._status = 'disconnected'
          this.log.emit({
            timestamp: new Date(),
            level    : 'warn',
            phase    : 'error',
            bridge   : 'blender',
            message  : 'Blender WebSocket closed unexpectedly',
          })
        }
      })
    })
  }

  /**
   * Send a command to Blender and wait for the response.
   * Each call gets a unique reqId so responses can be matched back.
   */
  private send(
    command  : string,
    args     : Record<string, unknown>,
    timeoutMs: number = REQUEST_TIMEOUT_MS
  ): Promise<BlenderResponse> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket is not open'))
        return
      }

      const reqId  : string         = randomUUID()
      const payload: BlenderCommand = { command, args, reqId }

      // Set a timeout so we don't hang forever if Blender doesn't respond.
      const timer = setTimeout(() => {
        this.pending.delete(reqId)
        reject(new Error(`Blender did not respond to "${command}" within ${timeoutMs}ms`))
      }, timeoutMs)

      this.pending.set(reqId, {
        resolve: (r) => { clearTimeout(timer); resolve(r) },
        reject : (e) => { clearTimeout(timer); reject(e) },
      })

      this.log.emit({
        timestamp: new Date(),
        level    : 'debug',
        phase    : 'external_call',
        bridge   : 'blender',
        message  : `WebSocket → Blender : ${command} [${reqId.slice(0, 8)}]`,
        data     : args,
      })

      this.ws.send(JSON.stringify(payload))
    })
  }
}
