const path = require('path');
const webpack = require('webpack');
const { merge } = require('webpack-merge');

// Import existing environment-specific configs
const devConfig = require('./webpack/dev');
const prodConfig = require('./webpack/prod');

// Node.js polyfills configuration for compatibility with Node.js 22+
const nodePolyfillsConfig = {
  resolve: {
    fallback: {
      // Provide fallbacks for Node.js core modules
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      buffer: require.resolve('buffer'),
      util: require.resolve('util'),
      process: require.resolve('process/browser'),
    },
  },
  plugins: [
    // Provide global variables that webpack no longer automatically polyfills
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),
    // Set environment variables needed for Node.js 22 compatibility
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    }),
    // Handle the issue with digital envelope routines in Node.js 17+
    new webpack.EnvironmentPlugin({
      // Set default for NODE_OPTIONS to use legacy OpenSSL provider
      // This is only used during build time
      NODE_OPTIONS: '--openssl-legacy-provider',
    }),
  ],
};

// Determine which environment config to use
const environmentConfig = process.env.NODE_ENV === 'production' ? prodConfig : devConfig;

// Export merged configuration
module.exports = merge(nodePolyfillsConfig, environmentConfig);

