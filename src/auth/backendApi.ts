import type { Log, Strategy } from './types';
import { errorText } from './types';

/** Calls the firm backend's protected endpoint — the proof that a token works. */
export async function callWhoAmI(
  backendUrl: string,
  accessToken: string,
  strategy: Strategy,
  log: Log,
): Promise<unknown> {
  try {
    const response = await fetch(new URL('/api/whoami', backendUrl).toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await response.json().catch(() => ({}));
    log(strategy, 'Call backend /api/whoami', response.ok, `HTTP ${response.status}`);
    return body;
  } catch (error) {
    log(strategy, 'Call backend /api/whoami', false, errorText(error));
    return undefined;
  }
}
