module.exports = {
  packagerConfig: {
    asar: true, // Package into an asar archive
  },
  rebuildConfig: {}, // Optional: Add rebuild config if needed later
  makers: [
    { name: '@electron-forge/maker-squirrel' }, // Windows installer
    { name: '@electron-forge/maker-zip', platforms: ['darwin'] }, // macOS zip
    { name: '@electron-forge/maker-deb', config: {} }, // Debian package
    { name: '@electron-forge/maker-rpm', config: {} }, // Red Hat package
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-webpack',
      config: {
        mainConfig: './webpack.main.config.js', // Restore explicit main config path
        // The entry point itself is defined within webpack.main.config.js
        renderer: {
          config: './webpack.renderer.config.js', // Restore explicit renderer config path
          entryPoints: [
            {
              html: './src/index.html', // HTML template
              js: './src/renderer.tsx', // Renderer source entry - Correct
              name: 'main_window', // Entry point name
              // No preload script needed with nodeIntegration: true
            },
          ],
        },
        port: 3111, // Changed port for webpack-dev-server
        loggerPort: 9001, // Port for the logger server
      },
    },
  ],
};
