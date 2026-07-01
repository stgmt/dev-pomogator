/**
 * PLUGIN012 step definitions — the devcontainer extension's shipped templates.
 *
 * Migrated from tests/e2e/devcontainer.test.ts. Asserts the REAL devcontainer template artifacts under
 * tools/devcontainer/ actually ship and carry the required structure/content (multi-stage Dockerfile,
 * docker-compose healthcheck + security caps + Docker-socket mount, devcontainer.json shape, AT-SPI2 /
 * OculOS accessibility wiring, dynamic-port plumbing, parameterization placeholders). This is a real
 * distribution guarantee — the templates that ship to users must be correctly structured — not pure
 * file-existence: most checks read the file content. Regex step patterns so quoted substrings with `/`,
 * `=`, `{{…}}` etc. pass verbatim (the cucumber-js `/`-in-step-text + `{}` operators only bite the
 * pattern, not a quoted capture).
 *
 * @see tests/features/plugins/devcontainer/PLUGIN012_devcontainer.feature
 */
import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DC_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..', 'tools', 'devcontainer');
const dc = (rel: string): string => path.join(DC_ROOT, rel);
const readDc = (rel: string): string => fs.readFileSync(dc(rel), 'utf-8');

Then(/^the devcontainer ships "([^"]+)"$/, function (rel: string) {
  assert.ok(fs.existsSync(dc(rel)), `the devcontainer must ship ${rel}`);
});

Then(/^the devcontainer template "([^"]+)" contains "(.+)"$/, function (rel: string, needle: string) {
  assert.ok(readDc(rel).includes(needle), `${rel} must contain "${needle}"`);
});

Then(/^no devcontainer template references the legacy "([^"]+)" slug$/, function (slug: string) {
  const root = dc('templates');
  const walk = (d: string): string[] =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)],
    );
  for (const f of walk(root)) {
    const c = fs.readFileSync(f, 'utf-8');
    assert.ok(!c.includes(slug), `${path.relative(DC_ROOT, f)} must not reference the legacy "${slug}" slug`);
  }
});

Then(/^the devcontainer\.json parses with service "([^"]+)" remoteUser "([^"]+)" and forwards port (\d+)$/, function (service: string, remoteUser: string, port: string) {
  const raw = readDc('templates/devcontainer.json')
    .replace(/\{\{PROJECT_NAME\}\}/g, 'test-project')
    .replace(/\{\{WORKSPACE_FOLDER\}\}/g, '/workspaces/test-project');
  const config = JSON.parse(raw) as { dockerComposeFile?: string; service?: string; remoteUser?: string; forwardPorts?: number[] };
  assert.equal(config.dockerComposeFile, 'docker-compose.yml');
  assert.equal(config.service, service);
  assert.equal(config.remoteUser, remoteUser);
  assert.ok((config.forwardPorts ?? []).includes(Number(port)), `forwardPorts must include ${port}`);
});
