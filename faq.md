# Frequently Asked Questions

Answers to questions that come up most often from beginners, students,
and people new to MCP.

---

## The basics

**What is MCP ?**

MCP stands for Model Context Protocol. It is an open standard created by
Anthropic (the company that makes Claude) that defines a common way for AI
models to communicate with external tools. Think of it as a power strip with
a universal socket : any tool that supports MCP can be plugged in, and any
AI model that supports MCP can use it.

**What is polybridge-mcp specifically ?**

It is a hub that sits between your AI (Claude, GPT, Gemini, or a local model)
and multiple tools (n8n, Blender, Notion, your filesystem). You run it once and
it handles all the connections.

**Do I need to code to use this ?**

For the basic setup (Claude Desktop + one bridge), no. You need to edit one
JSON config file. Reading the README carefully is enough.
For advanced use (building your own recipes, adding a bridge), some TypeScript
knowledge helps.

**Is this free ?**

Completely. MIT license. No fees, no subscriptions, no telemetry.

---

## Setup questions

**Why do I need Docker ?**

Docker is only required if you want to run n8n locally. If you only use the
Blender, Notion, or filesystem bridges, Docker is optional.

**Why does Claude Desktop say "server disconnected" ?**

The most common causes :
1. The path in `claude_desktop_config.json` points to a file that doesn't exist.
   Run `npm run build` first and check that `dist/server/index.js` exists.
2. The config file has a JSON syntax error. Validate it with a JSON validator.
3. Node.js is not installed or is below version 20.

**My n8n API key is not working. What should I check ?**

1. Go to n8n at http://localhost:5678
2. Settings > API > make sure an API key exists
3. The key in your config must match exactly (no extra spaces)
4. The `baseUrl` in config must match the address where n8n is running

**Blender says "server already running" when I click Start Server.**

This means a previous WebSocket server is still listening on the port. Either
restart Blender or change the port number in the addon panel (and update your
polybridge config to match).

---

## Usage questions

**How do I know which bridges are enabled ?**

Ask Claude : "What bridges do you have available ?" or "Use the
polybridge_list_bridges tool." It will list all bridges with their connection
status.

**Can I use polybridge-mcp with ChatGPT ?**

Not directly through the ChatGPT web interface — OpenAI does not support
MCP in ChatGPT yet. But you can use the OpenAIAdapter in the programmatic
usage example to build your own application that drives GPT through
polybridge-mcp.

**Can I use it with a local AI (no internet) ?**

Yes. Use Ollama. Install it from https://ollama.com, pull a model
(`ollama pull llama3.2`), and use the OllamaAdapter. The filesystem and
Blender bridges also work fully offline.

**What happens if a bridge disconnects during a session ?**

The bridge status updates to "disconnected". Any tool call to that bridge
returns an error message explaining the status. Other bridges continue
working normally. The server does not crash.

---

## Architecture questions

**Why is n8n the "backbone" instead of just a target ?**

Because n8n already has 1,400 integrations, visual workflow editing, scheduling,
retry logic, and error handling built in. For multi-step automations (send a
message, wait for a response, log the result to a sheet), it is cleaner to
delegate the entire sequence to n8n rather than implement each step inline.
polybridge-mcp handles the start/stop/monitor layer; n8n handles the internal
workflow logic.

**Why is the PTL logging to stderr and not stdout ?**

The MCP protocol uses stdio transport : it reads from stdin and writes to
stdout. If the PTL wrote to stdout, Claude Desktop would try to parse the
log messages as JSON-RPC protocol messages and crash. Stderr is the correct
channel for human-readable diagnostic output.

**What is the `reqId` field in the Blender WebSocket messages ?**

WebSocket is asynchronous. If you send two Blender commands rapidly, the
responses can arrive in any order. The `reqId` is a unique identifier (a UUID)
that links each response to the request that triggered it. Without it, the
bridge would not know which response belongs to which tool call.

---

## Contributing questions

**I want to add a Slack bridge. Where do I start ?**

Read `docs/architecture.md`, specifically the "Adding a new bridge" section.
It is a five-step process. The filesystem bridge (`src/bridges/filesystem/index.ts`)
is the simplest one to use as a template.

**Do contributions need tests ?**

Tests are strongly encouraged but not strictly required for a first PR. A bridge
with no tests is better than no bridge at all. Tests can be added in a follow-up.

**What language are the comments in ?**

English only. The project is designed for an international audience.
