import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config
export default defineConfig({
  plugins: [
    react({
      // Explicitly set the JSX runtime to automatic, which corresponds to
      // "jsx": "react-jsx" in tsconfig.json.
      jsxRuntime: 'automatic',
    }),
  ],
  // Explicitly configure esbuild for JSX handling to ensure alignment.
  // Vite's esbuild options are merged with those from @vitejs/plugin-react.
  // This provides a more direct instruction to esbuild.
  esbuild: {
    jsx: 'automatic', // Corresponds to tsconfig's "react-jsx"
    // jsxImportSource: 'react', // Default for 'automatic' is 'react'
  },
});
