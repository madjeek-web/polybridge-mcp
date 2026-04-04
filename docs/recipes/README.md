# Recipes

Recipes are pre-built workflow prompts. Each recipe describes a common
multi-bridge task so that non-technical users can activate it with a
single `npm run recipe run` command.

---

## Using recipes

```bash
# List all available recipes
npm run recipe list

# See details about a specific recipe (prompt template, required bridges, parameters)
npm run recipe info blender-to-notion

# Print the final prompt to paste into your LLM client
npm run recipe run blender-to-notion
```

---

## Included recipes

| Recipe ID | Bridges | Description |
|---|---|---|
| `blender-to-notion` | blender + notion | Renders a Blender scene and documents it in Notion |
| `file-summarizer` | filesystem | Reads workspace files and writes a summary document |
| `daily-report-telegram` | n8n | Triggers an n8n workflow to send a Telegram report |
| `notion-to-blender` | notion + blender | Reads a Notion page and builds the described 3D scene |

---

## Creating your own recipe

Create a new JSON file in this directory. The filename is the recipe ID.

```json
{
  "id"         : "my-recipe-id",
  "name"       : "Human-readable name",
  "description": "One sentence describing what this recipe does.",
  "bridges"    : ["n8n", "filesystem"],
  "prompt"     : "Instruction template with {parameter} placeholders.",
  "params"     : [
    {
      "name"       : "parameter",
      "description": "What this parameter controls",
      "default"    : "default value"
    }
  ]
}
```

The `prompt` field is a template string. Parameters are referenced with curly
braces : `{paramName}`. The CLI replaces them with their default values when
you run `npm run recipe run`.
