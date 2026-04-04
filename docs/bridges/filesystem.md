# Filesystem bridge

## What it does

The filesystem bridge gives an LLM sandboxed access to files on your machine.
The LLM can read files, write new files, list directories, and (optionally)
delete files — but only within the directories you explicitly authorize.

## Security model

The bridge uses a strict allowlist. Only paths inside `allowedPaths` are
accessible. The check uses `path.resolve()` to expand `..` sequences before
comparing, which prevents path traversal attacks.

Example : if `allowedPaths` is `["./workspace"]`, then a request for
`../../etc/passwd` is rejected because its resolved path is outside the
allowed directory.

## Setup

The filesystem bridge is enabled by default with a `./workspace` sandbox.
No external services or API keys required.

```json
"filesystem": {
  "enabled"     : true,
  "allowedPaths": ["./workspace"],
  "allowWrite"  : true,
  "allowDelete" : false
}
```

The `./workspace` directory is created automatically at startup if it does
not exist.

## Available tools

| Tool | Always available | Requires allowWrite | Requires allowDelete |
|---|---|---|---|
| `fs_read_file` | yes | | |
| `fs_list_directory` | yes | | |
| `fs_write_file` | | yes | |
| `fs_delete_file` | | | yes |

## Configuration options

| Option | Type | Description |
|---|---|---|
| `allowedPaths` | string[] | List of directories the LLM can access. Always use relative or absolute paths that you control. |
| `allowWrite` | boolean | Whether the LLM can create and overwrite files. |
| `allowDelete` | boolean | Whether the LLM can delete files. Keep false unless needed. |

## Example interactions

```
"List all files in my workspace folder"
"Read the file workspace/notes.txt"
"Write a new file workspace/summary.md with the content: ..."
"What is inside the config file at workspace/settings.json ?"
```

## Safety recommendations

- Never add your home directory (`~` or `$HOME`) to `allowedPaths`.
- Never add system directories (`/etc`, `/usr`, `C:\Windows`).
- Keep `allowDelete` set to false unless you specifically need it.
- Use a dedicated workspace folder and keep it separate from your project files.
