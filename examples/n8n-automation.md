# Example : Automating a daily report with n8n

This walkthrough shows how to use the n8n bridge to create and trigger
a workflow that runs automatically every day.

---

## Prerequisites

- polybridge-mcp running with the n8n bridge enabled
- n8n accessible at http://localhost:5678 (or your custom URL)
- Claude Desktop connected to your polybridge server

---

## Step 1 : List your existing workflows

Type in Claude Desktop :

```
What workflows do I have in n8n ?
```

Claude calls `n8n_list_workflows`. If this is a fresh install you will see :

```
Found 0 workflow(s) in n8n.
```

---

## Step 2 : Trigger an existing workflow

If you already have a workflow in n8n, you can trigger it with :

```
Run the workflow named "Weekly Newsletter" in n8n.
```

Claude calls `n8n_list_workflows` to find the ID, then calls
`n8n_execute_workflow` with that ID. The PTL output :

```
09:45:01 [polybridge] ► n8n_list_workflows
09:45:01 [polybridge] ↗ [n8n]  GET http://localhost:5678/api/v1/workflows
09:45:01 [polybridge] ↙ [n8n]  Received 3 workflow(s)
09:45:01 [polybridge] ✓ (312ms)

09:45:02 [polybridge] ► n8n_execute_workflow  workflowId: "15"
09:45:02 [polybridge] ↗ [n8n]  POST /api/v1/workflows/15/run
09:45:02 [polybridge] ↙ [n8n]  Execution ID : 847
09:45:02 [polybridge] ✓ (284ms)
```

---

## Step 3 : Check the execution result

```
Did the "Weekly Newsletter" workflow succeed ?
```

Claude calls `n8n_get_execution` with the execution ID from the previous step :

```
Execution ID   : 847
Workflow ID    : 15
Status         : success
Started at     : 2026-04-04T09:45:02.000Z
Finished at    : 2026-04-04T09:45:08.000Z
```

---

## Understanding the n8n architecture

n8n stores workflows as JSON. Each workflow has a trigger node (Schedule,
Webhook, Manual, etc.) and a chain of action nodes (HTTP Request, Send Email,
Telegram, Notion, etc.).

When polybridge calls `n8n_execute_workflow`, n8n runs the entire chain
autonomously. polybridge does not control the individual nodes inside n8n —
it only triggers and monitors the workflow at the top level.

This is intentional. n8n is the specialist for multi-step automations.
polybridge is the bridge that lets an LLM start and monitor them.

```
LLM instruction
  "Send me a Telegram with today's weather every morning"

polybridge-mcp receives the instruction
  → calls n8n_execute_workflow (or creates a new workflow with the n8n API)

n8n runs autonomously :
  [Schedule node] → [HTTP OpenWeatherMap] → [Telegram node]
```

The LLM does not need to know how to call the OpenWeatherMap API or the
Telegram Bot API. n8n handles that. The LLM just orchestrates.
