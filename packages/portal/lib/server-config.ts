/**
 * Canonical server-side API configuration.
 * This is the single source of truth for mock vs live mode.
 * Must only be imported by server-side code (server components, server actions, API routes).
 */

export type ServerConfig = {
  isMockMode: boolean;
  apiBaseUrl: string;
  publisherApiBaseUrl: string;
};

/**
 * Resolves the server-side API configuration.
 *
 * Rules:
 * - `USE_MOCK_API` is not `'false'`  → mock mode (explicit opt-in is required for live)
 * - `USE_MOCK_API === 'false'` AND `API_BASE_URL` set  → live mode
 * - `USE_MOCK_API === 'false'` AND `API_BASE_URL` missing  → configuration error (fail loud)
 *
 * `PUBLISHER_API_BASE_URL` overrides `API_BASE_URL` for publisher routes when set.
 */
export function getServerConfig(): ServerConfig {
  const useMockApi = process.env.USE_MOCK_API?.toLowerCase();
  const apiBaseUrl = process.env.API_BASE_URL?.trim() ?? '';
  const publisherApiBaseUrl = process.env.PUBLISHER_API_BASE_URL?.trim() || apiBaseUrl;

  if (useMockApi === 'false') {
    if (!apiBaseUrl) {
      throw new Error(
        'USE_MOCK_API is set to "false" but API_BASE_URL is not configured. ' +
          'Set API_BASE_URL to enable live mode, or remove USE_MOCK_API=false to use mock mode.',
      );
    }

    return {
      isMockMode: false,
      apiBaseUrl,
      publisherApiBaseUrl: publisherApiBaseUrl || apiBaseUrl,
    };
  }

  return { isMockMode: true, apiBaseUrl: '', publisherApiBaseUrl: '' };
}

/**
 * Returns the effective integration mode for banner display.
 * Defaults to 'mock' on config errors to avoid crashing the layout.
 */
export function getPublisherIntegrationMode(): 'mock' | 'live' {
  try {
    return getServerConfig().isMockMode ? 'mock' : 'live';
  } catch {
    return 'mock';
  }
}
