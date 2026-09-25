/**
 * Strategy B — sign-in brokered by the firm's backend.
 *
 * The popup goes to the firm backend (a page we control), which runs the
 * Entra authorisation-code flow as a confidential client and holds the result
 * against a one-time ticket. This page then redeems the ticket by polling,
 * proving it started the flow by presenting the verifier whose SHA-256 it sent
 * as the challenge (PKCE-style). Nothing here depends on window.opener, COOP,
 * third-party cookies or the portal's origin, and no MSAL code is bundled.
 *
 * The ticket, verifier and challenge are generated BEFORE the click so that
 * window.open() runs synchronously inside the click handler — browsers block
 * popups opened after an await.
 */
import type { Log } from './types';
import { errorText } from './types';

export interface BrokerTicket {
  ticket: string;
  verifier: string;
  challenge: string;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomBase64Url(byteLength: number): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function createBrokerTicket(): Promise<BrokerTicket> {
  const verifier = randomBase64Url(32);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return {
    ticket: randomBase64Url(16),
    verifier,
    challenge: base64Url(new Uint8Array(digest)),
  };
}

/** Must be called synchronously from a click handler. */
export function openBrokerPopup(
  backendUrl: string,
  ticket: BrokerTicket,
  loginHint: string | undefined,
  log: Log,
): boolean {
  const url = new URL('/auth/start', backendUrl);
  url.searchParams.set('ticket', ticket.ticket);
  url.searchParams.set('challenge', ticket.challenge);
  if (loginHint) url.searchParams.set('login_hint', loginHint);

  const popup = window.open(url.toString(), 'voipau-signin-poc', 'width=520,height=680');
  if (!popup) {
    log('B: Backend broker', 'Open popup', false, 'Popup was blocked by the browser.');
    return false;
  }
  log('B: Backend broker', 'Open popup', true, url.origin + url.pathname);
  return true;
}

export async function redeemBrokerTicket(
  backendUrl: string,
  ticket: BrokerTicket,
  log: Log,
  timeoutMs = 120_000,
): Promise<string | undefined> {
  const S = 'B: Backend broker' as const;
  const deadline = Date.now() + timeoutMs;
  const url = new URL('/auth/result', backendUrl).toString();

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket: ticket.ticket, verifier: ticket.verifier }),
      });
    } catch (error) {
      // A CORS or network failure lands here — record it and stop.
      log(S, 'Poll for result', false, errorText(error));
      return undefined;
    }

    if (response.status === 202) continue; // still waiting for the user
    const body = (await response.json().catch(() => ({}))) as {
      accessToken?: string;
      error?: string;
      errorDescription?: string;
    };
    if (response.ok && body.accessToken) {
      log(S, 'Redeem ticket', true, 'Access token received from backend');
      return body.accessToken;
    }
    log(S, 'Redeem ticket', false, `${response.status} ${body.error ?? ''} ${body.errorDescription ?? ''}`.trim());
    return undefined;
  }

  log(S, 'Poll for result', false, 'Timed out after 2 minutes waiting for sign-in.');
  return undefined;
}
