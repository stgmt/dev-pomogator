const GITHUB_API = 'https://api.github.com';
const REPO_OWNER = 'stgmt';
const REPO_NAME = 'dev-pomogator';

export interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
  }>;
  tarball_url: string;
  zipball_url: string;
}

export async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
  
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'dev-pomogator',
    },
  });
  
  if (response.status === 404) {
    // No releases yet
    return null;
  }
  
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json() as Promise<GitHubRelease>;
}

export async function downloadRelease(release: GitHubRelease): Promise<Buffer> {
  // Download tarball
  const response = await fetch(release.tarball_url, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'dev-pomogator',
    },
    redirect: 'follow',
  });
  
  if (!response.ok) {
    throw new Error(`Failed to download release: ${response.status}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
