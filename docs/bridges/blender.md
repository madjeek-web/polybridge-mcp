# Blender bridge

## What is Blender ?

Blender is a free, open-source 3D creation suite used by artists, architects,
game developers, and educators worldwide. It supports modeling, animation,
rendering, video editing, and Python scripting.

Homepage    : https://blender.org
Download    : https://blender.org/download (Windows, macOS, Linux)
Minimum version required : 3.0

## How the bridge works

The bridge uses a two-component architecture :

```
polybridge-mcp (TypeScript, WebSocket client)
        |
        |  ws://localhost:9877
        |
Blender Python addon (bpy, WebSocket server)
        |
        |  bpy.ops.*
        |
Blender scene
```

The Blender addon (`bridges/blender/polybridge_addon.py`) opens a WebSocket
server inside Blender's Python environment. polybridge-mcp connects to it and
sends JSON commands. The addon executes them as Blender Python API calls.

## Setup

### 1 — Install the websockets Python package into Blender

Blender ships with its own Python interpreter. You need to install the
`websockets` package into it once.

Find your Blender Python path (example on macOS) :
```
/Applications/Blender.app/Contents/Resources/4.2/python/bin/python3.11
```

Then run :
```bash
/path/to/blender/python -m pip install websockets
```

### 2 — Install the addon in Blender

1. Open Blender
2. Go to `Edit > Preferences > Add-ons > Install`
3. Select `bridges/blender/polybridge_addon.py`
4. Enable the addon "3D View: polybridge-mcp Connector"

### 3 — Start the WebSocket server

1. In the 3D Viewport, press `N` to open the side panel
2. Find the "polybridge" tab
3. Click "Start Server" — it turns green when running

### 4 — Enable the bridge in config

```json
"blender": {
  "enabled": true,
  "wsPort" : 9877
}
```

## Available tools

| Tool | Description |
|---|---|
| `blender_create_object` | Create mesh, curve, light, camera, or empty |
| `blender_apply_material` | Apply PBR material (color, metallic, roughness) |
| `blender_render_scene` | Render and return base64 PNG image |
| `blender_execute_script` | Run arbitrary Blender Python code |
| `blender_list_objects` | List all objects in the current scene |

## Example interactions

```
"Create a red sphere at position 2, 0, 0"
"Add four cylinder towers at the corners of the castle body"
"Apply a shiny gold material to the crown object"
"Render the scene at 1920x1080"
"List all objects in the current scene"
```

## Supported mesh types

CUBE, SPHERE, UV_SPHERE, ICO_SPHERE, CYLINDER, CONE, PLANE, TORUS, MONKEY

## Notes

- Renders can take several seconds to minutes depending on samples and scene complexity.
- The `blender_execute_script` tool runs arbitrary Python. Only use it when you trust the LLM output.
- The WebSocket server binds to localhost only — it is not accessible from other machines.
