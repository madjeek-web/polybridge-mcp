# workspace/

This directory is the default sandbox for the filesystem bridge.

The LLM can read and write files here when the filesystem bridge is enabled
with `allowedPaths: ["./workspace"]`.

The contents of this directory are not tracked by Git (see `.gitignore`).
It is safe to put test files, generated outputs, and notes here.

---

**To change the allowed directories**, edit `polybridge-mcp.config.json` :

```json
"filesystem": {
  "allowedPaths": ["./workspace", "/path/to/another/folder"]
}
```

Never point `allowedPaths` at sensitive directories like your home folder or
system directories.
