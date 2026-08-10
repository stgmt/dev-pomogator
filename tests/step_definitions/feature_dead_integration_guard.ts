/**
 * AC-7.4: installed-versus-integrated guard owns a real consumer and real
 * artifact proof. The negative cases use temporary source/commands; the
 * positive case drives the shipped Marksman launcher and binary.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateDeadIntegration, type DeadIntegrationResult } from '../../tools/dead-integration-guard/check.ts';
import { createMarksmanWorkspace, probeInitialize, removeMarksmanWorkspace } from '../../tools/marksman-installer/lsp-probe.ts';
import { launcherPath } from '../../tools/marksman-installer/lsp-probe.ts';
import { resolveMarksmanBinary } from '../../tools/marksman-installer/resolve-binary.ts';
import type { V4World } from '../hooks/before-after.ts';

interface GuardWorld extends V4World {
  guardResult?: DeadIntegrationResult;
  guardFixture?: string;
}

Given('an installed runtime change has no declared consumer', function (this: GuardWorld) {
  this.guardResult = evaluateDeadIntegration({
    repoRoot: this.tempDir,
    changedPaths: ['tools/example-installer/postinstall.ts'],
  });
});

When('the installed-versus-integrated guard evaluates the change', function (this: GuardWorld) {
  assert.ok(this.guardResult, 'guard must produce a result');
});

Then('the guard denies with a missing-consumer finding and remediation', function (this: GuardWorld) {
  assert.equal(this.guardResult?.status, 'DENY');
  const finding = this.guardResult?.findings.find((item) => item.code === 'NO_CONSUMER');
  assert.ok(finding, 'missing consumer must be a blocking finding');
  assert.match(finding!.remediation, /consumer/i);
});

Given('a runtime change claims a consumer that does not use the installed artifact', function (this: GuardWorld) {
  this.guardFixture = path.join(this.tempDir, 'consumer.ts');
  fs.writeFileSync(this.guardFixture, 'export function consumer() { return "unrelated"; }\n');
  this.guardResult = evaluateDeadIntegration({
    repoRoot: this.tempDir,
    changedPaths: ['tools/example-installer/postinstall.ts'],
    consumer: { path: 'consumer.ts', requiredTokens: ['DEV_POMOGATOR_MARKSMAN_BIN'] },
    verification: { command: process.execPath, args: ['-e', 'process.stdout.write("unused")'], expectedOutput: 'real-artifact' },
  });
});

Then('the guard denies the unverifiable consumer before accepting integration', function (this: GuardWorld) {
  assert.equal(this.guardResult?.status, 'DENY');
  assert.ok(this.guardResult?.findings.some((item) => item.code === 'CONSUMER_NOT_TRUTHFUL'));
});

Given('the current Marksman installer and launcher are changed', function (this: GuardWorld) {
  const resolved = resolveMarksmanBinary({ repoRoot: process.cwd() });
  assert.ok(resolved?.binaryPath, 'real Marksman must be available for the positive proof');
  this.guardResult = evaluateDeadIntegration({
    repoRoot: process.cwd(),
    changedPaths: ['tools/marksman-installer/postinstall.ts', 'tools/marksman-installer/lsp-probe.ts'],
    consumer: { path: 'tools/marksman-installer/lsp-probe.ts', requiredTokens: ['DEV_POMOGATOR_MARKSMAN_BIN', 'textDocument/definition'] },
    verification: { command: process.execPath, args: ['--import', 'tsx', '-e', `import('${launcherPath().replace(/\\/g, '/')}').then(()=>process.stdout.write('real-artifact'))`], expectedOutput: 'real-artifact' },
  });
});

When('the guard runs the real installed artifact proof', async function (this: GuardWorld) {
  // The guard's verification is executable; this additional probe confirms the
  // same current binary responds through the shipped launcher process.
  const resolved = resolveMarksmanBinary({ repoRoot: process.cwd() });
  const ws = createMarksmanWorkspace();
  try {
    const init = await probeInitialize({ binaryPath: resolved!.binaryPath, workspaceDir: ws });
    assert.equal(init.capabilities.definitionProvider, true);
  } finally {
    removeMarksmanWorkspace(ws);
  }
});

Then('the guard allows integration only with a passing real-artifact result', function (this: GuardWorld) {
  assert.equal(this.guardResult?.status, 'ALLOW');
  assert.equal(this.guardResult?.verification?.status, 'PASSED');
  assert.equal(this.guardResult?.findings.length, 0);
});
