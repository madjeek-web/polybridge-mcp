# n8n bridge

## What is n8n ?

n8n is an open-source workflow automation platform. It has a visual editor
where you connect nodes to build automations. It supports over 1,400 external
services out of the box (Slack, Telegram, Gmail, GitHub, Airtable, and many
more). You can also self-host it for free.

Homepage : https://n8n.io
Docker image : `n8nio/n8n`

## Why n8n is the polybridge backbone

When an LLM instruction requires multiple sequential steps involving external
services (e.g., "check the weather, then send a Telegram, then log to a Google
Sheet"), the cleanest architecture is to delegate that sequence to n8n rather
than implementing it inline in polybridge-mcp.

n8n handles :
- Retries on failure
- Scheduling (run every hour, every day, etc.)
- Complex branching (if/else in workflows)
- Authentication with external services
- 1,400 integrations without you writing any code

polybridge-mcp handles :
- Telling n8n which workflow to run (or creating new ones)
- Monitoring execution results
- Feeding LLM-generated data into workflow inputs

## Setup

### 1 — Start n8n

With Docker Compose (recommended) :

```bash
docker-compose up -d n8n
```

Then open http://localhost:5678 and create your admin account.

### 2 — Create an API key

In n8n, go to `Settings > API > Add API Key`. Copy the key.

### 3 — Enable the bridge in config

```json
"n8n": {
  "enabled": true,
  "baseUrl": "http://localhost:5678",
  "apiKey" : "your-key-here"
}
```

## Available tools

| Tool | Description |
|---|---|
| `n8n_list_workflows` | List all workflows with name, ID, and active status |
| `n8n_execute_workflow` | Trigger a workflow by ID, optionally with input data |
| `n8n_get_execution` | Fetch the result of a past execution |
| `n8n_activate_workflow` | Enable or disable a workflow |

## Example interactions

```
"What workflows do I have in n8n ?"
"Run the 'Weekly Newsletter' workflow"
"Activate the 'Daily Weather Alert' workflow"
"Did the last execution of workflow 15 succeed ?"
```
