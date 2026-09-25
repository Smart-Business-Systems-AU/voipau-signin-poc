/**
 * VoIPAU Sign-in PoC — tests whether a Horizon app can sign its user in with
 * Microsoft 365 (Entra ID) and call that user's firm backend.
 *
 * Strategy A: standard MSAL.js (ssoSilent, then popup).
 * Strategy B: popup to the firm backend, which brokers the Entra sign-in; the
 *             page redeems a one-time ticket by polling.
 *
 * Every step is logged to the results table, and every Content Security Policy
 * violation the browser reports while the page is open is listed, because CSP
 * is one of the ways this can fail inside the Horizon host.
 */
import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useHorizonContext } from '@netsapiens/horizon-sdk';

import type { BrokerTicket } from '../auth/brokerStrategy';
import type { Log, PocConfig, StepResult, Strategy } from '../auth/types';
import { callWhoAmI } from '../auth/backendApi';
import { createBrokerTicket, openBrokerPopup, redeemBrokerTicket } from '../auth/brokerStrategy';
import { msalIncluded, signInWithMsal } from '../auth/msalStrategy';
import { errorText } from '../auth/types';

const CONFIG_KEY = 'voipau-signin-poc:config';

const EMPTY_CONFIG: PocConfig = {
  backendUrl: 'https://localhost:7443',
  tenantId: '',
  spaClientId: '',
  apiScope: '',
  msalRedirectUri: '',
};

function loadConfig(): PocConfig {
  try {
    const saved = window.localStorage.getItem(CONFIG_KEY);
    return saved ? { ...EMPTY_CONFIG, ...(JSON.parse(saved) as Partial<PocConfig>) } : EMPTY_CONFIG;
  } catch {
    return EMPTY_CONFIG;
  }
}

interface CspViolation {
  directive: string;
  blocked: string;
}

export default function SignInPocPage() {
  const { ui, user, api } = useHorizonContext();

  const [config, setConfig] = useState<PocConfig>(loadConfig);
  const [results, setResults] = useState<StepResult[]>([]);
  const [whoami, setWhoami] = useState<unknown>(undefined);
  const [email, setEmail] = useState<string | undefined>(undefined);
  const [violations, setViolations] = useState<CspViolation[]>([]);
  const [brokerTicket, setBrokerTicket] = useState<BrokerTicket | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const log: Log = useCallback((strategy, step, ok, detail = '') => {
    setResults((prev) => [
      ...prev,
      { at: new Date().toLocaleTimeString(), strategy, step, ok, detail },
    ]);
  }, []);

  // Record CSP violations reported while this page is open.
  useEffect(() => {
    const onViolation = (event: SecurityPolicyViolationEvent) =>
      setViolations((prev) => [
        ...prev,
        { directive: event.effectiveDirective, blocked: event.blockedURI || '(inline)' },
      ]);
    document.addEventListener('securitypolicyviolation', onViolation);
    return () => document.removeEventListener('securitypolicyviolation', onViolation);
  }, []);

  // Resolve the user's email: from the Horizon user if present, else from the
  // NetSapiens v2 user record through the host's API proxy.
  useEffect(() => {
    const fromContext = (user as unknown as Record<string, unknown>)?.email;
    if (typeof fromContext === 'string' && fromContext) {
      setEmail(fromContext);
      log('Environment', 'Resolve email', true, `From Horizon user: ${fromContext}`);
      return;
    }
    if (!api || !user?.domain || !user?.extension) {
      log('Environment', 'Resolve email', false, 'No Horizon user or API client');
      return;
    }
    api
      .get<Record<string, unknown>>(`/domains/${user.domain}/users/${user.extension}`)
      .then((record) => {
        const key = Object.keys(record ?? {}).find((k) => k.toLowerCase().includes('email'));
        const value = key ? String(record[key] ?? '') : '';
        setEmail(value || undefined);
        log('Environment', 'Resolve email', Boolean(value), value ? `NS user field "${key}": ${value}` : 'No email field on the NS user record');
      })
      .catch((error) => log('Environment', 'Resolve email', false, errorText(error)));
  }, [api, user, log]);

  // Pre-generate the broker ticket so the popup can open synchronously on click.
  const refreshTicket = useCallback(() => {
    createBrokerTicket()
      .then(setBrokerTicket)
      .catch((error) => log('B: Backend broker', 'Create ticket', false, errorText(error)));
  }, [log]);
  useEffect(refreshTicket, [refreshTicket]);

  const saveConfig = () => {
    try {
      window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      log('Environment', 'Save settings', true, 'Saved in this browser');
    } catch (error) {
      log('Environment', 'Save settings', false, errorText(error));
    }
  };

  const finish = async (strategy: Strategy, token: string | undefined) => {
    if (token) setWhoami(await callWhoAmI(config.backendUrl, token, strategy, log));
    setBusy(false);
  };

  const runMsal = () => {
    setBusy(true);
    signInWithMsal(config, email, log)
      .then((token) => finish('A: MSAL.js', token))
      .catch((error) => {
        log('A: MSAL.js', 'Unexpected error', false, errorText(error));
        setBusy(false);
      });
  };

  const runBroker = () => {
    if (!brokerTicket) {
      log('B: Backend broker', 'Create ticket', false, 'Ticket not ready yet — try again');
      return;
    }
    const ticket = brokerTicket;
    // Synchronous from the click: anything awaited before this is popup-blocked.
    if (!openBrokerPopup(config.backendUrl, ticket, email, log)) return;
    setBusy(true);
    setBrokerTicket(undefined);
    redeemBrokerTicket(config.backendUrl, ticket, log)
      .then((token) => finish('B: Backend broker', token))
      .finally(refreshTicket);
  };

  const { PageTemplate } = ui?.templates ?? {};
  const {
    Paper, Stack, Typography, TextField, Button, Alert, Chip, Code,
    Table, TableHead, TableBody, TableRow, TableCell,
  } = ui ?? {};

  if (!PageTemplate || !Paper || !Stack || !Typography || !TextField || !Button || !Alert || !Chip
    || !Table || !TableHead || !TableBody || !TableRow || !TableCell) {
    return <div style={{ padding: 24 }}>VoIPAU Sign-in PoC: UI components not available</div>;
  }

  const field = (key: keyof PocConfig, label: string, helperText: string) => (
    <TextField
      label={label}
      helperText={helperText}
      value={config[key]}
      onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setConfig((prev) => ({ ...prev, [key]: event.target.value.trim() }))
      }
      fullWidth
    />
  );

  const environment: Array<[string, string]> = [
    ['Portal origin', window.location.origin],
    ['Secure context', String(window.isSecureContext)],
    ['Horizon user', `${user?.displayName ?? '?'} (${user?.extension ?? '?'}@${user?.domain ?? '?'})`],
    ['Email (login hint)', email ?? 'not resolved'],
    ['MSAL in this build', msalIncluded ? 'yes' : 'no (broker-only build)'],
    ['CSP violations seen', String(violations.length)],
  ];

  return (
    <PageTemplate
      title="VoIPAU Sign-in PoC"
      subtitle="Can a Horizon app sign in with Microsoft 365 and call the firm's backend?"
      breadcrumbs={[{ label: 'Apps', url: '/apps' }, { label: 'VoIPAU Sign-in PoC' }]}
      actions={[
        {
          label: 'Clear results',
          icon: 'mdi:broom',
          variant: 'secondary',
          onClick: () => {
            setResults([]);
            setWhoami(undefined);
            setViolations([]);
          },
        },
      ]}
    >
      <Stack spacing={3}>
        <Alert severity="info">
          Run both tests, then copy the results table. <strong>A</strong> is standard MSAL.js inside
          the Horizon page; <strong>B</strong> is a popup to the firm backend that brokers the
          Microsoft sign-in. A test passes only when <code>/api/whoami</code> returns your identity.
        </Alert>

        <Paper>
          <Typography variant="h6" gutterBottom>Environment</Typography>
          <Table size="small">
            <TableBody>
              {environment.map(([name, value]) => (
                <TableRow key={name}>
                  <TableCell>{name}</TableCell>
                  <TableCell>{value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        <Paper>
          <Stack spacing={2}>
            <Typography variant="h6">Settings</Typography>
            {field('backendUrl', 'Firm backend URL', 'Where the test backend runs, e.g. https://localhost:7443')}
            {field('tenantId', 'Entra tenant ID', 'Directory (tenant) ID of the test firm')}
            {field('spaClientId', 'SPA client ID (test A)', 'Application ID of the "VoIPAU Sign-in PoC SPA" registration')}
            {field('apiScope', 'API scope (test A)', 'e.g. api://<api-client-id>/access_as_user')}
            {field('msalRedirectUri', 'MSAL redirect URI (test A)', `Blank = portal origin (${window.location.origin}/)`)}
            <Stack direction="row" spacing={2}>
              <Button variant="secondary" onClick={saveConfig}>Save settings</Button>
            </Stack>
          </Stack>
        </Paper>

        <Paper>
          <Stack spacing={2}>
            <Typography variant="h6">Tests</Typography>
            <Stack direction="row" spacing={2}>
              <Button onClick={runMsal} disabled={busy || !msalIncluded}>
                Test A: MSAL.js
              </Button>
              <Button onClick={runBroker} disabled={busy || !brokerTicket}>
                Test B: Backend broker
              </Button>
            </Stack>
          </Stack>
        </Paper>

        <Paper>
          <Typography variant="h6" gutterBottom>Results</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>Strategy</TableCell>
                <TableCell>Step</TableCell>
                <TableCell>Result</TableCell>
                <TableCell>Detail</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {results.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.at}</TableCell>
                  <TableCell>{r.strategy}</TableCell>
                  <TableCell>{r.step}</TableCell>
                  <TableCell>
                    <Chip label={r.ok ? 'Pass' : 'Fail'} color={r.ok ? 'success' : 'error'} />
                  </TableCell>
                  <TableCell sx={{ wordBreak: 'break-word' }}>{r.detail}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        {whoami !== undefined && (
          <Paper>
            <Typography variant="h6" gutterBottom>Backend /api/whoami response</Typography>
            {Code ? (
              <Code>{JSON.stringify(whoami, null, 2)}</Code>
            ) : (
              <Typography variant="body2">{JSON.stringify(whoami)}</Typography>
            )}
          </Paper>
        )}

        {violations.length > 0 && (
          <Paper>
            <Typography variant="h6" gutterBottom>Content Security Policy violations</Typography>
            <Table size="small">
              <TableBody>
                {violations.map((v, i) => (
                  <TableRow key={i}>
                    <TableCell>{v.directive}</TableCell>
                    <TableCell sx={{ wordBreak: 'break-all' }}>{v.blocked}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Stack>
    </PageTemplate>
  );
}
