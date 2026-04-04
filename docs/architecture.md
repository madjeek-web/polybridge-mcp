# Architecture

This document explains how polybridge-mcp is built internally. It is aimed at
developers who want to understand the code deeply or contribute a new bridge.

---

## The three-layer model

polybridge-mcp has three distinct layers, each with a clear responsibility.

```
Layer 1 : Protocol
  Handles communication with LLM clients (Claude Desktop, Cursor, etc.)
  via the MCP protocol over stdio.
  Files : src/server/index.ts, src/server/registry.ts

Layer 2 : Routing
  Resolves tool names to bridge instances. Manages startup/shutdown.
  Files : src/server/registry.ts, src/server/router.ts

Layer 3 : Bridges
  Each bridge handles communication with one external tool.
  Files : src/bridges/{n8n,blender,notion,filesystem}/index.ts
```

---

## Tool lifecycle

A tool call follows this exact path from the LLM to the result :

```
1. LLM sends a JSON-RPC "tools/call" request over stdin.

2. @modelcontextprotocol/sdk parses the request and calls our
   CallToolRequestSchema handler in src/server/index.ts.

3. The handler looks up the tool name in the ToolRegistry
   (src/server/registry.ts) to find the owning bridge.

4. The PTL logger emits an "incoming_request" event.

5. The bridge's executeTool() method is called with the tool name
   and the arguments provided by the LLM.

6. Inside executeTool(), the bridge calls its external service
   (REST API, WebSocket, Node.js fs, etc.).

7. The bridge returns a ToolResult object.

8. The PTL logger emits a "complete" event.

9. The SDK serializes the ToolResult as a JSON-RPC response
   and writes it to stdout.

10. The LLM host (Claude Desktop) reads the response and continues
    the conversation.
```

---

## Adding a new bridge

Follow these five steps to add a bridge for any tool.

**Step 1 : Add the bridge name to the BridgeName type**

In `src/types/index.ts` :

```typescript
export type BridgeName = 'n8n' | 'blender' | 'notion' | 'filesystem' | 'mynewtool'
```

**Step 2 : Add a config section**

In `src/types/index.ts`, add a config interface :

```typescript
export interface MyNewToolBridgeConfig {
  enabled: boolean
  apiKey : string
}
```

Add it to `PolybridgeConfig.bridges` :

```typescript
bridges: {
  ...
  mynewtool: MyNewToolBridgeConfig
}
```

Add a Zod schema in `src/utils/config.ts` and plug it into `PolybridgeConfigSchema`.

**Step 3 : Create the bridge class**

Create `src/bridges/mynewtool/index.ts` :

```typescript
import { BaseBridge } from '../../adapters/bridge/base.js'

export class MyNewToolBridge extends BaseBridge {
  readonly name        = 'mynewtool' as const
  readonly description = 'Connects to My New Tool'

  async init()      { /* connect, set this._status */ }
  getTools()        { return [ /* ToolDefinition[] */ ] }
  async executeTool(toolName, args) { /* dispatch to handlers */ }
}
```

**Step 4 : Register the bridge in the server**

In `src/server/index.ts`, import and add to the bridges array :

```typescript
import { MyNewToolBridge } from '../bridges/mynewtool/index.js'

const bridges = [
  new N8nBridge(config, log),
  new BlenderBridge(config, log),
  new NotionBridge(config, log),
  new FilesystemBridge(config, log),
  new MyNewToolBridge(config, log),   // add here
]
```

**Step 5 : Update the example config file**

Add defaults to `polybridge-mcp.config.example.json`.

---

## The PTL in depth

The Pedagogical Transparency Layer emits events at these phases :

| Phase | When |
|---|---|
| `incoming_request` | A tool call arrives from the LLM |
| `routing` | The registry is resolving the tool to a bridge |
| `bridge_dispatch` | The bridge's `executeTool` has been called |
| `external_call` | The bridge is about to contact the external service |
| `external_response` | The external service responded |
| `result_format` | Building the ToolResult |
| `complete` | The full round-trip is done |
| `error` | Something failed |

Events carry a `durationMs` field on `complete` events so you can profile
individual tool calls.

---

## Security model

**Filesystem** : all file paths are validated with `path.resolve()` before access.
Path traversal attempts (e.g., `../../etc/passwd`) are rejected.

**n8n** : the API key is never exposed to the LLM. Only workflow IDs and names
are sent in responses.

**Blender** : the WebSocket binds to `localhost` only. Remote connections are not
accepted.

**Notion** : the integration token is stored in the config file. Share only the
specific pages/databases your integration needs — do not give it workspace-wide
access.

**General** : never commit your `polybridge-mcp.config.json`. It is in `.gitignore`
by default. Only commit the `.example.json` file.
