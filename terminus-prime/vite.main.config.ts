import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        'ssh2',
        'keytar',
        'argon2', // Added argon2 to externals
        // Add other modules that should be externalized here if needed
      ],
    },
  },
  // It might also be necessary to ensure the resolver doesn't try to process .node files
  // or that the commonjs plugin (if explicitly used, though usually managed by vite/electron-vite plugin)
  // is configured to ignore these. However, 'external' is the primary mechanism.
});
