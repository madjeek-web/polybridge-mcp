# Notion bridge

## What is Notion ?

Notion is a workspace application used for notes, databases, project
management, wikis, and documentation. Its block-based model makes it flexible
enough to be used as a CMS, a spreadsheet replacement, or a knowledge base.

Homepage : https://notion.so

## Setup

### 1 — Create a Notion integration

1. Go to https://notion.so/my-integrations
2. Click "New integration"
3. Give it a name (e.g., "polybridge")
4. Select "Internal integration"
5. Copy the "Internal Integration Token" (starts with `secret_`)

### 2 — Share pages with your integration

For each Notion page or database you want to access :
1. Open the page
2. Click the three-dot menu in the top right
3. Click "Connections"
4. Find and add your integration

Without this step, the API returns "Page not found" even if the page exists.

### 3 — Enable the bridge in config

```json
"notion": {
  "enabled": true,
  "apiKey" : "secret_YOUR_INTEGRATION_TOKEN_HERE"
}
```

## Finding page IDs

The page ID is in the URL. For a page at :

```
https://notion.so/My-Page-Title-abc123def456789012345678901234ab
```

The ID is : `abc123de-f456-7890-1234-5678901234ab`
(Notion IDs are 32 hex characters, often displayed without hyphens in the URL)

## Available tools

| Tool | Description |
|---|---|
| `notion_create_page` | Create a new page inside a parent page or database |
| `notion_append_text` | Append a text block to an existing page |
| `notion_read_page` | Read the title and text content of a page |

## Supported block types for `notion_append_text`

paragraph, heading_1, heading_2, heading_3, bulleted_list_item,
numbered_list_item, code

## Example interactions

```
"Create a Notion page titled 'Sprint 12 Notes' in my project workspace"
"Add a heading and three bullet points to page abc123"
"Read the content of my onboarding page"
"Document the 3D scene I just rendered in a new Notion page"
```
