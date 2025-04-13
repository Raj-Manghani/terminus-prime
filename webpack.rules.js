module.exports = [
  // Add support for native node modules if needed later
  // {
  //   test: /native_modules[/\\].+\.node$/,
  //   use: 'node-loader',
  // },
  // {
  //   test: /[/\\]node_modules[/\\].+\.(m?js|node)$/,
  //   parser: { amd: false },
  //   use: {
  //     loader: '@vercel/webpack-asset-relocator-loader',
  //     options: {
  //       outputAssetBase: 'native_modules',
  //     },
  //   },
  // },
  {
    // Typescript loader for TS and TSX files
    test: /\.tsx?$/,
    exclude: /(node_modules|\.webpack)/,
    use: {
      loader: 'ts-loader',
      options: {
        transpileOnly: true, // Speeds up compilation
      },
    },
  },
];
