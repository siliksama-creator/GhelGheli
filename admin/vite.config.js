import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Using the React 17+ "automatic" JSX runtime (enabled by @vitejs/plugin-react)
// means individual components never need `import React from 'react'` just to
// use JSX — one less thing to remember across dozens of small page/component
// files in the new modular admin structure.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
  },
  preview: {
    host: '0.0.0.0',
  },
});
