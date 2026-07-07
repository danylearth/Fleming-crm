import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  esbuild: {
    // Strip console/debugger from production bundles; dev is unaffected
    drop: mode === 'production' ? (['console', 'debugger'] as const) : [],
  },
  test: {
    globals: true,
    environment: 'node',
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
}))
