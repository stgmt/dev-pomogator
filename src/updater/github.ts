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
  const url = `${RAW_BASE}/extensions/${extensionName}/${relativePath}`;
  
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
