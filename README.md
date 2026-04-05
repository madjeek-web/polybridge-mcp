<p align="center">
<img src="https://github.com/madjeek-web/polybridge-mcp/raw/main/cover_convergence_mcp_2.png" alt="Polybridge Mcp cover image" width="100%" height="100%">
</p>

# Polybridge Mcp

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MCP Protocol](https://img.shields.io/badge/MCP-2025--11--05-6B21A8.svg)](https://modelcontextprotocol.io/)
[![n8n Compatible](https://img.shields.io/badge/n8n-compatible-EA4B71.svg)](https://n8n.io/)
[![Blender](https://img.shields.io/badge/Blender-3.0%2B-E87D0D.svg?logo=blender&logoColor=white)](https://blender.org/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED.svg?logo=docker&logoColor=white)](https://docker.com/)
[![Status: Active](https://img.shields.io/badge/Status-Active-22C55E.svg)]()
[![Version](https://img.shields.io/badge/version-1.0.0-0EA5E9.svg)]()
[![Pedagogical](https://img.shields.io/badge/Made%20for-Learners-F59E0B.svg)]()

<p align="center">
  <img src="https://github.com/madjeek-web/about/raw/main/hr.png" alt="separator" width="300" height="3">
</p>


Here’s what’s unique: no existing project simultaneously combines an MCP hub with n8n as the backbone orchestration engine (not just a target), creative bridges (Blender), a pedagogical transparency layer that makes the invisible visible, and an LLM-agnostic architecture with a ready-to-use “recipes” system.

There are existing MCP gateways (Bifrost, ContextForge, MetaMCP), but none of them simultaneously combine :

- n8n as the orchestration backbone (not just a target)

- Blender 3D via native WebSocket

- A PTL (Pedagogical Transparency Layer) : every tool call logged in readable English, phase by phase

- 4 LLM adapters (Claude, OpenAI, Gemini, Ollama) in a single repo

- A recipe system that can be activated via CLI

- An architecture explicitly designed for teaching


<p align="center">
  <img src="https://github.com/madjeek-web/about/raw/main/hr.png" alt="separator" width="300" height="3">
</p>


**One MCP server. Any LLM. Every tool.**

`polybridge-mcp` is a universal multi-bridge hub built on the [Model Context Protocol](https://modelcontextprotocol.io/). Connect Claude, GPT, Gemini, or any local LLM to n8n workflows, Blender 3D, Notion, your filesystem, and more through a single self-describing server.

It was designed with one goal that most production gateways ignore : **making the protocol visible and understandable**, so that students, teachers, and junior developers can read the code, grasp the concepts, and build on top of it.

> Created by Fabien Conéjéro (FC84) in April 2026 under MIT license.

<p align="center">
  <img src="https://github.com/madjeek-web/about/raw/main/hr.png" alt="separator" width="300" height="3">
</p>

## Table of Contents

- [What is this, exactly ?](#what-is-this-exactly-)
- [Why does this exist ?](#why-does-this-exist-)
- [Architecture overview](#architecture-overview)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Bridges](#bridges)
  - [n8n bridge](#n8n-bridge)
  - [Blender bridge](#blender-bridge)
  - [Notion bridge](#notion-bridge)
  - [Filesystem bridge](#filesystem-bridge)
- [LLM adapters](#llm-adapters)
- [Recipes](#recipes)
- [Pedagogical transparency layer](#pedagogical-transparency-layer)
- [API reference](#api-reference)
- [Project structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

<p align="center">
  <img src="https://github.com/madjeek-web/about/raw/main/hr.png" alt="separator" width="300" height="3">
</p>

## What is this, exactly ?

Let us start from the beginning. No prior knowledge assumed.

### The problem

Imagine you are using Claude (or any other AI assistant). You want to say :

> "Create a 3D castle in Blender and then document it in Notion."

Claude is very capable of understanding that instruction. But it has no hands. It cannot open Blender. It cannot type into Notion. It lives in a chat window and can only produce text.

**This is the isolation problem.** Large Language Models are brilliant at reasoning but completely cut off from the real tools around them.

### The solution : MCP

Anthropic (the company behind Claude) invented a protocol called **Model Context Protocol (MCP)**. Think of it exactly like a power strip with a universal socket.

```
Without MCP :

Claude  ------??------  Blender      (no connection)
Claude  ------??------  n8n          (no connection)
Claude  ------??------  Notion       (no connection)


With MCP :

Claude  ---[MCP]---  polybridge-mcp  ---[bridge]---  Blender
                                    ---[bridge]---  n8n
                                    ---[bridge]---  Notion
                                    ---[bridge]---  Filesystem
```

`polybridge-mcp` is the **hub in the middle**. It speaks the MCP protocol toward any LLM and manages the actual connections toward every tool.

### The three-part connection

Every interaction has three actors :

```
[LLM]  <-- MCP protocol -->  [polybridge-mcp]  <-- bridge protocol -->  [Tool]

Example 1 : "Create a castle in Blender"
  Claude  <-- MCP -->  polybridge-mcp  <-- WebSocket/Python -->  Blender

Example 2 : "Send me a text and open Spotify"
  Claude  <-- MCP -->  polybridge-mcp  <-- REST API -->  n8n workflow

Example 3 : "Create a project page in Notion"
  Claude  <-- MCP -->  polybridge-mcp  <-- HTTP API -->  Notion
```

<p align="center">
  <img src="https://github.com/madjeek-web/about/raw/main/hr.png" alt="separator" width="300" height="3">
</p>

## Why does this exist ?

There are already excellent MCP gateways out there (Bifrost, ContextForge, MetaMCP). They are powerful and production-ready. But they solve an **enterprise problem** : scale, security, governance.

`polybridge-mcp` solves a different problem : **comprehension**.

It is the first MCP hub designed explicitly as a learning platform. Every file is heavily commented. Every design choice is explained. The **Pedagogical Transparency Layer** (PTL) logs every step of every action in plain English so you can watch the protocol work in real time.

<p align="center">
  <img src="https://github.com/madjeek-web/about/raw/main/hr.png" alt="separator" width="300" height="3">
</p>

## Architecture overview

```
                         polybridge-mcp
                    ┌─────────────────────────┐
                    │                         │
  LLMs              │   MCP Server (stdio)    │
  ─────             │   ┌─────────────────┐   │
  Claude     ──────►│   │  Tool Registry  │   │
  GPT-4      ──────►│   │  Request Router │   │   Bridges
  Gemini     ──────►│   │  PTL Logger     │   │   ───────
  Ollama     ──────►│   └────────┬────────┘   │   n8n         REST API
                    │            │             ├──────────────►
                    │   Bridge   │  Manager   │   Blender     WebSocket
                    │   ┌────────▼────────┐   ├──────────────►
                    │   │  n8n Bridge     │   │   Notion      HTTP API
                    │   │  Blender Bridge │   ├──────────────►
                    │   │  Notion Bridge  │   │   Filesystem  Node.js fs
                    │   │  FS Bridge      │   ├──────────────►
                    │   └─────────────────┘   │
                    │                         │
                    │   Recipe Engine         │
                    │   (pre-built workflows) │
                    └─────────────────────────┘
```

**Key design decisions :**

1. **n8n is the orchestration backbone** - Complex multi-step automations are sent to n8n for execution, not handled inline. This gives you a visual workflow editor for free.

2. **Bridges are hot-pluggable** - You can add a new bridge (say, a Slack bridge) by dropping a single TypeScript file into `src/bridges/` without restarting the server.

3. **LLM-agnostic** - The server does not care which LLM is calling it. Any MCP-compatible client works, and the included client adapters let you drive it programmatically from any LLM provider.

4. **Pedagogical Transparency Layer** - Every tool call generates a human-readable explanation. Students can watch exactly what happens at each step.

<p align="center">
  <img src="https://github.com/madjeek-web/about/raw/main/hr.png" alt="separator" width="300" height="3">
</p>

## Features

**Core capabilities :**

- Universal MCP server compatible with Claude Desktop, Claude Code, Cursor, Windsurf, and any MCP client
- Four first-class bridges : n8n, Blender 3D, Notion, and local filesystem
- n8n as workflow execution engine (trigger existing workflows or generate new ones via natural language)
- Hot-pluggable bridge architecture (add bridges without restart)
- LLM-agnostic client library (Claude, OpenAI, Gemini, Ollama)

**What makes it different :**

- **Pedagogical Transparency Layer (PTL)** : every MCP call emits a human-readable step-by-step log
- **Recipe system** : pre-built workflow bundles you activate with one command (e.g., `polybridge recipe run blender-to-notion`)
- **Tool composition** : chain tools across bridges in a single LLM instruction
- **Self-documenting tools** : each bridge auto-generates its usage docs at startup
- **Zero-config Docker** : one `docker-compose up` and everything is running

**Pedagogical features specifically :**

- Every source file includes explanations of its role in the architecture
- Inline comments explain the "why", not just the "what"
- PTL output can be piped to a log file or a classroom projector
- Included examples cover beginner, intermediate, and advanced use cases

<p align="center">
  <img src="https://github.com/madjeek-web/about/raw/main/hr.png" alt="separator" width="300" height="3">
</p>

## Prerequisites

You need these tools installed before starting :

| Tool | Version | Purpose | Install |
|---|---|---|---|
| Node.js | >= 20.0 | Runs the TypeScript server | [nodejs.org](https://nodejs.org/) |
| npm | >= 10.0 | Manages packages | Comes with Node.js |
| Docker | >= 24 | Runs n8n locally | [docker.com](https://docker.com/) |
| Git | any | Clone this repo | [git-scm.com](https://git-scm.com/) |
| Blender | >= 3.0 | 3D tool (optional) | [blender.org](https://blender.org/) |

**Not required :**
- A Notion account (optional, only for Notion bridge)
- Any LLM API key (optional, only if using the built-in client adapters)

<p align="center">
  <img src="https://github.com/madjeek-web/about/raw/main/hr.png" alt="separator" width="300" height="3">
</p>

## Quick start

### 1 - Clone the repository

```bash
git clone https://github.com/madjeek-web/polybridge-mcp.git
cd polybridge-mcp
```

### 2 - Install dependencies

```bash
npm install
```

### 3 - Copy and edit the configuration file

```bash
cp polybridge-mcp.config.example.json polybridge-mcp.config.json
```

Open `polybridge-mcp.config.json` and fill in the values you need. Every field has a comment explaining what it does.

### 4 - Start the server

**Development mode** (shows all PTL logs in the terminal) :

```bash
npm run dev
```

**Production mode** (compiled JavaScript, faster startup) :

```bash
npm run build
npm start
```

**Docker mode** (runs everything in containers, including n8n) :

```bash
docker-compose up -d
```

### 5 - Connect your LLM

**For Claude Desktop**, add this to your `claude_desktop_config.json` :

```json
{
  "mcpServers": {
    "polybridge": {
      "command": "node",
      "args": ["/absolute/path/to/polybridge-mcp/dist/server/index.js"],
      "env": {
        "POLYBRIDGE_CONFIG": "/absolute/path/to/polybridge-mcp.config.json"
      }
    }
  }
}
```

**For Claude Code** :

```bash
claude mcp add polybridge node /absolute/path/to/polybridge-mcp/dist/server/index.js
```

**For Cursor or Windsurf**, follow the same pattern as Claude Desktop using their respective MCP configuration files.

<p align="center">
  <img src="https://github.com/madjeek-web/about/raw/main/hr.png" alt="separator" width="300" height="3">
</p>

## Configuration

The main configuration file is `polybridge-mcp.config.json`. Here is the full reference :

```json
{
  "server": {
    "name": "polybridge-mcp",
    "version": "1.0.0",

    "pedagogy": {
      "enabled": true,
      "verbosity": "normal",
      "logFile": null
    }
  },

  "bridges": {
    "n8n": {
      "enabled": true,
      "baseUrl": "http://localhost:5678",
      "apiKey": "YOUR_N8N_API_KEY"
    },
    "blender": {
      "enabled": false,
      "wsPort": 9877
    },
    "notion": {
      "enabled": false,
      "apiKey": "YOUR_NOTION_INTEGRATION_KEY"
    },
    "filesystem": {
      "enabled": true,
      "allowedPaths": ["./workspace"],
      "allowWrite": true,
      "allowDelete": false
    }
  }
}
```

**Pedagogy verbosity levels :**

| Level | What you see |
|---|---|
| `silent` | Nothing (production use) |
| `normal` | One line per tool call |
| `verbose` | Full step-by-step breakdown |
| `debug` | Protocol-level messages |

<p align="center">
  <img src="https://github.com/madjeek-web/about/raw/main/hr.png" alt="separator" width="300" height="3">
</p>

## Bridges

### n8n bridge

n8n is an open-source workflow automation platform. `polybridge-mcp` treats n8n as its **orchestration backbone** : when an LLM asks for a multi-step automation (send a text, open an app, trigger a sequence of actions), that request is translated into an n8n workflow and executed there.

**What the LLM can do via this bridge :**

```
List all existing n8n workflows
Execute a workflow by name or ID
Create a new workflow from a description
Read the execution history of a workflow
Enable or disable a workflow
```

**Example interaction :**

```
User : "Send me a Telegram message every morning at 9am with today's weather"

Claude calls polybridge-mcp tool : n8n_create_workflow
  description : "daily weather telegram notification"

polybridge-mcp generates an n8n workflow JSON with :
  - Schedule trigger (9am daily)
  - OpenWeatherMap HTTP request
  - Telegram node

The workflow is pushed to n8n via REST API and activated automatically.
```

**Setup :**

Start n8n with Docker :

```bash
docker-compose up -d n8n
```

Then go to `http://localhost:5678`, create an API key in `Settings > API`, and paste it into your config file.

<p align="center">
  <img src="https://github.com/madjeek-web/about/raw/main/hr.png" alt="separator" width="300" height="3">
</p>

### Blender bridge

Blender is a free, open-source 3D creation suite. The bridge uses a small Python addon (`bridges/blender/polybridge_addon.py`) that opens a WebSocket server inside Blender and listens for commands.

**What the LLM can do via this bridge :**

```
Create 3D objects (mesh, curve, light, camera)
Apply materials and textures
Arrange objects in a scene
Render the current scene to an image
Run arbitrary Blender Python scripts
Export scenes to GLTF, OBJ, FBX
```

**Example interaction :**

```
User : "Create a medieval castle with four towers and a drawbridge"

Claude breaks this into a sequence of Blender commands :
  1. polybridge calls blender_create_object (cube, scaled to castle base)
  2. polybridge calls blender_create_object (cylinder x4, scaled to towers)
  3. polybridge calls blender_apply_material (stone texture)
  4. polybridge calls blender_render_scene
  5. The render is returned as a base64 image
```

**Setup :**

1. Open Blender
2. Go to `Edit > Preferences > Add-ons > Install`
3. Select `bridges/blender/polybridge_addon.py`
4. Enable the addon and click "Start WebSocket Server"

---

### Notion bridge

Notion is a popular workspace tool for notes, databases, and project management.

**What the LLM can do via this bridge :**

```
Create pages and subpages
Read page content
Append blocks (text, headings, code, tables)
Query databases
Create and update database entries
```

**Setup :**

1. Go to [notion.so/my-integrations](https://notion.so/my-integrations)
2. Create a new internal integration
3. Copy the "Internal Integration Token"
4. Share the pages/databases you want to access with your integration
5. Paste the token into your config file

<p align="center">
  <img src="https://github.com/madjeek-web/about/raw/main/hr.png" alt="separator" width="300" height="3">
</p>

### Filesystem bridge

A sandboxed file system bridge. It restricts access to a configurable list of directories, so the LLM can only touch files you explicitly allow.

**What the LLM can do via this bridge :**

```
Read files
Write files
List directory contents
Create directories
Move or copy files (if allowWrite is true)
Delete files (only if allowDelete is true)
```

**Security note :** Always configure `allowedPaths` to point to a workspace folder, never to your home directory or system root.

<p align="center">
  <img src="https://github.com/madjeek-web/about/raw/main/hr.png" alt="separator" width="300" height="3">
</p>

## LLM adapters

The `src/adapters/llm/` directory contains TypeScript client classes that let you **drive** `polybridge-mcp` programmatically. This is useful when you want to build your own application on top of the hub.

```typescript
import { ClaudeAdapter } from './src/adapters/llm/claude.js'

const adapter = new ClaudeAdapter({
  apiKey: process.env.ANTHROPIC_API_KEY,
  polybridgeConfig: './polybridge-mcp.config.json'
})

const result = await adapter.ask(
  'Create a sphere in Blender and take a screenshot'
)

console.log(result)
```

**Available adapters :**

| Adapter | LLM provider | File |
|---|---|---|
| `ClaudeAdapter` | Anthropic Claude | `src/adapters/llm/claude.ts` |
| `OpenAIAdapter` | OpenAI GPT | `src/adapters/llm/openai.ts` |
| `GeminiAdapter` | Google Gemini | `src/adapters/llm/gemini.ts` |
| `OllamaAdapter` | Any local Ollama model | `src/adapters/llm/ollama.ts` |

---

## Recipes

Recipes are pre-built workflow bundles. They are a way for non-technical users to activate common automation patterns with a single command, without knowing anything about MCP or JSON.

**List available recipes :**

```bash
npm run recipe list
```

**Run a recipe :**

```bash
npm run recipe run blender-to-notion
npm run recipe run daily-report-telegram
npm run recipe run file-summarizer
```

**Create your own recipe :**

A recipe is a simple JSON file in `docs/recipes/`. See [docs/recipes/README.md](docs/recipes/README.md) for the format.

**Included recipes :**

| Recipe | What it does |
|---|---|
| `blender-to-notion` | Renders a 3D scene and documents it in a Notion page |
| `daily-report-telegram` | Sends a daily summary via Telegram using n8n |
| `file-summarizer` | Reads files from a folder and creates an AI summary |
| `notion-to-blender` | Reads a Notion page and generates a 3D scene from it |

<p align="center">
  <img src="https://github.com/madjeek-web/about/raw/main/hr.png" alt="separator" width="300" height="3">
</p>

## Pedagogical Transparency Layer

The PTL is what makes `polybridge-mcp` unique among all MCP gateways. It runs as a middleware layer inside the server and intercepts every single tool call, emitting a human-readable log at each step.

**Example output with `verbosity: "verbose"` :**

```
[polybridge] ► Incoming request from LLM
[polybridge] ► Tool called : blender_create_object
[polybridge] ► Arguments received :
              {
                "type": "MESH",
                "meshType": "CUBE",
                "name": "CastleBase",
                "location": [0, 0, 0],
                "scale": [10, 10, 3]
              }
[polybridge] ► Routing to : BlenderBridge
[polybridge] ► Sending WebSocket command to Blender on port 9877
[polybridge] ► Blender responded in 142ms
[polybridge] ► Object created : CastleBase (ID: 7a2f)
[polybridge] ► Returning result to LLM
[polybridge] ✓ Tool call completed in 148ms
```

This output is the protocol made visible. When teaching a class, you can project this output live so students can follow exactly what the LLM is doing and why.

**Pipe PTL output to a file :**

```json
"pedagogy": {
  "enabled": true,
  "verbosity": "verbose",
  "logFile": "./logs/session.log"
}
```

<p align="center">
  <img src="https://github.com/madjeek-web/about/raw/main/hr.png" alt="separator" width="300" height="3">
</p>

## API reference

Full reference documentation is available in [docs/architecture.md](docs/architecture.md).

**Tool naming convention :**

Every tool exposed by `polybridge-mcp` follows the pattern `{bridge}_{action}` :

```
n8n_list_workflows
n8n_execute_workflow
n8n_create_workflow
blender_create_object
blender_apply_material
blender_render_scene
notion_create_page
notion_append_blocks
notion_query_database
fs_read_file
fs_write_file
fs_list_directory
```

<p align="center">
  <img src="https://github.com/madjeek-web/about/raw/main/hr.png" alt="separator" width="300" height="3">
</p>

## Project structure

```
polybridge-mcp/
├── .github/
│   ├── workflows/
│   │   └── ci.yml               # GitHub Actions : lint + build + test
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   └── PULL_REQUEST_TEMPLATE.md
├── bridges/
│   └── blender/
│       └── polybridge_addon.py  # Blender Python addon (WebSocket server)
├── docs/
│   ├── architecture.md          # Deep dive into the architecture
│   ├── bridges/                 # One doc per bridge
│   ├── llm-adapters/            # One doc per LLM adapter
│   └── recipes/                 # Recipe format + included recipes
├── examples/
│   ├── blender-castle.md        # Step-by-step walkthrough
│   ├── n8n-automation.md
│   └── notion-workspace.md
├── src/
│   ├── server/
│   │   ├── index.ts             # Entry point, MCP server setup
│   │   ├── registry.ts          # Collects all tools from all bridges
│   │   └── router.ts            # Routes incoming tool calls to bridges
│   ├── adapters/
│   │   ├── bridge/
│   │   │   └── base.ts          # Abstract base class every bridge extends
│   │   └── llm/
│   │       ├── claude.ts        # Claude adapter
│   │       ├── openai.ts        # OpenAI adapter
│   │       ├── gemini.ts        # Gemini adapter
│   │       └── ollama.ts        # Ollama adapter
│   ├── bridges/
│   │   ├── n8n/
│   │   │   ├── index.ts         # n8n bridge entry point
│   │   │   ├── tools.ts         # MCP tool definitions
│   │   │   └── client.ts        # n8n REST API client
│   │   ├── blender/
│   │   │   ├── index.ts         # Blender bridge entry point
│   │   │   ├── tools.ts         # MCP tool definitions
│   │   │   └── client.ts        # WebSocket client
│   │   ├── notion/
│   │   │   ├── index.ts
│   │   │   ├── tools.ts
│   │   │   └── client.ts
│   │   └── filesystem/
│   │       ├── index.ts
│   │       ├── tools.ts
│   │       └── client.ts
│   ├── types/
│   │   └── index.ts             # All shared TypeScript types
│   └── utils/
│       ├── config.ts            # Config file loading and validation
│       ├── logger.ts            # PTL logger
│       └── errors.ts            # Typed error classes
├── scripts/
│   ├── setup.sh                 # Linux/macOS first-run setup
│   └── setup.bat                # Windows first-run setup
├── .editorconfig
├── .gitignore
├── CHANGELOG.md
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── docker-compose.yml
├── Dockerfile
├── LICENSE
├── package.json
├── polybridge-mcp.config.example.json
├── README.md
├── SECURITY.md
└── tsconfig.json
```

<p align="center">
  <img src="https://github.com/madjeek-web/about/raw/main/hr.png" alt="separator" width="300" height="3">
</p>

## Contributing

Contributions are very welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request.

The most needed contributions right now :

- New bridge (Slack, GitHub, Home Assistant, Spotify, etc.)
- Translations of the PTL output messages
- New recipes
- Tests

<p align="center">
  <img src="https://github.com/madjeek-web/about/raw/main/hr.png" alt="separator" width="300" height="3">
</p>

## License

MIT License. See [LICENSE](LICENSE).

Created by Fabien Conéjéro (FC84) in April 2026.

<p align="center">
  <img src="https://github.com/madjeek-web/about/raw/main/hr.png" alt="separator" width="300" height="3">
</p>

Medium : https://medium.com/@fabien-conejero/polybridge-mcp-4d570c1caf5c

<p align="center">
  <img src="https://github.com/madjeek-web/about/raw/main/hr.png" alt="separator" width="300" height="3">
</p>

## ༄☕︎︎︎ Buy Me A Coffee :

<a href="https://donate.stripe.com/3cI6oH1nUgsy8WZdVHgEg00" target="_blank" rel="noopener noreferrer"><img src="https://github.com/madjeek-web/eventflow/raw/main/Buy_Me _A_Coffee.jpg" alt="Buy Me A Coffee image" width="25%" height="25%"></a>

༄☕︎︎︎ [stripe.com](https://donate.stripe.com/3cI6oH1nUgsy8WZdVHgEg00)

. Thank you for your support
