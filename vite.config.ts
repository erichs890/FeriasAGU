import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  // App local/offline: o ExcelJS (~1 MB) num único chunk não é problema.
  build: { chunkSizeWarningLimit: 1500 },
  test: { environment: 'node' },
} as never);
