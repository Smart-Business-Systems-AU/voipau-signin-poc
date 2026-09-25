import type { HorizonContext } from '@netsapiens/horizon-sdk';
import { useEffect, useMemo, useRef } from 'react';
import { HorizonContextProvider, useRemoteApp } from '@netsapiens/horizon-sdk';

import SignInPocPage from './pages/SignInPocPage';

// Injected by webpack's DefinePlugin from the ModuleFederationPlugin `name`.
declare const __MF_NAME__: string;

export default function App(horizonContext: HorizonContext) {
  const { sdk } = useRemoteApp(horizonContext, __MF_NAME__);

  // Read the LATEST context at render (the host rebuilds it on every colour-mode
  // change) while keeping the memoized page wrapper's identity stable.
  const contextRef = useRef(horizonContext);
  contextRef.current = horizonContext;

  const SignInPocRoute = useMemo(
    () =>
      function SignInPocRoute() {
        return (
          <HorizonContextProvider context={contextRef.current}>
            <SignInPocPage />
          </HorizonContextProvider>
        );
      },
    [],
  );

  useEffect(() => {
    sdk
      .registerRoute({
        id: 'voipau-signin-poc.main',
        parentPath: '/apps',
        path: 'voipau-signin-poc',
        label: 'VoIPAU Sign-in PoC',
        icon: 'mdi:microsoft',
        placement: { last: true },
        // Deliberately no `requiredScopes`: the proof of concept must be
        // reachable by every signed-in user type (end users, managers and
        // admins), and no single tier covers all of them. A production route
        // must declare its audience.
        component: SignInPocRoute,
      })
      .catch((error) =>
        console.error('[voipau-signin-poc] route registration failed:', error),
      );
  }, [sdk, SignInPocRoute]);

  return null;
}
