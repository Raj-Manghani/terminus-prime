/**
 * Webpack configuration for the main process.
 */
module.exports = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './src/main.ts', // Use the TypeScript main file
  // Put it into the `.webpack/main` folder
  output: {
    path: require('path').resolve(__dirname, '.webpack', 'main'), // Explicit output path
    filename: 'index.js',
    libraryTarget: 'commonjs2',
  },
  // Tell Webpack to target Electron's main process environment
  target: 'electron-main',
  // Set the mode to 'development' or 'production'
  mode: process.env.NODE_ENV || 'development',
  // Add source map support for easier debugging
  devtool: 'source-map',
  module: {
    rules: [
      // Use ts-loader for .ts files
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true, // Speeds up compilation
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.ts', '.json'],
  },
  node: {
    __dirname: false,
    __filename: false,
  },
};
