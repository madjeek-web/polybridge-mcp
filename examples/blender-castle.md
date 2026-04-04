# Example : Creating a 3D castle in Blender

This walkthrough shows exactly what happens when you tell Claude to build a
3D scene in Blender through polybridge-mcp. It is designed for beginners.

---

## Prerequisites

- polybridge-mcp running with the Blender bridge enabled
- Blender open with the polybridge addon running (green button in the N panel)
- Claude Desktop connected to your polybridge server

---

## Step 1 : Give the instruction

Type this in Claude Desktop :

```
Create a small medieval castle in Blender. Use four cylinders as towers,
a cube as the main body, and give everything a dark gray stone material.
Then render the scene and show me the result.
```

---

## What happens next

Claude breaks down the instruction into a sequence of tool calls. Each one is
logged by the PTL. Here is what you would see with `verbosity: "verbose"` :

```
09:12:01 [polybridge] ► incoming_request  Tool call received from LLM
                       Tool: blender_create_object
                       { objectType: "MESH", meshType: "CUBE", name: "CastleBody",
                         location: [0, 0, 0], scale: [6, 4, 3] }

09:12:01 [polybridge] ⇢ routing           Routing to blender bridge

09:12:01 [polybridge] ⇒ [blender]         Dispatching to Blender WebSocket

09:12:01 [polybridge] ↗ [blender]         WebSocket → Blender : create_object [a3f2c1]

09:12:01 [polybridge] ↙ [blender]         Blender responded

09:12:01 [polybridge] ✓ [blender]         Tool call succeeded (89ms)
```

Then Claude creates the four towers, one by one :

```
09:12:02 [polybridge] ► blender_create_object  Tower_NW (CYLINDER, location [-5, -3, 0])
09:12:02 [polybridge] ✓ (94ms)

09:12:02 [polybridge] ► blender_create_object  Tower_NE (CYLINDER, location [ 5, -3, 0])
09:12:02 [polybridge] ✓ (91ms)

09:12:03 [polybridge] ► blender_create_object  Tower_SW (CYLINDER, location [-5,  3, 0])
09:12:03 [polybridge] ✓ (88ms)

09:12:03 [polybridge] ► blender_create_object  Tower_SE (CYLINDER, location [ 5,  3, 0])
09:12:03 [polybridge] ✓ (92ms)
```

Then the material :

```
09:12:04 [polybridge] ► blender_apply_material
                       { objectName: "CastleBody", materialName: "Stone",
                         color: [0.2, 0.2, 0.2, 1.0], roughness: 0.9 }
09:12:04 [polybridge] ✓ (76ms)
```

Finally the render :

```
09:12:04 [polybridge] ↗ [blender]  Rendering scene at 800x600, 64 samples...
09:12:17 [polybridge] ↙ [blender]  Render complete (12843ms)
09:12:17 [polybridge] ✓ Tool call succeeded
```

The render appears as an image inline in Claude Desktop.

---

## Understanding what just happened

Claude did not write a Python script. It did not open Blender manually. It
called a sequence of structured tools, each with a precise set of arguments,
and polybridge-mcp translated those tool calls into WebSocket messages that
the Blender addon executed as `bpy` (Blender Python API) commands.

This is the power of the three-part connection :

```
Claude (reasoning)
  → polybridge-mcp (translation)
    → Blender Python addon (execution)
```

---

## What to try next

- Change the instruction to include a drawbridge : "also add a flat plane in front of the entrance"
- Ask Claude to export the scene : "export the scene as a GLTF file to my workspace folder"
- Ask Claude to document it : "create a Notion page describing the scene you just built"
  (requires the Notion bridge to also be enabled)
