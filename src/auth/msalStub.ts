// Stands in for @azure/msal-browser in `npm run build:broker-only` builds (see
// webpack.config.js). Never executed: the MSAL branch is behind __INCLUDE_MSAL__.
// It carries one export so webpack emits a source map for its chunk.
export const isMsalStub = true;
