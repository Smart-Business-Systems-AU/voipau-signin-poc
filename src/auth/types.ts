/** Settings the tester enters on the page (remembered in this browser). */
export interface PocConfig {
  /** Firm backend base URL, e.g. https://localhost:7443 */
  backendUrl: string;
  /** Entra tenant id of the firm (GUID). */
  tenantId: string;
  /** Strategy A: client id of the SPA app registration. */
  spaClientId: string;
  /** Strategy A: the backend API scope, e.g. api://<api-client-id>/access_as_user */
  apiScope: string;
  /** Strategy A: redirect URI registered on the SPA app. Defaults to the portal origin. */
  msalRedirectUri: string;
}

export type Strategy = 'A: MSAL.js' | 'B: Backend broker' | 'Environment';

export interface StepResult {
  at: string;
  strategy: Strategy;
  step: string;
  ok: boolean;
  detail: string;
}

export type Log = (strategy: Strategy, step: string, ok: boolean, detail?: string) => void;

export function errorText(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { errorCode?: string }).errorCode;
    return code ? `${code}: ${error.message}` : `${error.name}: ${error.message}`;
  }
  return String(error);
}
