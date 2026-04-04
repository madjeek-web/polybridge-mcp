/**
 * src/__tests__/registry.test.ts
 *
 * Unit tests for the ToolRegistry class.
 *
 * What are unit tests ?
 * ---------------------
 * A unit test checks one small, isolated piece of code in isolation.
 * "Isolated" means : we do not start a real server, we do not connect to
 * n8n, we do not open Blender. We only test the logic of the class itself.
 *
 * For the ToolRegistry, we want to verify :
 *   - Tools are registered correctly
 *   - The registry returns the right bridge for a given tool name
 *   - Duplicate tool names are detected and logged
 *   - Disabled bridges are skipped
 *   - The meta-tool registration works
 *
 * We use Jest as the test runner. Run tests with : npm test
 *
 * What is a mock ?
 * ----------------
 * A mock is a fake version of a dependency. Instead of using the real
 * PtlLogger (which writes to stderr), we pass a mock that records what
 * was called so we can assert on it.
 *
 * Jest provides jest.fn() to create mock functions.
 */

import { ToolRegistry } from '../server/registry.js'
import type { BaseBridge }     from '../adapters/bridge/base.js'
import type { PtlLogger }      from '../utils/logger.js'
import type { ToolDefinition, BridgeName, BridgeStatus } from '../types/index.js'

// ---------------------------------------------------------------------------
// Helpers — minimal mock objects
// ---------------------------------------------------------------------------

/** Create a minimal mock logger that does not write to stderr. */
function mockLogger(): PtlLogger {
  return {
    emit   : jest.fn(),
    info   : jest.fn(),
    error  : jest.fn(),
    close  : jest.fn(),
  } as unknown as PtlLogger
}

/** Create a minimal mock bridge with a custom name, status, and tool list. */
function mockBridge(opts: {
  name   : BridgeName
  status : BridgeStatus
  tools  : ToolDefinition[]
}): BaseBridge {
  return {
    name       : opts.name,
    description: `Mock ${opts.name} bridge`,
    status     : opts.status,
    init       : jest.fn(),
    getTools   : jest.fn().mockReturnValue(opts.tools),
    executeTool: jest.fn(),
    destroy    : jest.fn(),
  } as unknown as BaseBridge
}

/** Create a minimal tool definition for testing. */
function mockTool(name: string, bridge: BridgeName): ToolDefinition {
  return {
    name,
    description       : `Test tool ${name}`,
    inputSchema       : { type: 'object', properties: {} },
    bridge,
    pedagogicalSummary: `Mock tool ${name}`,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ToolRegistry', () => {
  let log     : PtlLogger
  let registry: ToolRegistry

  // Reset the registry and logger before each test.
  beforeEach(() => {
    log      = mockLogger()
    registry = new ToolRegistry(log)
  })

  // -------------------------------------------------------------------------
  describe('register()', () => {

    it('registers tools from a connected bridge', () => {
      const bridge = mockBridge({
        name  : 'n8n',
        status: 'connected',
        tools : [
          mockTool('n8n_list_workflows', 'n8n'),
          mockTool('n8n_execute_workflow', 'n8n'),
        ],
      })

      registry.register(bridge)

      expect(registry.toolCount).toBe(2)
    })

    it('skips tool registration for disabled bridges', () => {
      const bridge = mockBridge({
        name  : 'blender',
        status: 'disabled',
        tools : [mockTool('blender_render_scene', 'blender')],
      })

      registry.register(bridge)

      // Disabled bridges should contribute no tools.
      expect(registry.toolCount).toBe(0)
    })

    it('logs a warning when two bridges register the same tool name', () => {
      const bridge1 = mockBridge({
        name  : 'n8n',
        status: 'connected',
        tools : [mockTool('duplicate_tool', 'n8n')],
      })

      const bridge2 = mockBridge({
        name  : 'notion',
        status: 'connected',
        tools : [mockTool('duplicate_tool', 'notion')],
      })

      registry.register(bridge1)
      registry.register(bridge2)

      // The logger's emit() should have been called with a warning.
      expect(log.emit).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'warn' })
      )
    })

  })

  // -------------------------------------------------------------------------
  describe('resolve()', () => {

    it('returns the correct bridge for a registered tool', () => {
      const bridge = mockBridge({
        name  : 'filesystem',
        status: 'connected',
        tools : [mockTool('fs_read_file', 'filesystem')],
      })

      registry.register(bridge)

      const resolved = registry.resolve('fs_read_file')
      expect(resolved).toBe(bridge)
    })

    it('returns null for an unknown tool name', () => {
      const resolved = registry.resolve('nonexistent_tool')
      expect(resolved).toBeNull()
    })

  })

  // -------------------------------------------------------------------------
  describe('getAll()', () => {

    it('returns all registered tool definitions', () => {
      const bridge = mockBridge({
        name  : 'n8n',
        status: 'connected',
        tools : [
          mockTool('n8n_list_workflows',  'n8n'),
          mockTool('n8n_execute_workflow','n8n'),
          mockTool('n8n_activate_workflow','n8n'),
        ],
      })

      registry.register(bridge)

      const all = registry.getAll()
      expect(all).toHaveLength(3)
      expect(all.map(t => t.name)).toContain('n8n_list_workflows')
    })

    it('includes meta-tools after registerMetaTools() is called', () => {
      registry.registerMetaTools()

      const all = registry.getAll()
      const metaTool = all.find(t => t.name === 'polybridge_list_bridges')
      expect(metaTool).toBeDefined()
    })

  })

  // -------------------------------------------------------------------------
  describe('toolCount', () => {

    it('does not count meta-tools', () => {
      const bridge = mockBridge({
        name  : 'n8n',
        status: 'connected',
        tools : [mockTool('n8n_list_workflows', 'n8n')],
      })

      registry.register(bridge)
      registry.registerMetaTools()

      // toolCount should be 1 (the n8n tool), not 2 (n8n + meta-tool).
      expect(registry.toolCount).toBe(1)
    })

  })

  // -------------------------------------------------------------------------
  describe('getBridgeStatus()', () => {

    it('includes bridge names and statuses in the output', () => {
      const n8nBridge = mockBridge({
        name  : 'n8n',
        status: 'connected',
        tools : [],
      })

      const blenderBridge = mockBridge({
        name  : 'blender',
        status: 'disabled',
        tools : [],
      })

      registry.register(n8nBridge)
      registry.register(blenderBridge)

      const status = registry.getBridgeStatus()
      expect(status).toContain('n8n')
      expect(status).toContain('connected')
      expect(status).toContain('blender')
      expect(status).toContain('disabled')
    })

  })

})
