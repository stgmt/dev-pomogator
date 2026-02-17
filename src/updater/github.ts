const RAW_BASE = 'https://raw.githubusercontent.com/stgmt/dev-pomogator/main';

export interface ExtensionManifest {
  name: string;
  version: string;
  description: string;
  platforms: string[];
  category: string;
  files: {
    cursor?: string[];
    claude?: string[];
  };
  rules?: {
    cursor?: string[];
    claude?: string[];
  };
  tools?: {
    [toolName: string]: string;
  };
  toolFiles?: {
    [toolName: string]: string[];
  };
  hooks?: {
    cursor?: Record<string, string>;
    claude?: Record<string, string>;
  };
  postUpdate?: {
    command: string;
    interactive?: boolean;
    skipInCI?: boolean;
  } | {
    cursor?: {
      command: string;
      interactive?: boolean;
      skipInCI?: boolean;
    };
    claude?: {
      command: string;
      interactive?: boolean;
      skipInCI?: boolean;
    };
  };
}

export async function fetchExtensionManifest(name: string): Promise<ExtensionManifest | null> {
  const url = `${RAW_BASE}/extensions/${name}/extension.json`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'dev-pomogator',
      },
    });
    
    if (!response.ok) {
      return null;
    }
    
    return response.json() as Promise<ExtensionManifest>;
  } catch {
    return null;
  }
}

export async function downloadExtensionFile(
  extensionName: string,
  relativePath: string
): Promise<string | null> {
  // toolFiles in extension.json use target project paths (.dev-pomogator/tools/...)
  // but source files on GitHub are at extensions/{name}/tools/... (no .dev-pomogator/ prefix)
  const remotePath = relativePath.replace(/^\.dev-pomogator\//, '');
  const url = `${RAW_BASE}/extensions/${extensionName}/${remotePath}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'dev-pomogator',
      },
    });
    
    if (!response.ok) {
      return null;
    }
    
    return response.text();
  } catch {
    return null;
  }
}
