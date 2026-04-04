# Teacher's Guide — Using polybridge-mcp in a Classroom

This guide is written for educators who want to use polybridge-mcp as a
teaching tool for AI integration, protocol design, and software architecture.

---

## What concepts this project teaches

polybridge-mcp is designed to make the following concepts visible and tangible :

**Protocol layer (MCP)**
- What a protocol is and why standardized interfaces matter
- How JSON-RPC works (request/response over stdin/stdout)
- The difference between a protocol layer and an application layer

**Software architecture**
- The Strategy Pattern (hot-pluggable bridges via BaseBridge)
- The Registry Pattern (ToolRegistry)
- Separation of concerns (protocol vs routing vs bridge vs external service)
- Abstract classes and interfaces in TypeScript

**Agentic AI**
- How LLMs use tools (the tool_use / function_calling cycle)
- The difference between LLM reasoning and LLM action
- Multi-turn conversations with tool results
- Why isolation is a problem and how MCP solves it

**Security**
- Path traversal attacks and how to prevent them
- The principle of least privilege (allowedPaths, allowWrite, allowDelete)
- Why API keys belong in environment variables, not source code

---

## Recommended course structure (4 sessions)

### Session 1 — The isolation problem (45 minutes)

Objective : students understand why LLMs cannot act on their own.

1. Demonstrate Claude without any tools : ask it to "create a file on your desktop". Show that it can only describe how, not do it.
2. Explain the isolation problem with the diagram in README.md (the three-part connection).
3. Ask students : "What would you need to build so that Claude could actually do this ?"
4. Introduce MCP as the standard answer to that question.

### Session 2 — Live PTL demonstration (60 minutes)

Objective : students watch the protocol work in real time.

1. Start polybridge-mcp with `npm run dev` and verbosity set to "verbose".
2. Connect Claude Desktop.
3. Ask Claude to list files in the workspace.
4. Project the terminal so students can watch every PTL phase : incoming_request → routing → bridge_dispatch → external_call → external_response → complete.
5. Ask students : "What is happening at each step ? Who is talking to whom ?"
6. Repeat with a Blender tool call if Blender is available — the render's extra latency makes the phases even clearer.

### Session 3 — Reading the code (90 minutes)

Objective : students can navigate a professional TypeScript project.

1. Start with `src/types/index.ts` — the data dictionary of the project.
2. Move to `src/adapters/bridge/base.ts` — the abstract bridge contract.
3. Read `src/bridges/filesystem/index.ts` together — the simplest bridge.
4. Ask : "How would you add a Slack bridge ? What files would you change ?"
5. Challenge for advanced students : add a `polybridge_server_info` meta-tool that returns the server version.

### Session 4 — Student projects (open-ended)

Suggested projects by difficulty :

**Beginner :** Create a recipe JSON file that combines two existing bridges.

**Intermediate :** Add a new tool to the filesystem bridge (e.g., `fs_copy_file` or `fs_count_lines`). Write a test for it.

**Advanced :** Implement a new bridge from scratch for a tool the student uses (Discord, Spotify, Home Assistant). Must extend BaseBridge, include tool definitions with pedagogicalSummary, and handle errors gracefully.

---

## PTL in classroom projection mode

For live demonstration, set verbosity to "verbose" and optionally pipe the
PTL to a log file that you can scroll through :

```json
"pedagogy": {
  "enabled"  : true,
  "verbosity": "verbose",
  "logFile"  : "./logs/classroom-session.log"
}
```

The log file strips ANSI color codes automatically, so it displays cleanly
in any text editor projected on a screen.

---

## Frequently asked questions from students

**"Why not just write a Python script that calls Blender ?"**
You could. But then every LLM needs its own version of that script. MCP gives
you one standard interface that works for Claude, GPT, Gemini, and any future
model. You write the bridge once.

**"Who decides what tools the LLM is allowed to use ?"**
The server. The LLM can only see tools that are registered in the ToolRegistry.
If a bridge is disabled, its tools are invisible to the LLM.

**"Could the LLM delete my files ?"**
Only if `allowDelete: true` is set in the config AND your allowedPaths includes
the target directory. The filesystem bridge is sandboxed by design.

**"Why TypeScript instead of Python ?"**
The official MCP SDK is available in both TypeScript and Python. TypeScript
is used here because the strict type system makes the architecture explicit —
students can see the shape of every object at a glance.

---

## Assessment ideas

- Ask students to draw the data flow diagram for a specific tool call from memory.
- Ask students to explain the `resolveSafe()` path validation function and why `path.resolve()` is necessary.
- Ask students to predict what the PTL would output for a given LLM instruction, then verify by running it.
- Ask students to write a test for a new tool they added.
