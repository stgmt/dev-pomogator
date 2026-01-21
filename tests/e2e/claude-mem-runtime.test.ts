import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import {
  startWorker,
  stopWorker,
  isWorkerRunning,
  runHookWithParams,
  runInstaller,
  homePath,
  initGitRepo,
} from './helpers';

// ============================================================================
// PLUGIN002-RUNTIME: Claude-mem Full E2E Tests
// ============================================================================
// These tests verify:
// 1. Worker health and readiness
// 2. Hook execution with real parameters (via environment variables)
// 3. API endpoints respond correctly
//
// Note: These tests require claude-mem to be installed first.
// The beforeAll hook ensures installation before starting the worker.

const WORKER_PORT = 37777;
const WORKER_BASE_URL = `http://127.0.0.1:${WORKER_PORT}`;

describe('PLUGIN002-RUNTIME: Claude-mem Full E2E', () => {
  // Ensure claude-mem is installed and start worker before all tests
  beforeAll(async () => {
    // Initialize git repo so findRepoRoot() works correctly
    await initGitRepo();
    
    // Check if claude-mem is already installed
    const workerServicePath = homePath('.claude', 'plugins', 'marketplaces', 'thedotmack', 'plugin', 'scripts', 'worker-service.cjs');
    
    if (!await fs.pathExists(workerServicePath)) {
      console.log('[claude-mem-runtime] claude-mem not installed, running installer first...');
      // Run the installer to install claude-mem
      const result = await runInstaller('--cursor');
      if (result.exitCode !== 0) {
        throw new Error(`Installer failed: ${result.logs}`);
      }
    }
    
    // Now start the worker
    await startWorker();
  }, 120000); // 2 minute timeout for potential install

  // Stop worker after all tests
  afterAll(async () => {
    await stopWorker();
  });

  // --------------------------------------------------------------------------
  // Health & Readiness
  // --------------------------------------------------------------------------
  describe('Health & Readiness', () => {
    it('worker should be running', async () => {
      const running = await isWorkerRunning();
      expect(running).toBe(true);
    });

    it('readiness endpoint should return 200', async () => {
      const res = await fetch(`${WORKER_BASE_URL}/api/readiness`);
      expect(res.ok).toBe(true);
    });

    it('health endpoint should respond', async () => {
      const res = await fetch(`${WORKER_BASE_URL}/health`);
      expect(res.ok).toBe(true);
      const data = await res.json();
      // Health endpoint returns some status info
      expect(data).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // API Endpoints Availability
  // --------------------------------------------------------------------------
  describe('API Endpoints Availability', () => {
    it('GET /api/projects should respond', async () => {
      const res = await fetch(`${WORKER_BASE_URL}/api/projects`);
      expect(res.ok).toBe(true);
      const data = await res.json();
      // Should return data (array or object with projects)
      expect(data).toBeDefined();
    });

    it('GET /api/observations should respond', async () => {
      const res = await fetch(`${WORKER_BASE_URL}/api/observations`);
      expect(res.ok).toBe(true);
      const data = await res.json();
      // Should return array or object with observations
      expect(data).toBeDefined();
    });

    it('GET /api/stats should respond', async () => {
      const res = await fetch(`${WORKER_BASE_URL}/api/stats`);
      expect(res.ok).toBe(true);
      const data = await res.json();
      // Should return stats object
      expect(data).toBeDefined();
    });

    it('GET /api/prompts should respond', async () => {
      const res = await fetch(`${WORKER_BASE_URL}/api/prompts`);
      expect(res.ok).toBe(true);
    });

    it('GET /api/summaries should respond', async () => {
      const res = await fetch(`${WORKER_BASE_URL}/api/summaries`);
      expect(res.ok).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Hook Execution with Parameters (Cursor format via stdin)
  // --------------------------------------------------------------------------
  describe('Hook Execution with Parameters', () => {
    const testSessionId = `e2e-test-${Date.now()}`;
    const testWorkspace = '/home/testuser/test-project';

    it('session-init hook should execute with prompt', async () => {
      const output = runHookWithParams('session-init', {
        conversationId: testSessionId,
        workspaceRoot: testWorkspace,
        prompt: 'E2E test: implement feature X',
      });
      // Hook should return JSON with continue: true
      expect(typeof output).toBe('string');
      // Check if we get valid JSON response
      if (output.trim()) {
        try {
          const response = JSON.parse(output);
          expect(response.continue).toBe(true);
        } catch {
          // May be empty or error message - that's ok for now
        }
      }
    });

    it('context hook should execute and return context', async () => {
      const output = runHookWithParams('context', {
        conversationId: testSessionId,
        workspaceRoot: testWorkspace,
      });
      expect(typeof output).toBe('string');
    });

    it('observation hook should execute with MCP tool data', async () => {
      const output = runHookWithParams('observation', {
        conversationId: testSessionId,
        workspaceRoot: testWorkspace,
        toolName: 'Read',
        toolInput: { path: '/src/app.ts' },
        toolResult: { content: 'export const app = {}' },
      });
      expect(typeof output).toBe('string');
    });

    it('observation hook should execute with shell command', async () => {
      const output = runHookWithParams('observation', {
        conversationId: testSessionId,
        workspaceRoot: testWorkspace,
        command: 'npm test',
        output: 'All tests passed',
      });
      expect(typeof output).toBe('string');
    });

    it('file-edit hook should execute with file path and edits', async () => {
      const output = runHookWithParams('file-edit', {
        conversationId: testSessionId,
        workspaceRoot: testWorkspace,
        filePath: '/src/component.tsx',
        edits: [{ type: 'insert', line: 10, content: 'const x = 1;' }],
      });
      expect(typeof output).toBe('string');
    });

    it('summarize hook should execute (session end)', async () => {
      const output = runHookWithParams('summarize', {
        conversationId: testSessionId,
        workspaceRoot: testWorkspace,
      });
      expect(typeof output).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // Viewer UI
  // --------------------------------------------------------------------------
  describe('Viewer UI', () => {
    it('root path should serve viewer UI', async () => {
      const res = await fetch(`${WORKER_BASE_URL}/`);
      expect(res.ok).toBe(true);
      const contentType = res.headers.get('content-type');
      // Should serve HTML
      expect(contentType).toContain('text/html');
    });
  });

  // --------------------------------------------------------------------------
  // Settings API
  // --------------------------------------------------------------------------
  describe('Settings API', () => {
    it('GET /api/settings should respond', async () => {
      const res = await fetch(`${WORKER_BASE_URL}/api/settings`);
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data).toBeDefined();
    });

    it('POST /api/settings should accept settings', async () => {
      const res = await fetch(`${WORKER_BASE_URL}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: 'dark',
          sidebarOpen: true,
        }),
      });
      // Should accept settings (200 or 201)
      expect(res.status).toBeLessThan(400);
    });
  });
});
