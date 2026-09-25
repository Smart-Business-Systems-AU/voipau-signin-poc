/**
 * Strategy A — standard MSAL.js in the Horizon page.
 *
 * What this tests:
 *   1. Whether MSAL can even load and initialise inside the Horizon page
 *      (bundle analyser rules, Content Security Policy).
 *   2. ssoSilent: a hidden iframe to login.microsoftonline.com that redirects
 *      back to `msalRedirectUri`. Usually blocked when third-party cookies are.
 *   3. acquireTokenPopup: a popup that must redirect back to a page on the SAME
 *      ORIGIN as the Horizon portal, because MSAL reads the response from the
 *      popup through the opener. We do not control that origin, which is the
 *      core risk this strategy exists to measure.
 *
 * MSAL is loaded with a dynamic import so it is its own chunk, and the whole
 * branch is removed from the bundle by `npm run build:broker-only`.
 */
import type { Log, PocConfig } from './types';
import { errorText } from './types';

declare const __INCLUDE_MSAL__: boolean;

export const msalIncluded = __INCLUDE_MSAL__;

export async function signInWithMsal(
  config: PocConfig,
  loginHint: string | undefined,
  log: Log,
): Promise<string | undefined> {
  const S = 'A: MSAL.js' as const;

  // The import must sit INSIDE a branch on the build-time constant: webpack
  // skips parsing a constant-false branch, so broker-only builds contain no
  // MSAL chunk at all. (Code after an early `return` is still parsed.)
  let msal: typeof import('@azure/msal-browser') | undefined;
  if (__INCLUDE_MSAL__) {
    try {
      msal = await import('@azure/msal-browser');
      log(S, 'Load MSAL', true, 'MSAL chunk loaded');
    } catch (error) {
      log(S, 'Load MSAL', false, errorText(error));
      return undefined;
    }
  }
  if (!msal) {
    log(S, 'Load MSAL', false, 'This build excludes MSAL (build:broker-only).');
    return undefined;
  }

  const redirectUri = config.msalRedirectUri || `${window.location.origin}/`;
  const pca = new msal.PublicClientApplication({
    auth: {
      clientId: config.spaClientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
      redirectUri,
      navigateToLoginRequestUrl: false,
    },
    cache: { cacheLocation: 'sessionStorage' },
  });

  try {
    await pca.initialize();
    log(S, 'Initialise', true, `redirectUri = ${redirectUri}`);
  } catch (error) {
    log(S, 'Initialise', false, errorText(error));
    return undefined;
  }

  const request = { scopes: [config.apiScope], loginHint };

  try {
    const silent = await pca.ssoSilent(request);
    log(S, 'ssoSilent (hidden iframe)', true, `Token for ${silent.account?.username ?? '?'}`);
    return silent.accessToken;
  } catch (error) {
    log(S, 'ssoSilent (hidden iframe)', false, errorText(error));
  }

  try {
    const popup = await pca.acquireTokenPopup(request);
    log(S, 'acquireTokenPopup', true, `Token for ${popup.account?.username ?? '?'}`);
    return popup.accessToken;
  } catch (error) {
    log(S, 'acquireTokenPopup', false, errorText(error));
    return undefined;
  }
}
