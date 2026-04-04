/**
 * src/utils/logger.ts
 *
 * The Pedagogical Transparency Layer (PTL) logger.
 *
 * What is the PTL ?
 * -----------------
 * Most MCP servers are black boxes : the LLM calls a tool and something
 * happens. Nobody explains what happened inside. The PTL fixes that.
 *
 * Every meaningful step inside polybridge-mcp emits a PTL event. The logger
 * here collects those events and formats them in plain, readable English.
 * The result is a live, step-by-step commentary of what the server is doing.
 *
 * This is particularly useful for :
 *   - Students learning how MCP works
 *   - Teachers demonstrating AI-tool integration in a classroom
 *   - Junior developers debugging their first MCP integration
 *
 * How it works :
 * --------------
 * 1. Code throughout the server calls `ptl.emit(event)`.
 * 2. The logger formats and writes the event based on the configured verbosity.
 * 3. Output goes to stderr (so it does not interfere with MCP's stdio transport)
 *    and optionally to a log file.
 *
 * MCP and stdio :
 * ---------------
 * The MCP protocol communicates over stdin/stdout (stdio transport). This means
 * every byte written to stdout is interpreted as a protocol message. All human-
 * readable output from the PTL MUST go to stderr to avoid breaking the protocol.
 */

import fs   from 'fs'
import path from 'path'

import type { PtlEvent, PtlLevel, PedagogyConfig } from '../types/index.js'

// ANSI color codes for terminal output.
// These only work in terminals that support ANSI escape sequences.
// They are automatically stripped when outputting to a file.
const COLORS = {
  reset  : '\x1b[0m',
  dim    : '\x1b[2m',
  bold   : '\x1b[1m',
  cyan   : '\x1b[36m',
  green  : '\x1b[32m',
  yellow : '\x1b[33m',
  red    : '\x1b[31m',
  gray   : '\x1b[90m',
  blue   : '\x1b[34m',
}

/** Maps a PTL phase to a short symbol for concise "normal" verbosity output */
const PHASE_SYMBOLS: Record<string, string> = {
  incoming_request  : '►',
  routing           : '⇢',
  bridge_dispatch   : '⇒',
  external_call     : '↗',
  external_response : '↙',
  result_format     : '◈',
  complete          : '✓',
  error             : '✗',
}

export class PtlLogger {
  private config   : PedagogyConfig
  private fileStream: fs.WriteStream | null = null

  constructor(config: PedagogyConfig) {
    this.config = config

    // Open the log file if one is configured.
    if (config.logFile) {
      const logPath = path.resolve(config.logFile)
      // The 'a' flag means append — we don't overwrite previous sessions.
      this.fileStream = fs.createWriteStream(logPath, { flags: 'a' })
      this.writeRaw(`\n${'='.repeat(60)}\n`)
      this.writeRaw(`polybridge-mcp session started at ${new Date().toISOString()}\n`)
      this.writeRaw(`${'='.repeat(60)}\n\n`)
    }
  }

  /**
   * Emit a PTL event. This is the main method called throughout the codebase.
   *
   * @param event - The event to emit. See PtlEvent in types/index.ts.
   */
  emit(event: PtlEvent): void {
    if (!this.config.enabled) return
    if (this.config.verbosity === 'silent') return

    // Apply verbosity filtering.
    // debug    -> show everything
    // verbose  -> show everything except debug-level events
    // normal   -> show only info-level events
    // silent   -> show nothing (handled above)
    if (this.config.verbosity === 'normal' && event.level !== 'info') return
    if (this.config.verbosity === 'verbose' && event.level === 'debug') return

    const formatted = this.format(event)
    this.writeRaw(formatted)
  }

  /**
   * Convenience method : log a simple info message without a full event object.
   */
  info(phase: PtlEvent['phase'], message: string, data?: unknown): void {
    this.emit({
      timestamp: new Date(),
      level    : 'info',
      phase,
      message,
      data,
    })
  }

  /**
   * Convenience method : log an error.
   */
  error(message: string, error?: unknown): void {
    this.emit({
      timestamp: new Date(),
      level    : 'error',
      phase    : 'error',
      message,
      data     : error,
    })
  }

  /** Format a PTL event into a human-readable string. */
  private format(event: PtlEvent): string {
    const symbol   = PHASE_SYMBOLS[event.phase] ?? '·'
    const time     = event.timestamp.toTimeString().slice(0, 8)
    const bridge   = event.bridge ? ` [${event.bridge}]` : ''
    const tool     = event.toolName ? ` ${event.toolName}` : ''
    const duration = event.durationMs !== undefined
      ? ` (${event.durationMs}ms)`
      : ''

    // The color depends on the event level.
    const levelColor: Record<PtlLevel, string> = {
      info : COLORS.cyan,
      warn : COLORS.yellow,
      error: COLORS.red,
      debug: COLORS.gray,
    }
    const color = levelColor[event.level]

    // Base line — always shown for any verbosity above silent.
    let output =
      `${COLORS.dim}${time}${COLORS.reset} ` +
      `${color}[polybridge]${COLORS.reset} ` +
      `${color}${symbol}${COLORS.reset}` +
      `${COLORS.bold}${bridge}${tool}${COLORS.reset} ` +
      `${event.message}${COLORS.dim}${duration}${COLORS.reset}\n`

    // In verbose mode, also print any attached data.
    if (this.config.verbosity === 'verbose' && event.data !== undefined) {
      const dataStr = JSON.stringify(event.data, null, 2)
        .split('\n')
        .map(line => `              ${COLORS.gray}${line}${COLORS.reset}`)
        .join('\n')
      output += dataStr + '\n'
    }

    return output
  }

  /** Write a raw string to stderr and optionally to the log file. */
  private writeRaw(text: string): void {
    // stderr does not interfere with the MCP stdio transport.
    process.stderr.write(text)

    // Strip ANSI codes before writing to the log file.
    if (this.fileStream) {
      // This regex matches ANSI escape sequences.
      const clean = text.replace(/\x1b\[[0-9;]*m/g, '')
      this.fileStream.write(clean)
    }
  }

  /** Close the file stream cleanly when the server shuts down. */
  close(): void {
    if (this.fileStream) {
      this.fileStream.end()
    }
  }
}
