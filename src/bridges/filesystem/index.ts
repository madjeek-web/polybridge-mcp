/**
 * src/bridges/filesystem/index.ts
 *
 * The Filesystem bridge.
 *
 * This bridge gives an LLM access to files on the host machine. Access is
 * strictly sandboxed : the LLM can only read and write files inside the
 * directories listed in `allowedPaths`. It cannot access anything outside.
 *
 * Why sandboxing matters :
 * ------------------------
 * Without restrictions, an LLM could read sensitive files like ~/.ssh/id_rsa
 * or overwrite system files. The allowedPaths list prevents that by ensuring
 * all file paths are validated before any operation.
 *
 * The path.resolve + startsWith pattern :
 * -----------------------------------------
 * A naive check like `filePath.startsWith(allowedDir)` can be bypassed with
 * path traversal attacks (e.g., `/allowed/../../secret`). Using path.resolve()
 * first normalizes the path, turning `..` sequences into absolute paths, before
 * checking the prefix. This closes the traversal vulnerability.
 */

import fs   from 'fs/promises'
import path from 'path'

import { BaseBridge } from '../../adapters/bridge/base.js'

import type {
  BridgeName,
  ToolDefinition,
  ToolResult,
} from '../../types/index.js'

export class FilesystemBridge extends BaseBridge {
  readonly name       : BridgeName = 'filesystem'
  readonly description: string     = 'Read and write files in sandboxed workspace directories'

  // Resolved absolute paths of allowed directories.
  private allowedDirs: string[] = []

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async init(): Promise<void> {
    if (!this.isEnabled()) {
      this._status = 'disabled'
      return
    }

    const cfg = this.config.bridges.filesystem

    // Resolve all allowed paths to absolute, canonical paths.
    this.allowedDirs = cfg.allowedPaths.map(p => path.resolve(p))

    // Create workspace directories that do not yet exist.
    for (const dir of this.allowedDirs) {
      await fs.mkdir(dir, { recursive: true }).catch(() => {})
    }

    this._status = 'connected'
    this.log.info('bridge_dispatch', `Filesystem bridge ready. Allowed dirs : ${this.allowedDirs.join(', ')}`)
  }

  // ---------------------------------------------------------------------------
  // Tool definitions
  // ---------------------------------------------------------------------------

  getTools(): ToolDefinition[] {
    const cfg = this.config.bridges.filesystem

    const tools: ToolDefinition[] = [
      {
        name       : 'fs_read_file',
        description: 'Read the contents of a file. Only files inside the configured allowed directories can be read.',
        inputSchema: {
          type      : 'object',
          properties: {
            filePath: {
              type       : 'string',
              description: 'Path to the file to read. Relative paths are resolved from the first allowed directory.',
            },
          },
          required: ['filePath'],
        },
        bridge             : 'filesystem',
        pedagogicalSummary : 'Uses Node.js fs.readFile() after validating the path is inside an allowed directory',
      },
      {
        name       : 'fs_list_directory',
        description: 'List all files and subdirectories inside a directory.',
        inputSchema: {
          type      : 'object',
          properties: {
            dirPath: {
              type       : 'string',
              description: 'Path to the directory to list.',
            },
          },
          required: ['dirPath'],
        },
        bridge             : 'filesystem',
        pedagogicalSummary : 'Uses Node.js fs.readdir() with { withFileTypes: true } to get entry types',
      },
    ]

    // Write and delete tools are conditional on config settings.
    if (cfg.allowWrite) {
      tools.push({
        name       : 'fs_write_file',
        description: 'Write content to a file. Creates the file if it does not exist, overwrites if it does.',
        inputSchema: {
          type      : 'object',
          properties: {
            filePath: {
              type       : 'string',
              description: 'Path to the file to write.',
            },
            content: {
              type       : 'string',
              description: 'The content to write into the file.',
            },
          },
          required: ['filePath', 'content'],
        },
        bridge             : 'filesystem',
        pedagogicalSummary : 'Uses Node.js fs.writeFile() after validating the path',
      })
    }

    if (cfg.allowDelete) {
      tools.push({
        name       : 'fs_delete_file',
        description: 'Delete a file. This action is irreversible.',
        inputSchema: {
          type      : 'object',
          properties: {
            filePath: {
              type       : 'string',
              description: 'Path to the file to delete.',
            },
          },
          required: ['filePath'],
        },
        bridge             : 'filesystem',
        pedagogicalSummary : 'Uses Node.js fs.unlink() after validating the path',
      })
    }

    return tools
  }

  // ---------------------------------------------------------------------------
  // Tool execution
  // ---------------------------------------------------------------------------

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (this._status !== 'connected') {
      return this.fail(`Filesystem bridge is not connected (status: ${this._status}).`)
    }

    try {
      switch (toolName) {
        case 'fs_read_file':      return await this.readFile(args)
        case 'fs_write_file':     return await this.writeFile(args)
        case 'fs_list_directory': return await this.listDirectory(args)
        case 'fs_delete_file':    return await this.deleteFile(args)
        default:
          return this.fail(`Unknown filesystem tool : ${toolName}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return this.fail(`Filesystem error : ${msg}`)
    }
  }

  // ---------------------------------------------------------------------------
  // Individual tool handlers
  // ---------------------------------------------------------------------------

  private async readFile(args: Record<string, unknown>): Promise<ToolResult> {
    const resolved = this.resolveSafe(String(args['filePath']))
    if (!resolved) return this.fail(`Access denied : path is outside allowed directories.`)

    const content = await fs.readFile(resolved, 'utf-8')
    return this.ok(content)
  }

  private async writeFile(args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.config.bridges.filesystem.allowWrite) {
      return this.fail('Write access is disabled in the filesystem bridge config.')
    }

    const resolved = this.resolveSafe(String(args['filePath']))
    if (!resolved) return this.fail(`Access denied : path is outside allowed directories.`)

    // Create parent directory if needed.
    await fs.mkdir(path.dirname(resolved), { recursive: true })
    await fs.writeFile(resolved, String(args['content']), 'utf-8')

    return this.ok(`File written : ${resolved}`)
  }

  private async listDirectory(args: Record<string, unknown>): Promise<ToolResult> {
    const resolved = this.resolveSafe(String(args['dirPath']))
    if (!resolved) return this.fail(`Access denied : path is outside allowed directories.`)

    const entries  = await fs.readdir(resolved, { withFileTypes: true })
    const lines    = entries.map(e => `${e.isDirectory() ? 'd' : 'f'}  ${e.name}`)

    return this.ok(
      entries.length === 0
        ? '(empty directory)'
        : lines.join('\n')
    )
  }

  private async deleteFile(args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.config.bridges.filesystem.allowDelete) {
      return this.fail('Delete access is disabled in the filesystem bridge config.')
    }

    const resolved = this.resolveSafe(String(args['filePath']))
    if (!resolved) return this.fail(`Access denied : path is outside allowed directories.`)

    await fs.unlink(resolved)
    return this.ok(`File deleted : ${resolved}`)
  }

  // ---------------------------------------------------------------------------
  // Path validation
  // ---------------------------------------------------------------------------

  /**
   * Resolve and validate a file path.
   *
   * Returns the absolute resolved path if it is inside an allowed directory,
   * or null if the access should be denied.
   *
   * The double path.resolve call ensures that relative segments like `..`
   * are fully expanded before we compare prefixes.
   */
  private resolveSafe(inputPath: string): string | null {
    // If the path is relative, resolve it against the first allowed dir.
    const base     = this.allowedDirs[0] ?? process.cwd()
    const resolved = path.isAbsolute(inputPath)
      ? path.resolve(inputPath)
      : path.resolve(base, inputPath)

    const isAllowed = this.allowedDirs.some(dir => resolved.startsWith(dir + path.sep) || resolved === dir)

    return isAllowed ? resolved : null
  }
}
