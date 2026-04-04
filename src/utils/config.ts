/**
 * src/utils/config.ts
 *
 * Configuration loading and validation.
 *
 * Why validate with Zod ?
 * -----------------------
 * JSON config files can contain typos or missing fields. Without validation,
 * those errors surface deep inside the application as mysterious crashes.
 * Zod parses the config at startup and returns clear, actionable error messages
 * if something is wrong — for example :
 *
 *   "bridges.n8n.baseUrl : Expected string, received undefined"
 *
 * This is much better than a cryptic "Cannot read properties of undefined" later.
 *
 * Zod is also a runtime library. TypeScript types are erased at runtime, so they
 * cannot validate a JSON file on their own. Zod bridges that gap.
 */

import fs   from 'fs'
import path from 'path'
import { z } from 'zod'

import type { PolybridgeConfig } from '../types/index.js'

// ---------------------------------------------------------------------------
// Zod schemas — one per config section
// ---------------------------------------------------------------------------

// The pedagogy section controls the PTL logger behavior.
const PedagogySchema = z.object({
  enabled  : z.boolean().default(true),
  verbosity: z.enum(['silent', 'normal', 'verbose', 'debug']).default('normal'),
  logFile  : z.string().nullable().default(null),
})

const N8nBridgeSchema = z.object({
  enabled: z.boolean().default(false),
  baseUrl: z.string().url().default('http://localhost:5678'),
  apiKey : z.string().default(''),
})

const BlenderBridgeSchema = z.object({
  enabled: z.boolean().default(false),
  wsPort : z.number().int().min(1024).max(65535).default(9877),
})

const NotionBridgeSchema = z.object({
  enabled: z.boolean().default(false),
  apiKey : z.string().default(''),
})

const FilesystemBridgeSchema = z.object({
  enabled     : z.boolean().default(true),
  allowedPaths: z.array(z.string()).min(1).default(['./workspace']),
  allowWrite  : z.boolean().default(true),
  allowDelete : z.boolean().default(false),
})

// The root schema composes all section schemas.
const PolybridgeConfigSchema = z.object({
  server: z.object({
    name    : z.string().default('polybridge-mcp'),
    version : z.string().default('1.0.0'),
    pedagogy: PedagogySchema,
  }),
  bridges: z.object({
    n8n       : N8nBridgeSchema,
    blender   : BlenderBridgeSchema,
    notion    : NotionBridgeSchema,
    filesystem: FilesystemBridgeSchema,
  }),
})

// ---------------------------------------------------------------------------
// Public function
// ---------------------------------------------------------------------------

/**
 * Load and validate the configuration file.
 *
 * The function tries three locations in order :
 *   1. The path given in the POLYBRIDGE_CONFIG environment variable
 *   2. ./polybridge-mcp.config.json (relative to the current working directory)
 *   3. A built-in set of safe defaults (all bridges disabled except filesystem)
 *
 * @returns A validated PolybridgeConfig object, guaranteed to match the schema.
 */
export function loadConfig(): PolybridgeConfig {
  const configPath = resolveConfigPath()

  let raw: unknown = {}

  if (configPath) {
    try {
      const content = fs.readFileSync(configPath, 'utf-8')
      raw = JSON.parse(content)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // We cannot use the PTL logger here because it hasn't been instantiated
      // yet — config loading comes first.
      process.stderr.write(
        `[polybridge] Config file error at ${configPath}: ${msg}\n` +
        `[polybridge] Falling back to defaults.\n`
      )
    }
  } else {
    process.stderr.write(
      `[polybridge] No config file found. Using safe defaults.\n` +
      `[polybridge] Copy polybridge-mcp.config.example.json to create one.\n`
    )
  }

  // Zod's .parse() throws a ZodError with detailed messages if validation fails.
  // .safeParse() would return an error object instead of throwing — use that
  // when you want to handle errors gracefully without try/catch.
  const result = PolybridgeConfigSchema.safeParse(raw)

  if (!result.success) {
    // Format Zod's error messages for readability.
    const issues = result.error.issues
      .map(i => `  - ${i.path.join('.')} : ${i.message}`)
      .join('\n')

    process.stderr.write(
      `[polybridge] Configuration is invalid :\n${issues}\n` +
      `[polybridge] Please fix your config file and restart.\n`
    )
    process.exit(1)
  }

  return result.data as PolybridgeConfig
}

/** Try to find the config file. Returns null if nothing is found. */
function resolveConfigPath(): string | null {
  // 1. Environment variable.
  if (process.env.POLYBRIDGE_CONFIG) {
    return path.resolve(process.env.POLYBRIDGE_CONFIG)
  }

  // 2. Default location next to the process working directory.
  const defaultPath = path.resolve(process.cwd(), 'polybridge-mcp.config.json')
  if (fs.existsSync(defaultPath)) {
    return defaultPath
  }

  return null
}
