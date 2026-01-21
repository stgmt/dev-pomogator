import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(__dirname, '..', '..');

export async function setup() {
  console.log('[hook] Building and starting docker compose...');
  execSync('docker compose -f docker-compose.test.yml up -d --build', {
    cwd: PROJECT_DIR,
    stdio: 'inherit',
  });
}

export async function teardown() {
  console.log('[hook] Stopping docker compose...');
  execSync('docker compose -f docker-compose.test.yml down', {
    cwd: PROJECT_DIR,
    stdio: 'inherit',
  });
}
