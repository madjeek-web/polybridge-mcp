/**
 * src/__tests__/filesystem.test.ts
 *
 * Tests for the filesystem bridge's path validation logic.
 *
 * The most security-critical part of the filesystem bridge is the
 * `resolveSafe()` method, which prevents path traversal attacks.
 * This test suite verifies that it correctly allows safe paths and
 * blocks unsafe ones.
 *
 * Testing strategy :
 * ------------------
 * We test the bridge's `executeTool()` method end-to-end for the path
 * validation cases. We do this WITHOUT creating real files — we only
 * check that the bridge returns the expected ToolResult (allowed or denied).
 *
 * For tests that would create actual files, we use Node.js's built-in
 * `tmp` directory or a temp path created by Jest's `os.tmpdir()`.
 */

import os   from 'os'
import path from 'path'
import fs   from 'fs/promises'

import { FilesystemBridge }  from '../bridges/filesystem/index.js'
import type { PtlLogger }    from '../utils/logger.js'
import type { PolybridgeConfig } from '../types/index.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockLogger(): PtlLogger {
  return {
    emit : jest.fn(),
    info : jest.fn(),
    error: jest.fn(),
    close: jest.fn(),
  } as unknown as PtlLogger
}

function makeConfig(allowedPaths: string[], allowWrite = true, allowDelete = false): PolybridgeConfig {
  return {
    server : { name: 'test', version: '0.0.0', pedagogy: { enabled: false, verbosity: 'silent', logFile: null } },
    bridges: {
      n8n       : { enabled: false, baseUrl: '', apiKey: '' },
      blender   : { enabled: false, wsPort: 9877 },
      notion    : { enabled: false, apiKey: '' },
      filesystem: { enabled: true, allowedPaths, allowWrite, allowDelete },
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FilesystemBridge', () => {
  let tmpDir: string
  let log   : PtlLogger

  beforeAll(async () => {
    // Create a temporary directory for test files.
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'polybridge-test-'))
  })

  afterAll(async () => {
    // Clean up the temporary directory after all tests.
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  beforeEach(() => {
    log = mockLogger()
  })

  // -------------------------------------------------------------------------
  describe('path traversal protection', () => {

    it('denies access to a path outside allowedPaths', async () => {
      const config = makeConfig([tmpDir])
      const bridge = new FilesystemBridge(config, log)
      await bridge.init()

      const result = await bridge.executeTool('fs_read_file', {
        filePath: path.join(tmpDir, '../../etc/passwd'),
      })

      expect(result.isError).toBe(true)
      expect(result.content[0]?.text).toContain('Access denied')
    })

    it('allows access to a file inside allowedPaths', async () => {
      const testFile = path.join(tmpDir, 'test.txt')
      await fs.writeFile(testFile, 'hello polybridge')

      const config = makeConfig([tmpDir])
      const bridge = new FilesystemBridge(config, log)
      await bridge.init()

      const result = await bridge.executeTool('fs_read_file', {
        filePath: testFile,
      })

      expect(result.isError).toBeUndefined()
      expect(result.content[0]?.text).toBe('hello polybridge')
    })

    it('denies write when allowWrite is false', async () => {
      const config = makeConfig([tmpDir], false)
      const bridge = new FilesystemBridge(config, log)
      await bridge.init()

      const result = await bridge.executeTool('fs_write_file', {
        filePath: path.join(tmpDir, 'output.txt'),
        content : 'test',
      })

      expect(result.isError).toBe(true)
      expect(result.content[0]?.text).toContain('disabled')
    })

    it('denies delete when allowDelete is false', async () => {
      const testFile = path.join(tmpDir, 'to-delete.txt')
      await fs.writeFile(testFile, 'content')

      const config = makeConfig([tmpDir], true, false)
      const bridge = new FilesystemBridge(config, log)
      await bridge.init()

      const result = await bridge.executeTool('fs_delete_file', {
        filePath: testFile,
      })

      expect(result.isError).toBe(true)
      expect(result.content[0]?.text).toContain('disabled')
    })

  })

  // -------------------------------------------------------------------------
  describe('fs_write_file and fs_read_file', () => {

    it('writes a file and reads it back correctly', async () => {
      const config = makeConfig([tmpDir])
      const bridge = new FilesystemBridge(config, log)
      await bridge.init()

      const filePath = path.join(tmpDir, 'roundtrip.txt')
      const content  = 'polybridge write-read test'

      const writeResult = await bridge.executeTool('fs_write_file', { filePath, content })
      expect(writeResult.isError).toBeUndefined()

      const readResult = await bridge.executeTool('fs_read_file', { filePath })
      expect(readResult.content[0]?.text).toBe(content)
    })

  })

  // -------------------------------------------------------------------------
  describe('fs_list_directory', () => {

    it('returns a list of files in the directory', async () => {
      const subDir = path.join(tmpDir, 'list-test')
      await fs.mkdir(subDir, { recursive: true })
      await fs.writeFile(path.join(subDir, 'alpha.txt'), 'a')
      await fs.writeFile(path.join(subDir, 'beta.txt'),  'b')

      const config = makeConfig([tmpDir])
      const bridge = new FilesystemBridge(config, log)
      await bridge.init()

      const result = await bridge.executeTool('fs_list_directory', { dirPath: subDir })
      const text   = result.content[0]?.text ?? ''

      expect(text).toContain('alpha.txt')
      expect(text).toContain('beta.txt')
    })

    it('returns a readable message for an empty directory', async () => {
      const emptyDir = path.join(tmpDir, 'empty-dir')
      await fs.mkdir(emptyDir, { recursive: true })

      const config = makeConfig([tmpDir])
      const bridge = new FilesystemBridge(config, log)
      await bridge.init()

      const result = await bridge.executeTool('fs_list_directory', { dirPath: emptyDir })
      expect(result.content[0]?.text).toContain('empty')
    })

  })

})
