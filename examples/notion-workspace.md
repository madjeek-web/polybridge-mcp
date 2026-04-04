# Example : Documenting a project in Notion

This walkthrough shows how to use the Notion bridge to create and populate
a project documentation page from Claude.

---

## Prerequisites

- polybridge-mcp running with the Notion bridge enabled
- A Notion integration with access to your workspace page
- Claude Desktop connected to your polybridge server

---

## Step 1 : Create a documentation page

```
Create a Notion page titled "polybridge-mcp — Project Log" in my workspace.
Add a heading "Setup Notes" and then write three bullet points explaining what
polybridge-mcp is, what bridges are available, and how to start the server.
```

Claude will :

1. Call `notion_create_page` to create the page.
2. Call `notion_append_text` three times for the heading and bullet points.

PTL output :

```
10:22:01 [polybridge] ► notion_create_page
                       { parentId: "abc123", title: "polybridge-mcp — Project Log" }
10:22:01 [polybridge] ↗ [notion]  POST /v1/pages
10:22:02 [polybridge] ↙ [notion]  Page created : def456
10:22:02 [polybridge] ✓ (487ms)

10:22:02 [polybridge] ► notion_append_text  type: heading_1
10:22:02 [polybridge] ✓ (312ms)

10:22:03 [polybridge] ► notion_append_text  type: bulleted_list_item  (x3)
10:22:03 [polybridge] ✓ (294ms)
```

---

## Step 2 : Read the page back

```
Read the Notion page we just created and summarize what it says.
```

Claude calls `notion_read_page` and receives the full text content,
then summarizes it.

---

## Combining with Blender

With both bridges enabled :

```
Render the current Blender scene and create a Notion page documenting it.
Title the page "Scene Render — April 2026" and include a description of
what you can see in the render.
```

Claude will :
1. Call `blender_render_scene` → receives a base64 image.
2. Analyze the image.
3. Call `notion_create_page` with a title.
4. Call `notion_append_text` multiple times with the description.

This is the `blender-to-notion` recipe in automated form.
