# VoIPAU Sign-in PoC (Horizon app)

Federated remote app for NetSapiens Horizon that tests Microsoft 365 sign-in from inside Horizon.
Setup, Entra registrations, hosting and the test procedure are in [../README.md](../README.md).

    npm install
    npm run dev                 # http://localhost:5010/remoteEntry.js
    npm run build               # with MSAL.js (strategies A and B)
    npm run build:broker-only   # without MSAL.js (strategy B only)
    npm run verify              # platform bundle checks against dist/

Registration: `webpack_module` = `voipauSigninPoc` (app id `voipau-signin-poc`), page at
`/apps/voipau-signin-poc`.

## Hosting (GitHub Pages)

Remote entry URL: `https://smart-business-systems-au.github.io/voipau-signin-poc/remoteEntry.js`

Every push to `main` runs `.github/workflows/deploy-pages.yml`: `npm ci` → typecheck → build →
`horizon-verify-bundle` → publish `dist/` (with source maps) to Pages. `dist/` is never committed.

- **Bump `version` in `package.json` with every change to the bundle**, then press **Deploy** for
  the app in Horizon (Platform → UI SDK Management → Registered Apps) once the Pages run has
  finished. The workflow refuses to publish changed bytes under an unchanged version.
- To publish the MSAL-free variant: Actions → *Deploy to GitHub Pages* → Run workflow →
  variant `broker-only` (bump the version first).
- The Horizon operator must approve the `smart-business-systems-au.github.io` origin (the SDK
  demo notes `*.github.io` is approved on its host; confirm on yours).
