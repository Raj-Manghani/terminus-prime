const rules = require('./webpack.rules');
const plugins = require('./webpack.plugins');
const webpack = require('webpack');

rules.push({
  test: /\.css$/,
  use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
});

module.exports = {
  // Entry point is defined in forge.config.js and injected by the plugin
  module: {
    rules,
  },
  plugins: [
    ...plugins,
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    }),
    // new NodePolyfillPlugin(), // Remove polyfill plugin
  ],
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
    // No fallback needed
  },
  // Target the Electron renderer process
  target: 'electron-renderer', // Keep this target
  // Set the mode to 'development' or 'production'
  mode: process.env.NODE_ENV || 'development',
  // Add source map support
  devtool: 'inline-source-map',
};
