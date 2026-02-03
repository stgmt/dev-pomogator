import fs from 'fs';

function readFileSafe(path: string): string | null {
  try {
    return fs.readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

function isDockerCgroup(content: string | null): boolean {
  if (!content) return false;
  return /docker|containerd|kubepods|podman/i.test(content);
}

function isRunningInDocker(): boolean {
  if (fs.existsSync('/.dockerenv')) return true;
  return isDockerCgroup(readFileSafe('/proc/1/cgroup'));
}

const dockerFlag = process.env.DEV_POMOGATOR_TEST_IN_DOCKER === '1';
const inDocker = isRunningInDocker();

if (!dockerFlag || !inDocker) {
  const message = [
    '[TESTS] Tests must run inside Docker only.',
    'Use: npm run test:e2e',
    'Or: docker compose -f docker-compose.test.yml run --rm test',
  ].join('\n');
  throw new Error(message);
}
