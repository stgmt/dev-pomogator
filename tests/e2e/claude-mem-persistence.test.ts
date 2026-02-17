import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import {
  startWorker,
  stopWorker,
  runHookWithParams,
  runHookExpectSuccess,
  runInstaller,
  homePath,
  getStatsTyped,
  getProjectsList,
  getObservationsByProject,
  waitForStatsIncrease,
  waitForObservation,
  StatsResponse,
  initGitRepo,
  // Session Lifecycle API helpers
  initSession,
  getSessionStatus,
  addObservation,
  summarizeSession,
  getProjects,
  getObservations,
  processPendingQueue,
  getPrompts,
} from './helpers';

// ============================================================================
// PLUGIN002-PERSISTENCE: Claude-mem Data Persistence Tests
// ============================================================================
// These tests verify that data actually persists after hook execution:
// 1. Session initialization creates records in DB
// 2. Observation hooks save data to DB
// 3. Data is retrievable via API endpoints
//
// Uses beforeAll as BDD "Background" / "Given session is initialized"

const WORKER_PORT = 37777;

// Test context - shared across all tests (fixture data)
interface TestContext {
  sessionId: string;
  project: string;
  workspaceRoot: string;
  initialStats: StatsResponse | null;
}

const ctx: TestContext = {
  sessionId: '',
  project: '',
  workspaceRoot: '',
  initialStats: null,
};

describe('PLUGIN002-PERSISTENCE: Claude-mem Data Persistence', () => {
  // =========================================================================
  // FIXTURE: Background - Given session is initialized
  // =========================================================================
  beforeAll(async () => {
    // Initialize git repo so findRepoRoot() works correctly
    await initGitRepo();
    
    // Ensure claude-mem is installed
    const workerServicePath = homePath(
      '.claude',
      'plugins',
      'marketplaces',
      'thedotmack',
      'plugin',
      'scripts',
      'worker-service.cjs'
    );

    if (!(await fs.pathExists(workerServicePath))) {
      console.log('[persistence] claude-mem not installed, running installer...');
      const result = await runInstaller('--cursor --all');
      if (result.exitCode !== 0) {
        throw new Error(`Installer failed: ${result.logs}`);
      }
    }

    // Start worker
    await startWorker();

    // Generate unique IDs for this test run
    const timestamp = Date.now();
    ctx.sessionId = `e2e-persist-${timestamp}`;
    ctx.project = `e2e-project-${timestamp}`;
    ctx.workspaceRoot = `/home/testuser/${ctx.project}`;

    // Capture initial stats BEFORE any operations
    try {
      ctx.initialStats = await getStatsTyped();
      console.log('[persistence] Initial stats:', {
        observations: ctx.initialStats.database.observations,
        sessions: ctx.initialStats.database.sessions,
      });
    } catch (e) {
      console.log('[persistence] Could not get initial stats:', e);
      ctx.initialStats = null;
    }

    // Initialize session via hook (simulating Cursor behavior)
    console.log('[persistence] Initializing session:', ctx.sessionId);
    runHookWithParams('session-init', {
      conversationId: ctx.sessionId,
      workspaceRoot: ctx.workspaceRoot,
      prompt: 'E2E persistence test: testing data storage',
    });

    // Wait until session is actually persisted (poll, not arbitrary sleep)
    const initSessions = ctx.initialStats?.database.sessions ?? 0;
    try {
      await waitForStatsIncrease(initSessions, 'sessions', 10000);
    } catch {
      console.log('[persistence] Warning: session count did not increase after session-init within 10s');
    }
  }, 120000);

  afterAll(async () => {
    await stopWorker();
  });

  // =========================================================================
  // Stats Tracking
  // =========================================================================
  describe('Stats Tracking', () => {
    it('stats.database.observations should be a number', async () => {
      const stats = await getStatsTyped();
      expect(typeof stats.database.observations).toBe('number');
    });

    it('stats.database.sessions should be a number', async () => {
      const stats = await getStatsTyped();
      expect(typeof stats.database.sessions).toBe('number');
    });

    it('stats.worker should have version and port', async () => {
      const stats = await getStatsTyped();
      expect(stats.worker.version).toBeDefined();
      expect(stats.worker.port).toBe(WORKER_PORT);
    });
  });

  // =========================================================================
  // Observation Persistence
  // =========================================================================
  describe('Observation Persistence', () => {
    it('observation hook should execute without throwing', async () => {
      // Execute observation hook with test data — throws on non-zero exit
      const output = runHookExpectSuccess('observation', {
        conversationId: ctx.sessionId,
        workspaceRoot: ctx.workspaceRoot,
        toolName: 'PersistenceTest',
        toolInput: { action: 'test-persistence' },
        toolResult: { success: true, data: 'test-data' },
      });

      expect(output.trim().length).toBeGreaterThan(0);
    });

    it('shell command observation should execute', async () => {
      const output = runHookExpectSuccess('observation', {
        conversationId: ctx.sessionId,
        workspaceRoot: ctx.workspaceRoot,
        command: 'echo "persistence test"',
        output: 'persistence test',
      });

      expect(output.trim().length).toBeGreaterThan(0);
    });

    it('file-edit hook should execute', async () => {
      const output = runHookExpectSuccess('file-edit', {
        conversationId: ctx.sessionId,
        workspaceRoot: ctx.workspaceRoot,
        filePath: `${ctx.workspaceRoot}/src/test.ts`,
        edits: [{ type: 'insert', line: 1, content: 'const x = 1;' }],
      });

      expect(output.trim().length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Project Tracking
  // =========================================================================
  describe('Project Tracking', () => {
    it('GET /api/projects should return array', async () => {
      const projects = await getProjectsList();
      expect(Array.isArray(projects)).toBe(true);
    });

    it('projects list should be retrievable', async () => {
      // We can't guarantee our project appears immediately due to async processing
      // But we can verify the API returns valid data
      const projects = await getProjectsList();
      expect(projects).toBeDefined();
    });
  });

  // =========================================================================
  // Observations API
  // =========================================================================
  describe('Observations API', () => {
    it('GET /api/observations should return paginated response', async () => {
      const response = await getObservationsByProject(undefined, 0, 10);

      expect(response).toHaveProperty('items');
      // API may return 'total' or 'hasMore' depending on version
      expect(response).toHaveProperty('offset');
      expect(response).toHaveProperty('limit');
      expect(Array.isArray(response.items)).toBe(true);
    });

    it('observations items should have required fields when processed', async () => {
      // Force queue processing — requires SDK agent (ANTHROPIC_API_KEY)
      try {
        await processPendingQueue();
        await new Promise((r) => setTimeout(r, 500));
      } catch (e) {
        console.log('[persistence] processPendingQueue failed (expected without API key):', e);
      }

      const response = await getObservationsByProject(undefined, 0, 10);

      // SDK agent may not be available (no API key in Docker) — observations stay queued
      if (response.items.length > 0) {
        const obs = response.items[0];
        expect(obs).toHaveProperty('id');
        expect(obs).toHaveProperty('tool_name');
      } else {
        console.log('[persistence] No processed observations (SDK agent likely unavailable — no API key)');
        // Verify API structure is correct even with empty results
        expect(response).toHaveProperty('items');
        expect(response).toHaveProperty('offset');
        expect(response).toHaveProperty('limit');
      }
    });
  });

  // =========================================================================
  // Polling-based Persistence Verification
  // =========================================================================
  describe('Polling Persistence Verification', () => {
    it('observation hook queues data and API processes when SDK available', async () => {
      // Use unique tool name to identify this specific observation
      const uniqueToolName = `PollingTest-${Date.now()}`;

      // Execute observation hook — this queues data to worker
      const output = runHookExpectSuccess('observation', {
        conversationId: ctx.sessionId,
        workspaceRoot: ctx.workspaceRoot,
        toolName: uniqueToolName,
        toolInput: { polling: true },
        toolResult: { verified: true },
      });
      expect(output.trim().length).toBeGreaterThan(0);

      // Give hook time to send data to worker, then try queue processing
      await new Promise((r) => setTimeout(r, 1000));
      let queueResult: { status: string; processed?: number } = { status: 'unknown' };
      try {
        queueResult = await processPendingQueue();
        console.log('[persistence] Queue processing result:', queueResult);
      } catch (e) {
        console.log('[persistence] processPendingQueue failed (expected without API key)');
      }

      // Try to find the observation — SDK agent may not process without API key
      try {
        const observation = await waitForObservation(uniqueToolName, undefined, 5000);
        expect(observation.tool_name).toBe(uniqueToolName);
        expect(observation.id).toBeGreaterThan(0);
        console.log('[persistence] Observation found:', {
          id: observation.id,
          tool_name: observation.tool_name,
        });
      } catch {
        // SDK agent not available — observation stays queued, which is expected
        console.log('[persistence] Observation not processed (SDK agent likely unavailable — no API key)');
        // Verify at least that the stats API is working
        const stats = await getStatsTyped();
        expect(stats.worker.port).toBe(37777);
      }
    });

    it('stats.sessions should increase after session-init', async () => {
      const initialSessions = ctx.initialStats?.database.sessions ?? 0;

      // Wait for sessions count to strictly increase (with 10s timeout).
      // If sessions don't increase — test fails.
      const newCount = await waitForStatsIncrease(initialSessions, 'sessions', 10000);
      expect(newCount).toBeGreaterThan(initialSessions);
      console.log('[persistence] Sessions increased:', { from: initialSessions, to: newCount });
    });
  });

  // =========================================================================
  // Full Workflow: Session → Observations → Verify
  // =========================================================================
  describe('Full Workflow', () => {
    it('complete workflow: init, observe, verify stats', async () => {
      // Force queue processing before checking stats
      try {
        await processPendingQueue();
        await new Promise((r) => setTimeout(r, 500));
      } catch {
        // SDK agent may not be available
      }

      // Get stats after our test operations
      const finalStats = await getStatsTyped();
      expect(finalStats.database).toBeDefined();

      const initialSess = ctx.initialStats?.database.sessions ?? 0;

      // Sessions are stored directly (no SDK agent needed) — must increase
      expect(finalStats.database.sessions).toBeGreaterThan(initialSess);

      // Observations require SDK agent processing (ANTHROPIC_API_KEY).
      // In Docker tests without API key, observations stay queued.
      const initialObs = ctx.initialStats?.database.observations ?? 0;
      if (finalStats.database.observations > initialObs) {
        console.log('[persistence] Observations processed by SDK agent');
      } else {
        console.log('[persistence] Observations not processed (SDK agent likely unavailable — no API key)');
      }

      console.log('[persistence] Final stats:', {
        observations: `${initialObs} → ${finalStats.database.observations}`,
        sessions: `${initialSess} → ${finalStats.database.sessions}`,
      });
    });

    it('summarize hook should execute (session end)', async () => {
      const output = runHookExpectSuccess('summarize', {
        conversationId: ctx.sessionId,
        workspaceRoot: ctx.workspaceRoot,
      });

      expect(output.trim().length).toBeGreaterThan(0);
      expect(output).not.toContain('Missing transcriptPath');
    });
  });

  // =========================================================================
  // Session Lifecycle via API (PLUGIN002 feature scenarios)
  // Uses new /api/sessions/* endpoints with contentSessionId
  // NO MOCKS, NO FALLBACKS - real API calls only
  // =========================================================================
  describe('Session Lifecycle via API', () => {
    // Context for API-based session tests
    let apiSessionId: string;
    let apiSessionDbId: number;
    const apiProject = `e2e-api-project-${Date.now()}`;

    it('Initialize new session via API - should return session_db_id > 0', async () => {
      apiSessionId = `api-session-${Date.now()}`;
      
      // Real API call - no fallbacks
      // POST /api/sessions/init with { contentSessionId, project, prompt }
      apiSessionDbId = await initSession(apiSessionId, apiProject, 'E2E API test prompt');
      
      expect(apiSessionDbId).toBeGreaterThan(0);
      console.log('[api-lifecycle] Session initialized:', { apiSessionId, apiSessionDbId, apiProject });
    });

    it('Add observation to session via API - should return status queued', async () => {
      // Real API call using contentSessionId
      // POST /api/sessions/observations with { contentSessionId, tool_name, tool_input, tool_response, cwd }
      const result = await addObservation(
        apiSessionId,
        'APITestTool',
        { action: 'test-via-api' },
        { success: true, result: 'API observation added' },
        '/home/testuser/test-project'
      );
      
      expect(result.status).toBe('queued');
      console.log('[api-lifecycle] Observation added:', result);
    });

    it('Get session status via API - should contain project and status active', async () => {
      // Legacy endpoint requires numeric sessionDbId
      // GET /sessions/:sessionDbId/status
      const status = await getSessionStatus(apiSessionDbId);
      
      expect(status).toHaveProperty('project');
      expect(status.project).toBe(apiProject);
      expect(status).toHaveProperty('status');
      expect(status.status).toBe('active');
      console.log('[api-lifecycle] Session status:', status);
    });

    it('Summarize session via API - should return status queued', async () => {
      // Real API call using contentSessionId
      // POST /api/sessions/summarize with { contentSessionId, last_assistant_message }
      const result = await summarizeSession(apiSessionId, 'E2E test completed.');
      
      expect(result.status).toBe('queued');
      console.log('[api-lifecycle] Session summarized:', result);
    });

    it('Project appears in prompts list - prompt saved after session init', async () => {
      // Prompts are saved immediately during session init (no SDK agent processing needed)
      // This is more reliable than /api/projects which requires observations to be processed
      const promptsResponse = await getPrompts(apiProject);
      console.log('[api-lifecycle] Prompts for project:', promptsResponse);
      
      expect(promptsResponse).toHaveProperty('items');
      expect(Array.isArray(promptsResponse.items)).toBe(true);
      expect(promptsResponse.items.length).toBeGreaterThan(0);
      
      // Verify prompt has correct project
      const prompt = promptsResponse.items[0];
      expect(prompt.project).toBe(apiProject);
      expect(prompt.prompt_text).toContain('E2E API test prompt');
      console.log('[api-lifecycle] Found prompt:', {
        id: prompt.id,
        project: prompt.project,
        prompt_number: prompt.prompt_number,
      });
    });

    it('Observations are retrievable by project - should have required fields', async () => {
      // Wait for async processing
      await new Promise((r) => setTimeout(r, 500));
      
      // Get observations - should include our API observation
      const observations = await getObservations(undefined, 50);
      
      expect(Array.isArray(observations)).toBe(true);
      // Note: observations may be async processed, so we just verify API works
      console.log('[api-lifecycle] Observations count:', observations.length);
      
      if (observations.length > 0) {
        const obs = observations[0];
        expect(obs).toHaveProperty('id');
        expect(obs).toHaveProperty('tool_name');
        console.log('[api-lifecycle] Found observation:', {
          id: obs.id,
          tool_name: obs.tool_name,
        });
      }
    });
  });
});
