/**
 * Helper utility to manage Google credentials for the Drive Picker.
 * Supports credentials defined in environment variables (VITE_ prefixed).
 */

/**
 * Get Google credentials from environment variables.
 * @returns {{clientId: string, appId: string, developerKey: string}}
 */
export function getGoogleCredentials() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const appId = import.meta.env.VITE_GOOGLE_APP_ID || '';
  const developerKey = import.meta.env.VITE_GOOGLE_API_KEY || '';

  return { clientId, appId, developerKey };
}

