const HtmlWebpackPlugin = require('html-webpack-plugin');
const ModuleFederationPlugin = require('webpack/lib/container/ModuleFederationPlugin');
const { SubresourceIntegrityPlugin } = require('webpack-subresource-integrity');
const webpack = require('webpack');
const path = require('path');

// The ONE identifier you maintain — the Module Federation container name in
// camelCase. It is the federation `name`, it is injected into the bundle as
// `__MF_NAME__` for `useRemoteApp(...)`, and it is the registration's
// `webpack_module`. The host derives the kebab-case id (voipau-signin-poc).
const MODULE_NAME = 'voipauSigninPoc';

module.exports = (env = {}, argv) => {
  const isProduction = argv.mode === 'production';
  // `npm run build:broker-only` drops MSAL.js from the bundle entirely, so
  // strategy B can still be tested if Horizon's analyser rejects MSAL's code.
  const includeMsal = !env.brokerOnly;

  return {
    mode: argv.mode || 'development',
    entry: './src/App.tsx',
    // REQUIRED. Bundle verification rejects a bundle with no source maps, and
    // the maps must carry `sourcesContent`; `dist/*.map` must be published.
    devtool: 'source-map',
    output: {
      path: path.resolve(__dirname, 'dist'),
      publicPath: isProduction ? 'auto' : 'http://localhost:5010/',
      filename: isProduction ? '[name].[contenthash].js' : '[name].js',
      chunkFilename: isProduction ? '[id].[contenthash].js' : '[id].js',
      // REQUIRED for SRI to be enforced on cross-origin chunks.
      crossOriginLoading: 'anonymous',
      clean: true,
    },
    // Prevents an empty split chunk that leaves an unresolvable integrity
    // placeholder once react-dom is in the graph.
    optimization: { splitChunks: { cacheGroups: { default: false } } },

    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.jsx'],
      // Broker-only builds resolve MSAL to an empty stub of our own, so none of
      // its code is emitted and the stub chunk still gets a source map. (The
      // __INCLUDE_MSAL__ branch alone is not enough: Babel's async-function
      // transform hides the constant `if` from webpack.)
      ...(includeMsal
        ? {}
        : { alias: { '@azure/msal-browser$': path.resolve(__dirname, 'src/auth/msalStub.ts') } }),
    },
    module: {
      rules: [
        {
          test: /\.(ts|tsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                '@babel/preset-env',
                ['@babel/preset-react', { runtime: 'automatic' }],
                '@babel/preset-typescript',
              ],
            },
          },
        },
      ],
    },
    plugins: [
      new ModuleFederationPlugin({
        name: MODULE_NAME,
        filename: 'remoteEntry.js',
        exposes: { './App': './src/App' },
        // Host-provided singletons only. Never add @netsapiens/horizon-sdk or
        // @azure/msal-browser here — neither is provided by the host.
        shared: {
          react: { singleton: true, requiredVersion: '^19.2.0', eager: false },
          'react-dom': { singleton: true, requiredVersion: '^19.2.0', eager: false },
          loglevel: { singleton: true, requiredVersion: '^1.9.2', eager: false },
        },
      }),
      // REQUIRED in production: per-chunk integrity values.
      ...(isProduction
        ? [new SubresourceIntegrityPlugin({ hashFuncNames: ['sha384'] })]
        : []),
      new webpack.DefinePlugin({
        __MF_NAME__: JSON.stringify(MODULE_NAME),
        __INCLUDE_MSAL__: JSON.stringify(includeMsal),
      }),
      new HtmlWebpackPlugin({ template: './index.html' }),
    ],
    devServer: { port: 5010, headers: { 'Access-Control-Allow-Origin': '*' } },
  };
};
