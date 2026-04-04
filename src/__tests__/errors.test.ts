/**
 * src/__tests__/errors.test.ts
 *
 * Tests for the typed error classes.
 *
 * These tests verify that each error class :
 *   1. Is an instance of its own class (for instanceof checks)
 *   2. Is an instance of its parent classes (Error, PolybridgeError)
 *   3. Has the correct name and code
 *   4. Carries the expected metadata fields
 */

import {
  PolybridgeError,
  ConfigError,
  BridgeConnectionError,
  BridgeNotReadyError,
  ToolNotFoundError,
  ToolArgumentError,
  ExternalApiError,
  BlenderTimeoutError,
  PathTraversalError,
} from '../utils/errors.js'

describe('Typed error classes', () => {

  describe('PolybridgeError', () => {
    it('is an instance of Error', () => {
      const err = new PolybridgeError('test message', 'TEST_CODE')
      expect(err).toBeInstanceOf(Error)
      expect(err).toBeInstanceOf(PolybridgeError)
    })

    it('has the correct message and code', () => {
      const err = new PolybridgeError('something failed', 'SOMETHING_FAILED')
      expect(err.message).toBe('something failed')
      expect(err.code).toBe('SOMETHING_FAILED')
      expect(err.name).toBe('PolybridgeError')
    })
  })

  describe('ConfigError', () => {
    it('has the correct code', () => {
      const err = new ConfigError('config file not found')
      expect(err).toBeInstanceOf(PolybridgeError)
      expect(err.code).toBe('CONFIG_ERROR')
      expect(err.name).toBe('ConfigError')
    })
  })

  describe('BridgeConnectionError', () => {
    it('includes the bridge name in message and field', () => {
      const err = new BridgeConnectionError('n8n', 'ECONNREFUSED')
      expect(err).toBeInstanceOf(PolybridgeError)
      expect(err.bridge).toBe('n8n')
      expect(err.message).toContain('n8n')
      expect(err.message).toContain('ECONNREFUSED')
      expect(err.code).toBe('BRIDGE_CONNECTION_ERROR')
    })
  })

  describe('BridgeNotReadyError', () => {
    it('includes bridge name and status', () => {
      const err = new BridgeNotReadyError('blender', 'disconnected')
      expect(err.bridge).toBe('blender')
      expect(err.message).toContain('disconnected')
      expect(err.code).toBe('BRIDGE_NOT_READY')
    })
  })

  describe('ToolNotFoundError', () => {
    it('includes the tool name', () => {
      const err = new ToolNotFoundError('mystery_tool')
      expect(err.toolName).toBe('mystery_tool')
      expect(err.message).toContain('mystery_tool')
      expect(err.code).toBe('TOOL_NOT_FOUND')
    })
  })

  describe('ToolArgumentError', () => {
    it('includes tool name, field name, and reason', () => {
      const err = new ToolArgumentError('n8n_execute_workflow', 'workflowId', 'must be a string')
      expect(err.toolName).toBe('n8n_execute_workflow')
      expect(err.field).toBe('workflowId')
      expect(err.message).toContain('workflowId')
      expect(err.message).toContain('must be a string')
    })
  })

  describe('ExternalApiError', () => {
    it('includes bridge, endpoint, status code, and body snippet', () => {
      const err = new ExternalApiError('n8n', '/api/v1/workflows', 401, 'Unauthorized')
      expect(err.bridge).toBe('n8n')
      expect(err.endpoint).toBe('/api/v1/workflows')
      expect(err.statusCode).toBe(401)
      expect(err.message).toContain('401')
      expect(err.message).toContain('Unauthorized')
    })
  })

  describe('BlenderTimeoutError', () => {
    it('includes command name and timeout value', () => {
      const err = new BlenderTimeoutError('render_scene', 15000)
      expect(err.command).toBe('render_scene')
      expect(err.timeoutMs).toBe(15000)
      expect(err.message).toContain('render_scene')
      expect(err.message).toContain('15000ms')
    })
  })

  describe('PathTraversalError', () => {
    it('includes the requested path', () => {
      const err = new PathTraversalError('../../etc/passwd')
      expect(err.requestedPath).toBe('../../etc/passwd')
      expect(err.message).toContain('../../etc/passwd')
      expect(err.code).toBe('PATH_TRAVERSAL_DENIED')
    })
  })

  describe('instanceof chain', () => {
    it('all errors are instanceof PolybridgeError', () => {
      const errors = [
        new ConfigError('x'),
        new BridgeConnectionError('n8n', 'x'),
        new BridgeNotReadyError('n8n', 'disconnected'),
        new ToolNotFoundError('x'),
        new ToolArgumentError('tool', 'field', 'reason'),
        new ExternalApiError('n8n', '/path', 500, 'body'),
        new BlenderTimeoutError('cmd', 1000),
        new PathTraversalError('/etc'),
      ]

      for (const err of errors) {
        expect(err).toBeInstanceOf(PolybridgeError)
        expect(err).toBeInstanceOf(Error)
      }
    })
  })

})
