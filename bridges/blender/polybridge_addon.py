"""
bridges/blender/polybridge_addon.py

Blender addon that opens a WebSocket server inside Blender, allowing
polybridge-mcp to control Blender programmatically via JSON commands.

How to install this addon :
  1. Open Blender.
  2. Go to Edit > Preferences > Add-ons > Install.
  3. Select this file.
  4. Enable the addon "3D View: polybridge-mcp Connector".
  5. In the 3D Viewport side panel (press N), find the "polybridge" tab.
  6. Click "Start Server". The button turns green when connected.

How this addon works :
  This addon uses Blender's built-in asyncio support (available since
  Blender 2.93) and the `websockets` library to run a WebSocket server
  inside Blender's Python environment.

  When polybridge-mcp sends a JSON command, the addon :
    1. Parses the JSON.
    2. Identifies the command name (e.g., "create_object").
    3. Calls the corresponding bpy function.
    4. Returns the result as a JSON response with the same reqId.

Required Python packages :
  Blender ships with its own Python interpreter. Install websockets into it :
    {blender_path}/python/bin/python -m pip install websockets

Blender Python API reference :
  https://docs.blender.org/api/current/

Author : Fabien Conéjéro (FC84)
License : MIT
"""

import asyncio
import base64
import json
import os
import sys
import tempfile
import threading
from typing import Any

import bpy  # Blender Python API — only available inside Blender

try:
    import websockets
    from websockets.server import serve
    WEBSOCKETS_AVAILABLE = True
except ImportError:
    WEBSOCKETS_AVAILABLE = False

# ---------------------------------------------------------------------------
# Addon metadata — Blender reads these values to display the addon in
# the preferences panel.
# ---------------------------------------------------------------------------

bl_info = {
    "name"       : "polybridge-mcp Connector",
    "description": "WebSocket server that allows polybridge-mcp to control Blender via MCP.",
    "author"     : "Fabien Conéjéro (FC84)",
    "version"    : (1, 0, 0),
    "blender"    : (3, 0, 0),
    "location"   : "3D Viewport > N Panel > polybridge",
    "category"   : "3D View",
}

# Default WebSocket port. Must match wsPort in polybridge-mcp.config.json.
DEFAULT_PORT = 9877

# Global reference to the running server (used for shutdown).
_server_task: Any = None
_loop: Any = None
_thread: Any = None


# ---------------------------------------------------------------------------
# Command handlers
# Each function corresponds to a command name sent from TypeScript.
# All handlers receive a dict of arguments and return a dict for the response.
# ---------------------------------------------------------------------------

def handle_create_object(args: dict) -> dict:
    """Create a new 3D object in the current scene."""
    object_type = args.get("object_type", "MESH")
    mesh_type   = args.get("mesh_type", "CUBE")
    name        = args.get("name", "Object")
    location    = args.get("location", [0, 0, 0])
    scale       = args.get("scale", [1, 1, 1])

    # Deselect all existing objects first so only the new one is active.
    bpy.ops.object.select_all(action="DESELECT")

    # Create the object based on type.
    if object_type == "MESH":
        mesh_ops = {
            "CUBE"      : bpy.ops.mesh.primitive_cube_add,
            "SPHERE"    : bpy.ops.mesh.primitive_uv_sphere_add,
            "UV_SPHERE" : bpy.ops.mesh.primitive_uv_sphere_add,
            "ICO_SPHERE": bpy.ops.mesh.primitive_ico_sphere_add,
            "CYLINDER"  : bpy.ops.mesh.primitive_cylinder_add,
            "CONE"      : bpy.ops.mesh.primitive_cone_add,
            "PLANE"     : bpy.ops.mesh.primitive_plane_add,
            "TORUS"     : bpy.ops.mesh.primitive_torus_add,
        }
        op = mesh_ops.get(mesh_type, bpy.ops.mesh.primitive_cube_add)
        op(location=location)
    elif object_type == "LIGHT":
        bpy.ops.object.light_add(type="POINT", location=location)
    elif object_type == "CAMERA":
        bpy.ops.object.camera_add(location=location)
    elif object_type == "EMPTY":
        bpy.ops.object.empty_add(location=location)
    else:
        return {"error": f"Unknown object_type : {object_type}"}

    # Rename and scale the newly created object.
    obj = bpy.context.active_object
    if obj:
        obj.name  = name
        obj.scale = scale

    return {"name": name, "type": object_type}


def handle_apply_material(args: dict) -> dict:
    """Apply a PBR material to an existing object."""
    object_name   = args.get("object_name")
    material_name = args.get("material_name", "Material")
    color         = args.get("color", [0.8, 0.8, 0.8, 1.0])
    metallic      = args.get("metallic", 0.0)
    roughness     = args.get("roughness", 0.5)

    obj = bpy.data.objects.get(object_name)
    if not obj:
        return {"error": f"Object '{object_name}' not found in scene"}

    # Create or reuse a material.
    mat = bpy.data.materials.get(material_name) or bpy.data.materials.new(name=material_name)
    mat.use_nodes = True

    # Get the Principled BSDF node (the main PBR shader in Blender).
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Metallic"].default_value   = metallic
        bsdf.inputs["Roughness"].default_value  = roughness

    # Assign the material to the object.
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)

    return {"material": material_name, "object": object_name}


def handle_render_scene(args: dict) -> dict:
    """Render the scene and return the result as a base64 PNG."""
    width   = int(args.get("width",   800))
    height  = int(args.get("height",  600))
    samples = int(args.get("samples", 64))

    scene                     = bpy.context.scene
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.cycles.samples      = samples
    scene.render.image_settings.file_format = "PNG"

    # Save to a temp file.
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        filepath = f.name

    scene.render.filepath = filepath
    bpy.ops.render.render(write_still=True)

    # Read the rendered file and encode to base64.
    with open(filepath, "rb") as f:
        image_b64 = base64.b64encode(f.read()).decode("utf-8")

    os.unlink(filepath)

    return {"image_b64": image_b64}


def handle_list_objects(args: dict) -> dict:
    """Return a list of all objects in the current scene."""
    objects = [
        {"name": obj.name, "type": obj.type}
        for obj in bpy.context.scene.objects
    ]
    return {"objects": objects}


def handle_exec_script(args: dict) -> dict:
    """Execute arbitrary Blender Python code. Use carefully."""
    script = args.get("script", "")
    # A local namespace for exec() to avoid polluting the global scope.
    local_ns: dict = {}
    exec(script, {"bpy": bpy}, local_ns)  # noqa: S102
    return {"result": str(local_ns.get("result", "Script executed."))}


# Map command names to handler functions.
COMMAND_HANDLERS = {
    "create_object" : handle_create_object,
    "apply_material": handle_apply_material,
    "render_scene"  : handle_render_scene,
    "list_objects"  : handle_list_objects,
    "exec_script"   : handle_exec_script,
}


# ---------------------------------------------------------------------------
# WebSocket server
# ---------------------------------------------------------------------------

async def handle_client(websocket: Any) -> None:
    """Handle a single WebSocket connection from polybridge-mcp."""
    async for raw_message in websocket:
        try:
            msg     = json.loads(raw_message)
            command = msg.get("command", "")
            args    = msg.get("args", {})
            req_id  = msg.get("reqId", "")

            handler = COMMAND_HANDLERS.get(command)

            if handler:
                # Execute the Blender command in the main thread context.
                # bpy operations must run in the main thread; websocket handlers
                # run in an asyncio event loop which may be on a separate thread.
                result = handler(args)
                response = {"reqId": req_id, "success": True, "data": result}
            else:
                response = {
                    "reqId"  : req_id,
                    "success": False,
                    "error"  : f"Unknown command : {command}",
                }

        except Exception as err:  # noqa: BLE001
            response = {
                "reqId"  : req_id if "req_id" in dir() else "",
                "success": False,
                "error"  : str(err),
            }

        await websocket.send(json.dumps(response))


async def start_websocket_server(port: int) -> None:
    """Start the WebSocket server and run forever."""
    global _server_task
    async with serve(handle_client, "localhost", port) as server:
        _server_task = server
        await asyncio.Future()  # run forever


def run_server_in_thread(port: int) -> None:
    """Launch the asyncio event loop in a background thread."""
    global _loop
    _loop = asyncio.new_event_loop()
    asyncio.set_event_loop(_loop)
    _loop.run_until_complete(start_websocket_server(port))


# ---------------------------------------------------------------------------
# Blender UI panel and operators
# ---------------------------------------------------------------------------

class POLYBRIDGE_OT_StartServer(bpy.types.Operator):
    """Start the polybridge WebSocket server."""
    bl_idname = "polybridge.start_server"
    bl_label  = "Start Server"

    def execute(self, context: bpy.types.Context) -> set:
        global _thread

        if not WEBSOCKETS_AVAILABLE:
            self.report({"ERROR"}, "websockets package not installed. Run: blender_python -m pip install websockets")
            return {"CANCELLED"}

        port = context.scene.polybridge_port

        _thread = threading.Thread(
            target=run_server_in_thread,
            args=(port,),
            daemon=True,
        )
        _thread.start()

        context.scene.polybridge_running = True
        self.report({"INFO"}, f"polybridge server started on port {port}")
        return {"FINISHED"}


class POLYBRIDGE_OT_StopServer(bpy.types.Operator):
    """Stop the polybridge WebSocket server."""
    bl_idname = "polybridge.stop_server"
    bl_label  = "Stop Server"

    def execute(self, context: bpy.types.Context) -> set:
        global _loop, _thread
        if _loop:
            _loop.call_soon_threadsafe(_loop.stop)
        context.scene.polybridge_running = False
        self.report({"INFO"}, "polybridge server stopped")
        return {"FINISHED"}


class POLYBRIDGE_PT_Panel(bpy.types.Panel):
    """Side panel in the 3D Viewport for controlling the server."""
    bl_label      = "polybridge-mcp"
    bl_idname     = "POLYBRIDGE_PT_panel"
    bl_space_type = "VIEW_3D"
    bl_region_type= "UI"
    bl_category   = "polybridge"

    def draw(self, context: bpy.types.Context) -> None:
        layout  = self.layout
        scene   = context.scene
        running = scene.polybridge_running

        # Status indicator.
        status_row = layout.row()
        status_row.label(text=f"Status : {'Running' if running else 'Stopped'}")

        # Port field.
        port_row = layout.row()
        port_row.prop(scene, "polybridge_port", text="Port")
        port_row.enabled = not running

        # Start/Stop button.
        layout.separator()
        if running:
            layout.operator("polybridge.stop_server", icon="PAUSE")
        else:
            layout.operator("polybridge.start_server", icon="PLAY")

        if not WEBSOCKETS_AVAILABLE:
            layout.label(text="websockets not installed!", icon="ERROR")


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

CLASSES = [
    POLYBRIDGE_OT_StartServer,
    POLYBRIDGE_OT_StopServer,
    POLYBRIDGE_PT_Panel,
]


def register() -> None:
    for cls in CLASSES:
        bpy.utils.register_class(cls)

    bpy.types.Scene.polybridge_port    = bpy.props.IntProperty(name="Port", default=DEFAULT_PORT, min=1024, max=65535)
    bpy.types.Scene.polybridge_running = bpy.props.BoolProperty(name="Running", default=False)


def unregister() -> None:
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)

    del bpy.types.Scene.polybridge_port
    del bpy.types.Scene.polybridge_running


if __name__ == "__main__":
    register()
