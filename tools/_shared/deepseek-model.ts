export const OPENROUTER_DEEPSEEK_MODEL = 'deepseek/deepseek-v4-flash';
export const AIPOMOGATOR_DEEPSEEK_MODEL = 'openrouter/deepseek/deepseek-v4-flash';

export type ModelDecisionSource = 'default' | 'environment_override' | 'verified_catalog';
export type DeepSeekCatalogFailure =
  | 'catalog_unavailable'
  | 'catalog_malformed'
  | 'catalog_empty'
  | 'compatible_route_absent';

export interface DeepSeekSelection {
  model: string;
  source: ModelDecisionSource;
}

export class DeepSeekCatalogError extends Error {
  constructor(public readonly code: DeepSeekCatalogFailure, message: string) {
    super(message);
    this.name = 'DeepSeekCatalogError';
  }
}

interface CatalogResponse {
  data?: Array<{ id?: unknown }>;
}

export interface CatalogSelectionOptions {
  baseUrl: string;
  apiKey: string;
  override?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const catalogCache = new Map<string, string>();

function compatibleDeepSeekId(id: string): boolean {
  return id === OPENROUTER_DEEPSEEK_MODEL
    || id === AIPOMOGATOR_DEEPSEEK_MODEL
    || id.endsWith(`/${OPENROUTER_DEEPSEEK_MODEL}`);
}

export async function selectAipomogatorDeepSeek(options: CatalogSelectionOptions): Promise<DeepSeekSelection> {
  if (options.override) return { model: options.override, source: 'environment_override' };

  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const cached = catalogCache.get(baseUrl);
  if (cached) return { model: cached, source: 'verified_catalog' };

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new DeepSeekCatalogError('catalog_unavailable', 'global fetch is unavailable');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5_000);
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/models`, {
      method: 'GET',
      signal: controller.signal,
      headers: { authorization: `Bearer ${options.apiKey}` },
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === 'AbortError' ? 'catalog request timed out' : 'catalog request failed';
    throw new DeepSeekCatalogError('catalog_unavailable', reason);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new DeepSeekCatalogError('catalog_unavailable', `catalog HTTP ${response.status}`);
  }

  let payload: CatalogResponse;
  try {
    payload = await response.json() as CatalogResponse;
  } catch {
    throw new DeepSeekCatalogError('catalog_malformed', 'catalog is not JSON');
  }
  if (!payload || !Array.isArray(payload.data)) {
    throw new DeepSeekCatalogError('catalog_malformed', 'catalog data is not an array');
  }

  const ids = payload.data
    .map((entry) => entry?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (ids.length === 0) {
    throw new DeepSeekCatalogError('catalog_empty', 'catalog has no model IDs');
  }

  const selected = ids.find((id) => id === AIPOMOGATOR_DEEPSEEK_MODEL)
    ?? ids.find(compatibleDeepSeekId);
  if (!selected) {
    throw new DeepSeekCatalogError('compatible_route_absent', 'DeepSeek V4 Flash is absent from the catalog');
  }

  catalogCache.set(baseUrl, selected);
  return { model: selected, source: 'verified_catalog' };
}

export function clearDeepSeekCatalogCache(): void {
  catalogCache.clear();
}
